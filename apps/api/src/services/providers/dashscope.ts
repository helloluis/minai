/**
 * Alibaba Cloud DashScope Provider — OpenAI-compatible API
 * Supports Qwen 3.5 Flash and Qwen 3.5 Plus with prefix caching and reasoning
 */

import type {
  LLMProvider,
  ProviderMessage,
  ProviderOptions,
  ProviderStreamChunk,
} from './types.js';
import type { TokenUsage } from '@minai/shared';

// DashScope pricing per million tokens (Alibaba's actual cost — we mark up in pricing.ts)
const DASHSCOPE_PRICING: Record<string, { input: number; output: number }> = {
  'qwen-turbo-latest': { input: 0.10, output: 0.50 },
  'qwen-plus-latest': { input: 0.50, output: 2.50 },
};

const CACHE_HIT_MULTIPLIER = 0.1;
const CACHE_CREATION_MULTIPLIER = 1.25;

const ENDPOINT = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';

interface DashScopeStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      cache_creation_input_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
    };
  };
}

export class DashScopeProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[DashScope] Provider initialized');
  }

  private getPricing(model: string) {
    return DASHSCOPE_PRICING[model] || DASHSCOPE_PRICING['qwen-plus-latest'];
  }

  /**
   * Apply prefix caching markers to system prompt and conversation history.
   * DashScope supports ephemeral cache markers — hit = 10% cost, creation = 125% cost.
   * Each cached block must be ≥1024 tokens. TTL is 5 minutes (resets on hit).
   */
  private applyCacheMarkers(messages: ProviderMessage[]): unknown[] {
    const result: unknown[] = [];

    let historyBoundary = -1;
    for (let i = messages.length - 2; i >= 1; i--) {
      if (messages[i].role === 'assistant' || messages[i].role === 'user') {
        historyBoundary = i;
        break;
      }
    }

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];

      // Cache system prompt
      if (msg.role === 'system' && typeof msg.content === 'string') {
        result.push({
          role: 'system',
          content: [
            {
              type: 'text',
              text: msg.content,
              cache_control: { type: 'ephemeral' },
            },
          ],
        });
        continue;
      }

      // Cache conversation history prefix
      if (i === historyBoundary && i >= 3 && typeof msg.content === 'string') {
        result.push({
          ...msg,
          content: [
            {
              type: 'text',
              text: msg.content,
              cache_control: { type: 'ephemeral' },
            },
          ],
        });
        continue;
      }

      result.push(msg);
    }

    return result;
  }

  async *stream(options: ProviderOptions): AsyncGenerator<ProviderStreamChunk> {
    const { model, messages, enableThinking = false, temperature = 0.7, maxTokens = 8192 } = options;

    const processedMessages = this.applyCacheMarkers(messages);

    const requestBody: Record<string, unknown> = {
      model,
      messages: processedMessages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      stream_options: { include_usage: true },
    };

    if (enableThinking) {
      requestBody.enable_thinking = true;
    }

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[DashScope] Error (model: ${model}):`, response.status, errorText);

      if (response.status === 429) {
        yield { type: 'error', error: 'Minai is a bit busy right now — please try again in a moment.' };
      } else {
        yield { type: 'error', error: `API error: ${response.status}` };
      }
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield { type: 'error', error: 'No response body' };
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    const pricing = this.getPricing(model);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;

        try {
          const chunk = JSON.parse(trimmed.slice(6)) as DashScopeStreamChunk;

          // Handle usage from final chunk
          if (chunk.usage) {
            const cacheHitTokens = chunk.usage.prompt_tokens_details?.cached_tokens || 0;
            const cacheCreationTokens = chunk.usage.prompt_tokens_details?.cache_creation_input_tokens || 0;
            const normalInputTokens = chunk.usage.prompt_tokens - cacheHitTokens - cacheCreationTokens;

            const normalInputCost = (normalInputTokens * pricing.input) / 1_000_000;
            const cacheHitCost = (cacheHitTokens * pricing.input * CACHE_HIT_MULTIPLIER) / 1_000_000;
            const cacheCreationCost = (cacheCreationTokens * pricing.input * CACHE_CREATION_MULTIPLIER) / 1_000_000;
            const outputCost = (chunk.usage.completion_tokens * pricing.output) / 1_000_000;

            if (cacheHitTokens > 0) {
              console.log(`[DashScope] Cache hit: ${cacheHitTokens} tokens`);
            }

            yield {
              type: 'usage',
              usage: {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                cost: normalInputCost + cacheHitCost + cacheCreationCost + outputCost,
                cacheHitTokens: cacheHitTokens || undefined,
              },
            };
          }

          const choice = chunk.choices?.[0];
          if (!choice) continue;

          if (choice.delta.reasoning_content) {
            yield { type: 'thinking', content: choice.delta.reasoning_content };
          }

          if (choice.delta.content) {
            yield { type: 'content', content: choice.delta.content };
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    yield { type: 'done' };
  }

  /**
   * Non-streaming completion — used for Auto mode classification
   */
  async complete(
    messages: ProviderMessage[],
    model = 'qwen-turbo-latest',
    maxTokens = 32
  ): Promise<{ content: string; usage: TokenUsage | null }> {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.1,
        stream: false,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DashScope error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices[0]?.message?.content || '';
    let usage: TokenUsage | null = null;

    if (data.usage) {
      const pricing = this.getPricing(model);
      usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        cost: (data.usage.prompt_tokens * pricing.input + data.usage.completion_tokens * pricing.output) / 1_000_000,
      };
    }

    return { content, usage };
  }
}
