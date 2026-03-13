/**
 * LLM Router — handles Auto/Fast/Deep mode routing
 */

import type { LLMMode, ModelId, StreamChunk, TokenUsage } from '@minai/shared';
import type { ProviderMessage } from './providers/types.js';
import { DashScopeProvider } from './providers/dashscope.js';
import { SYSTEM_PROMPT, AUTO_CLASSIFIER_PROMPT } from '../config/system-prompt.js';
import { calculateCost } from '../config/pricing.js';
import * as db from './db.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);

const MODEL_FAST: ModelId = 'qwen-turbo-latest';
const MODEL_DEEP: ModelId = 'qwen-plus-latest';

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
  messages.push({ role: 'system', content: systemPrompt });

  // Conversation history
  const history = await db.getMessages(conversationId, 30);
  for (const msg of history) {
    messages.push({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
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
 * Stream a response for the given mode, yielding SSE-compatible chunks.
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

  // Build messages
  const messages = await buildMessages(conversationId, userId, userMessage, images);

  // Stream from provider
  const enableThinking = model === MODEL_DEEP;
  let totalUsage: TokenUsage | null = null;

  for await (const chunk of provider.stream({
    model,
    messages,
    enableThinking,
    temperature: 0.7,
    maxTokens: model === MODEL_DEEP ? 8192 : 4096,
  })) {
    switch (chunk.type) {
      case 'thinking':
        yield { type: 'thinking', content: chunk.content };
        break;
      case 'content':
        yield { type: 'chunk', content: chunk.content };
        break;
      case 'usage':
        totalUsage = chunk.usage!;
        break;
      case 'error':
        yield { type: 'error', error: chunk.error };
        return;
      case 'done':
        break;
    }
  }

  // Calculate and store token usage
  if (totalUsage) {
    const cost = calculateCost(model, totalUsage.inputTokens, totalUsage.outputTokens);
    await db.updateMessageTokens(messageId, totalUsage.inputTokens, totalUsage.outputTokens, cost);

    yield {
      type: 'usage',
      usage: { ...totalUsage, cost },
    };
  }

  yield { type: 'done', messageId };
}
