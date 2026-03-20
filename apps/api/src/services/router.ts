/**
 * LLM Router — handles Auto/Fast/Deep mode routing with tool-use loop
 */

import type { LLMMode, LLMClassification, ModelId, StreamChunk, TokenUsage } from '@minai/shared';
import type { ProviderMessage, ProviderStreamChunk, ToolDefinition, ToolCallInfo } from './providers/types.js';
import { DashScopeProvider } from './providers/dashscope.js';
import { SYSTEM_PROMPT, AUTO_CLASSIFIER_PROMPT } from '../config/system-prompt.js';
import { calculateCost } from '../config/pricing.js';
import * as db from './db.js';
import { triggerCompaction, getCompactedContext } from './compaction.js';
import { extractMemories } from './memory.js';
import { detectAndExecuteTools } from './tool-runner.js';
import { executeTool, TOOL_DEFINITIONS } from './tools.js';
import type { ContextImage } from './tools.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);

const MODEL_FAST: ModelId = 'qwen3.5-flash';
const MODEL_DEEP: ModelId = 'qwen3.5-plus';
const MAX_TOOL_ITERATIONS = 10;

// Classifier config — switch via env vars
const CLASSIFIER_PROVIDER = process.env.CLASSIFIER_PROVIDER ?? 'dashscope'; // 'dashscope' | 'ollama'
const CLASSIFIER_COMPARE = process.env.CLASSIFIER_COMPARE === 'true';        // run both, log disagreements
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3.5:0.8B';

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

type ClassifyResult = { classification: 'simple' | 'balanced' | 'deep'; usage: TokenUsage | null };

function parseClassification(raw: string): 'simple' | 'balanced' | 'deep' {
  const s = raw.trim().toLowerCase();
  return s === 'deep' ? 'deep' : s === 'balanced' ? 'balanced' : 'simple';
}

/** Classify via DashScope (qwen3.5-flash) */
async function classifyWithDashscope(userMessage: string, recentContext?: string): Promise<ClassifyResult & { latencyMs: number }> {
  const t0 = Date.now();
  const classifierInput = recentContext
    ? `Recent conversation:\n${recentContext}\n\nLatest message to classify:\n${userMessage}`
    : userMessage;
  try {
    const { content, usage } = await provider.complete(
      [
        { role: 'system', content: AUTO_CLASSIFIER_PROMPT },
        { role: 'user', content: classifierInput },
      ],
      MODEL_FAST,
      16
    );
    const latencyMs = Date.now() - t0;
    return { classification: parseClassification(content), usage: usage ?? null, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    console.error('[Router:dashscope] Classification failed:', err);
    return { classification: 'simple', usage: null, latencyMs };
  }
}

/** Classify via local Ollama */
async function classifyWithOllama(userMessage: string, recentContext?: string): Promise<ClassifyResult & { latencyMs: number }> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        messages: [
          { role: 'system', content: AUTO_CLASSIFIER_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 16,
        temperature: 0,
        stream: false,
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json() as { choices: { message: { content: string } }[] };
    const content = data.choices?.[0]?.message?.content ?? '';
    const latencyMs = Date.now() - t0;
    return { classification: parseClassification(content), usage: null, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    console.error('[Router:ollama] Classification failed, falling back to dashscope:', err);
    // Fall back to dashscope on Ollama error
    const fallback = await classifyWithDashscope(userMessage);
    return { ...fallback, latencyMs: latencyMs + fallback.latencyMs };
  }
}

/**
 * Classify a prompt into simple / balanced / deep.
 * Uses CLASSIFIER_PROVIDER env var to select the backend.
 * If CLASSIFIER_COMPARE=true, runs both in parallel and logs disagreements.
 */
async function classifyPrompt(userMessage: string, recentContext?: string): Promise<ClassifyResult> {
  const preview = userMessage.slice(0, 60).replace(/\n/g, ' ');

  if (CLASSIFIER_COMPARE) {
    const [primary, secondary] = CLASSIFIER_PROVIDER === 'ollama'
      ? await Promise.all([classifyWithOllama(userMessage, recentContext), classifyWithDashscope(userMessage, recentContext)])
      : await Promise.all([classifyWithDashscope(userMessage, recentContext), classifyWithOllama(userMessage, recentContext)]);

    const agree = primary.classification === secondary.classification;
    const primaryName = CLASSIFIER_PROVIDER === 'ollama' ? 'ollama' : 'dashscope';
    const secondaryName = CLASSIFIER_PROVIDER === 'ollama' ? 'dashscope' : 'ollama';

    console.log(
      `[Classifier] "${preview}" → ${primary.classification} (${primaryName} ${primary.latencyMs}ms) | ` +
      `${secondary.classification} (${secondaryName} ${secondary.latencyMs}ms) | ${agree ? '✓ agree' : '⚠ DISAGREE'}`
    );

    return { classification: primary.classification, usage: primary.usage };
  }

  if (CLASSIFIER_PROVIDER === 'ollama') {
    const result = await classifyWithOllama(userMessage, recentContext);
    console.log(`[Classifier:ollama] "${preview}" → ${result.classification} (${result.latencyMs}ms)`);
    return { classification: result.classification, usage: result.usage };
  }

  const result = await classifyWithDashscope(userMessage, recentContext);
  console.log(`[Classifier:dashscope] "${preview}" → ${result.classification} (${result.latencyMs}ms)`);
  return { classification: result.classification, usage: result.usage };
}

/**
 * Build conversation history for the LLM from database messages.
 */
/** Scan history for the most recent image — user upload or a previously generated /api/uploads/ URL */
const IMAGE_CONTEXT_LOOKBACK = 6; // only look back this many messages for context images

/**
 * Scan recent history for ALL images — both user uploads and generated ones.
 * Returns newest-first so index 0 = most recent image.
 */
function findContextImages(chatHistory: { role: string; images?: string[] | null; content: string }[]): ContextImage[] {
  const results: ContextImage[] = [];
  const start = Math.max(0, chatHistory.length - IMAGE_CONTEXT_LOOKBACK);

  for (let i = chatHistory.length - 1; i >= start; i--) {
    const msg = chatHistory[i];

    // User-uploaded images (base64)
    if (msg.images?.length) {
      results.push({
        url: msg.images[0],
        source: 'user',
        label: `User-uploaded photo (message ${i + 1})`,
      });
    }

    // Generated/edited images in assistant messages (persisted URLs)
    if (msg.role === 'assistant' && msg.content) {
      const imgMatches = msg.content.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)]+\/api\/uploads\/[^)]+)\)/g);
      for (const m of imgMatches) {
        results.push({
          url: m[1],
          source: 'generated',
          label: `AI-generated image (message ${i + 1})`,
        });
      }
    }
  }

  console.log(`[Router] findContextImages: found ${results.length} image(s) — ${results.filter(i => i.source === 'user').length} user, ${results.filter(i => i.source === 'generated').length} generated`);
  return results;
}

async function buildMessages(
  conversationId: string,
  userId: string,
  currentMessage: string,
  images?: string[]
): Promise<{ messages: ProviderMessage[]; contextImages: ContextImage[] }> {
  const messages: ProviderMessage[] = [];

  // System prompt with user memories
  const memories = await db.getUserMemories(userId);
  const user = await db.getUserById(userId);
  let systemPrompt = SYSTEM_PROMPT;

  // Inject current date/time in user's timezone
  const tz = user?.timezone ?? 'UTC';
  const now = new Date();
  const userDate = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: tz });
  const userTime = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: tz });
  systemPrompt += `\n\n## Current Date & Time\nRight now it is **${userDate}** at **${userTime}** (${tz}). Always use this when the user references "today", "tomorrow", "yesterday", "this week", etc.`;

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

  // Conversation history (recent messages only); skip widget-only messages
  const history = await db.getMessages(conversationId, 30);
  const chatHistory = history.filter((m) => !m.widget_data);

  // On the very first message of a new conversation, if name is unknown, inject a signal
  const isFirstMessage = chatHistory.length === 0;
  const knowsName = memories.some((m) => m.key === 'name');
  if (isFirstMessage && !knowsName) {
    systemPrompt += '\n\n[SYSTEM NOTE: This is the user\'s FIRST message. Follow the "Greeting New Users" instructions above.]';
  }

  for (const msg of chatHistory) {
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

  // Collect all recent images from thread history (user uploads + generated)
  const contextImages = findContextImages(chatHistory);
  if (!images?.length && contextImages.length > 0) {
    const listing = contextImages.map((img, i) => `  [${i}] ${img.label} (${img.source})`).join('\n');
    messages.push({
      role: 'system',
      content: `[IMAGE CONTEXT: The following images from this conversation are pre-loaded and available for editing. The user does NOT need to re-upload.\n${listing}\nIf the user wants to edit, change, or iterate on any of these, call the \`edit_image\` tool. Use the \`image_index\` parameter to specify which image (default 0 = most recent). Do NOT ask the user to re-upload.]`,
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

  return { messages, contextImages };
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
  // Determine model and thinking mode
  let model: ModelId;
  let enableThinking: boolean;
  let classification: LLMClassification;
  let classifierUsage: TokenUsage | null = null;
  if (mode === 'fast') {
    model = MODEL_FAST;
    enableThinking = false;
    classification = 'simple';
  } else if (mode === 'balanced') {
    model = MODEL_DEEP;
    enableThinking = false;
    classification = 'balanced';
  } else if (mode === 'deep') {
    model = MODEL_DEEP;
    enableThinking = true;
    classification = 'deep';
  } else {
    // Auto mode: 3-way classify → simple / balanced / deep
    // Fetch last 4 messages for classifier context (so "yes" after a tool prompt gets classified correctly)
    const recentMsgs = await db.getMessages(conversationId, 4);
    const recentContext = recentMsgs.length > 0
      ? recentMsgs.map((m) => `[${m.role}]: ${m.content.slice(0, 200)}`).join('\n')
      : undefined;

    const result = await classifyPrompt(userMessage, recentContext);
    classifierUsage = result.usage;
    classification = result.classification;
    if (classification === 'deep') {
      model = MODEL_DEEP;
      enableThinking = true;
    } else if (classification === 'balanced') {
      model = MODEL_DEEP;
      enableThinking = false;
    } else {
      model = MODEL_FAST;
      enableThinking = false;
    }
    console.log(`[Router] Auto classified "${userMessage.slice(0, 50)}..." as ${classification} → ${model}${enableThinking ? ' (thinking)' : ''}`);
  }

  // Emit start event with classification so the client can show the right placeholder
  yield {
    type: 'start',
    messageId,
    model,
    classification,
  };

  // Force deep model for images (only Qwen Plus supports multimodal)
  if (images && images.length > 0 && model !== MODEL_DEEP) {
    console.log(`[Router] Overriding model to ${MODEL_DEEP} for image input`);
    model = MODEL_DEEP;
    enableThinking = false;
  }

  // Build messages
  const { messages, contextImages } = await buildMessages(conversationId, userId, userMessage, images);
  // Images available for tools: current-message uploads first, then thread context images
  const imageContext = images?.length
    ? images.map((url) => ({ url, source: 'user' as const, label: 'Current message upload' }))
    : contextImages;
  console.log(`[Router] imageContext: ${imageContext.length} image(s)${imageContext.length > 0 ? `, first=${imageContext[0].url.slice(0, 60)}` : ''}`);

  if (images && images.length > 0) {
    console.log(`[Router] Sending ${images.length} image(s) to ${model}, first image size: ${images[0].length} chars`);
  }

  // Stream with tool-use loop
  const tools = getProviderTools();
  let totalUsage: TokenUsage | null = classifierUsage ? { ...classifierUsage } : null;
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
        const toolResult = await executeTool(tc.name, args, userId, imageContext, conversationId);
        messages.push({
          role: 'tool',
          content: toolResult.content,
          tool_call_id: tc.id,
        });

        // Accumulate any fixed tool costs (e.g. image generation)
        if (toolResult.cost_usd) {
          if (totalUsage) {
            totalUsage.cost = (totalUsage.cost ?? 0) + toolResult.cost_usd;
          } else {
            totalUsage = { inputTokens: 0, outputTokens: 0, cost: toolResult.cost_usd };
          }
          console.log(`[Router] Tool ${tc.name} added cost: $${toolResult.cost_usd}`);
        }

        // Emit action chunks for frontend directives embedded in tool results
        try {
          const parsed = JSON.parse(toolResult.content);
          const actions: { navigate?: string; open_sidebar?: boolean } = {};
          if (parsed.__navigate__) actions.navigate = parsed.__navigate__;
          if (parsed.__open_sidebar__) actions.open_sidebar = true;
          if (Object.keys(actions).length > 0) {
            yield { type: 'action', actions };
          }
        } catch { /* not JSON or no action directives */ }
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
    const tokenCost = calculateCost(model, totalUsage.inputTokens, totalUsage.outputTokens);
    const toolCostAccum = totalUsage.cost ?? 0; // accumulated fixed tool costs (e.g. image gen)
    const cost = tokenCost + toolCostAccum;
    await db.updateMessageTokens(messageId, totalUsage.inputTokens, totalUsage.outputTokens, cost);

    // Deduct from free credit first ($1.00 USD), then charge balance for remainder
    const freeCreditUsed = await db.deductFreeCredit(userId, cost);
    const chargeableCost = cost - freeCreditUsed;
    console.log(`[Router] Cost: $${cost.toFixed(6)}, freeCreditUsed: $${freeCreditUsed.toFixed(6)}, chargeable: $${chargeableCost.toFixed(6)}`);

    if (chargeableCost > 0) {
      await db.deductBalance(userId, chargeableCost);
      await db.recordPayment(userId, -chargeableCost, 'usage');
    }

    // Fetch updated balance to send to client
    const updatedBalance = await db.getBalance(userId);
    console.log(`[Router] Updated balance: free_credit=$${updatedBalance?.free_credit_usd}, paid=$${updatedBalance?.balance_usd}`);

    // Fetch updated user to pick up any display_name set via set_preferred_name tool
    const updatedUser = await db.getUserById(userId);

    yield {
      type: 'usage',
      usage: { ...totalUsage, cost },
      balance: updatedBalance ? {
        balance_usd: updatedBalance.balance_usd,
        free_credit_usd: updatedBalance.free_credit_usd,
        balance_high_water: updatedBalance.balance_high_water,
      } : undefined,
      display_name: updatedUser?.display_name ?? null,
    };
  }

  yield { type: 'done', messageId };

  // Fire-and-forget: compact old messages and extract user memories
  triggerCompaction(conversationId);
  extractMemories(userId, userMessage);
}
