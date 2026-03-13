/**
 * LLM Router — handles Auto/Fast/Deep mode routing with tool-use loop
 */

import type { LLMMode, ModelId, StreamChunk, TokenUsage } from '@minai/shared';
import type { ProviderMessage, ProviderStreamChunk, ToolDefinition, ToolCallInfo } from './providers/types.js';
import { DashScopeProvider } from './providers/dashscope.js';
import { SYSTEM_PROMPT, AUTO_CLASSIFIER_PROMPT } from '../config/system-prompt.js';
import { calculateCost } from '../config/pricing.js';
import * as db from './db.js';
import { triggerCompaction, getCompactedContext } from './compaction.js';
import { extractMemories } from './memory.js';
import { detectAndExecuteTools } from './tool-runner.js';
import { executeTool, TOOL_DEFINITIONS } from './tools.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);

const MODEL_FAST: ModelId = 'qwen3.5-flash';
const MODEL_DEEP: ModelId = 'qwen3.5-plus';
const MAX_TOOL_ITERATIONS = 10;

/**
 * Convert our tool definitions to OpenAI-compatible format for the provider.
 */
function getProviderTools(): ToolDefinition[] {
  return TOOL_DEFINITIONS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }));
}

/**
 * Classify whether a prompt needs the deep model or can be handled by the fast model.
 */
async function classifyPrompt(userMessage: string): Promise<'simple' | 'complex'> {
  try {
    const { content } = await provider.complete(
      [
        { role: 'system', content: AUTO_CLASSIFIER_PROMPT },
        { role: 'user', content: userMessage },
      ],
      MODEL_FAST,
      16
    );
    const classification = content.trim().toLowerCase();
    return classification === 'complex' ? 'complex' : 'simple';
  } catch (err) {
    console.error('[Router] Classification failed, defaulting to fast:', err);
    return 'simple';
  }
}

/**
 * Build conversation history for the LLM from database messages.
 */
async function buildMessages(
  conversationId: string,
  userId: string,
  currentMessage: string,
  images?: string[]
): Promise<ProviderMessage[]> {
  const messages: ProviderMessage[] = [];

  // System prompt with user memories
  const memories = await db.getUserMemories(userId);
  let systemPrompt = SYSTEM_PROMPT;
  if (memories.length > 0) {
    const memoryContext = memories.map((m) => `- ${m.key}: ${m.value}`).join('\n');
    systemPrompt += `\n\n## What you know about this user\n${memoryContext}`;
  }
  // Include compacted context from older messages
  const compactedContext = await getCompactedContext(conversationId);
  if (compactedContext) {
    systemPrompt += `\n\n## Previous conversation context\n${compactedContext}`;
  }

  messages.push({ role: 'system', content: systemPrompt });

  // Conversation history (recent messages only)
  const history = await db.getMessages(conversationId, 30);
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    });
  }

  // Pre-detect tools from the user message and inject results
  // This handles the common case without needing a tool-use loop
  const toolResults = await detectAndExecuteTools(currentMessage);
  if (toolResults) {
    messages.push({
      role: 'system',
      content: `## Tool Results (live data)\n${toolResults}\n\nUse this data to answer the user's question. Present the information clearly.`,
    });
  }

  // Current user message
  if (images && images.length > 0) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: currentMessage },
        ...images.map((img) => ({
          type: 'image_url' as const,
          image_url: { url: img.startsWith('data:') ? img : `data:image/jpeg;base64,${img}` },
        })),
      ],
    });
  } else {
    messages.push({ role: 'user', content: currentMessage });
  }

  return messages;
}

export interface StreamResult {
  model: ModelId;
}

/**
 * Execute a single LLM stream pass, yielding chunks to the client.
 * Returns accumulated tool calls (if any) and content.
 */
async function* streamOnce(
  messages: ProviderMessage[],
  model: ModelId,
  enableThinking: boolean,
  tools?: ToolDefinition[]
): AsyncGenerator<
  ProviderStreamChunk,
  { toolCalls: ToolCallInfo[]; content: string; usage: TokenUsage | null }
> {
  let totalUsage: TokenUsage | null = null;
  let pendingToolCalls: ToolCallInfo[] = [];
  let content = '';

  for await (const chunk of provider.stream({
    model,
    messages,
    enableThinking,
    temperature: 0.7,
    maxTokens: model === MODEL_FAST ? 4096 : 8192,
    tools,
  })) {
    if (chunk.type === 'tool_call' && chunk.toolCalls) {
      pendingToolCalls = chunk.toolCalls;
    } else if (chunk.type === 'usage') {
      totalUsage = chunk.usage!;
    } else if (chunk.type === 'content') {
      content += chunk.content || '';
    }
    yield chunk;
  }

  return { toolCalls: pendingToolCalls, content, usage: totalUsage };
}

/**
 * Stream a response for the given mode, yielding SSE-compatible chunks.
 * Supports a tool-use loop: if the LLM requests tool calls, we execute them
 * and let it continue, up to MAX_TOOL_ITERATIONS.
 */
export async function* streamResponse(
  conversationId: string,
  userId: string,
  userMessage: string,
  mode: LLMMode,
  messageId: string,
  images?: string[]
): AsyncGenerator<StreamChunk> {
  // Determine model
  let model: ModelId;
  if (mode === 'fast') {
    model = MODEL_FAST;
  } else if (mode === 'deep') {
    model = MODEL_DEEP;
  } else {
    // Auto mode: classify first
    const classification = await classifyPrompt(userMessage);
    model = classification === 'complex' ? MODEL_DEEP : MODEL_FAST;
    console.log(`[Router] Auto classified "${userMessage.slice(0, 50)}..." as ${classification} → ${model}`);
  }

  // Emit start event
  yield {
    type: 'start',
    messageId,
    model,
  };

  // Force deep model for images (only Qwen Plus supports multimodal)
  if (images && images.length > 0 && model !== MODEL_DEEP) {
    console.log(`[Router] Overriding model to ${MODEL_DEEP} for image input`);
    model = MODEL_DEEP;
  }

  // Build messages
  const messages = await buildMessages(conversationId, userId, userMessage, images);

  if (images && images.length > 0) {
    console.log(`[Router] Sending ${images.length} image(s) to ${model}, first image size: ${images[0].length} chars`);
  }

  // Stream with tool-use loop
  const enableThinking = model === MODEL_DEEP;
  const tools = getProviderTools();
  let totalUsage: TokenUsage | null = null;
  let iterations = 0;

  while (iterations < MAX_TOOL_ITERATIONS) {
    iterations++;

    // Stream one pass
    const gen = streamOnce(messages, model, enableThinking, tools);
    let result: { toolCalls: ToolCallInfo[]; content: string; usage: TokenUsage | null };

    // Yield chunks from the generator, capturing the return value
    while (true) {
      const { value, done } = await gen.next();
      if (done) {
        result = value as { toolCalls: ToolCallInfo[]; content: string; usage: TokenUsage | null };
        break;
      }

      const chunk = value as ProviderStreamChunk;
      switch (chunk.type) {
        case 'thinking':
          yield { type: 'thinking', content: chunk.content };
          break;
        case 'content':
          yield { type: 'chunk', content: chunk.content };
          break;
        case 'error':
          yield { type: 'error', error: chunk.error };
          return;
        case 'tool_call':
        case 'usage':
        case 'done':
          // Handled via return value or below
          break;
      }
    }

    // Accumulate usage
    if (result.usage) {
      if (totalUsage) {
        totalUsage.inputTokens += result.usage.inputTokens;
        totalUsage.outputTokens += result.usage.outputTokens;
        totalUsage.cost = (totalUsage.cost || 0) + (result.usage.cost || 0);
      } else {
        totalUsage = { ...result.usage };
      }
    }

    // If no tool calls, we're done
    if (result.toolCalls.length === 0) {
      break;
    }

    // Execute tool calls and append results to messages
    console.log(`[Router] Tool loop iteration ${iterations}: ${result.toolCalls.map((t) => t.name).join(', ')}`);

    // Add the assistant message with tool_calls (OpenAI-compatible format)
    messages.push({
      role: 'assistant',
      content: result.content || null,
      tool_calls: result.toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: { name: tc.name, arguments: tc.arguments },
      })),
    } as ProviderMessage);

    // Execute each tool and add results
    for (const tc of result.toolCalls) {
      try {
        const args = JSON.parse(tc.arguments);
        const toolResult = await executeTool(tc.name, args);
        messages.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: tc.id,
        });
      } catch (err) {
        console.error(`[Router] Tool execution error for ${tc.name}:`, err);
        messages.push({
          role: 'tool',
          content: `Error executing ${tc.name}: ${err instanceof Error ? err.message : 'Unknown error'}`,
          tool_call_id: tc.id,
        });
      }
    }

    // Continue the loop — the next iteration will stream the LLM's response
    // with tool results in context
    console.log(`[Router] Continuing with ${result.toolCalls.length} tool result(s) injected`);
  }

  if (iterations >= MAX_TOOL_ITERATIONS) {
    console.warn(`[Router] Tool loop hit max iterations (${MAX_TOOL_ITERATIONS})`);
  }

  // Calculate token usage, deduct from free tier then balance
  if (totalUsage) {
    const cost = calculateCost(model, totalUsage.inputTokens, totalUsage.outputTokens);
    await db.updateMessageTokens(messageId, totalUsage.inputTokens, totalUsage.outputTokens, cost);

    // Deduct free tokens first (based on output tokens), then charge balance for remainder
    const freeTokensUsed = await db.deductFreeTokens(userId, totalUsage.outputTokens);
    const chargeableOutputTokens = totalUsage.outputTokens - freeTokensUsed;

    if (chargeableOutputTokens > 0) {
      const chargeableCost = calculateCost(model, totalUsage.inputTokens, chargeableOutputTokens);
      await db.deductBalance(userId, chargeableCost);
      await db.recordPayment(userId, -chargeableCost, 'usage');
    }

    // Fetch updated balance to send to client
    const updatedBalance = await db.getBalance(userId);

    yield {
      type: 'usage',
      usage: { ...totalUsage, cost },
      balance: updatedBalance ? {
        balance_usd: updatedBalance.balance_usd,
        free_tokens_remaining: updatedBalance.free_tokens_remaining,
      } : undefined,
    };
  }

  yield { type: 'done', messageId };

  // Fire-and-forget: compact old messages and extract user memories
  triggerCompaction(conversationId);
  extractMemories(userId, userMessage);
}
