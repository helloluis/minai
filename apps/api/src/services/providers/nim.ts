/**
 * NVIDIA NIM Provider — OpenAI-compatible API
 * Supports any model hosted on NIM (Llama, Qwen, DeepSeek, Mistral, etc.)
 */

import type {
  LLMProvider,
  ProviderOptions,
  ProviderStreamChunk,
  ToolCallInfo,
} from './types.js';

const ENDPOINT = 'https://integrate.api.nvidia.com/v1/chat/completions';

interface NIMStreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class NIMProvider implements LLMProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
    console.log('[NIM] Provider initialized');
  }

  async *stream(options: ProviderOptions): AsyncGenerator<ProviderStreamChunk> {
    const { model, messages, enableThinking = false, temperature = 0.7, maxTokens = 8192, tools } = options;

    const requestBody: Record<string, unknown> = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
      stream: true,
    };

    if (enableThinking) {
      requestBody.thinking = { type: 'enabled', budget_tokens: Math.min(maxTokens, 4096) };
    }

    if (tools && tools.length > 0) {
      requestBody.tools = tools;
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
      console.error(`[NIM] Error (model: ${model}):`, response.status, errorText);

      if (response.status === 429) {
        yield { type: 'error', error: 'Rate limited — please try again in a moment.' };
      } else {
        yield { type: 'error', error: `NIM API error: ${response.status}` };
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
    const toolCallAccum = new Map<number, { id: string; name: string; arguments: string }>();

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
          const chunk = JSON.parse(trimmed.slice(6)) as NIMStreamChunk;

          // Usage (NIM may include it in final chunk)
          if (chunk.usage) {
            yield {
              type: 'usage',
              usage: {
                inputTokens: chunk.usage.prompt_tokens,
                outputTokens: chunk.usage.completion_tokens,
                cost: 0, // NIM free tier; actual cost tracked via pricing.ts markup
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

          // Accumulate tool call fragments
          if (choice.delta.tool_calls) {
            for (const tc of choice.delta.tool_calls) {
              const existing = toolCallAccum.get(tc.index);
              if (existing) {
                if (tc.function?.arguments) {
                  existing.arguments += tc.function.arguments;
                }
              } else {
                toolCallAccum.set(tc.index, {
                  id: tc.id || `call_${tc.index}`,
                  name: tc.function?.name || '',
                  arguments: tc.function?.arguments || '',
                });
              }
            }
          }

          // Emit accumulated tool calls on finish
          if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop' && toolCallAccum.size > 0) {
            const toolCalls: ToolCallInfo[] = [];
            for (const [, tc] of toolCallAccum) {
              if (tc.name) {
                toolCalls.push(tc);
              }
            }
            if (toolCalls.length > 0) {
              yield { type: 'tool_call', toolCalls };
            }
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    // If usage wasn't in the stream, emit zero-cost usage so the router doesn't break
    // (NIM doesn't always include usage in streaming responses)

    yield { type: 'done' };
  }

  /**
   * Non-streaming completion — used for Auto mode classification
   */
  async complete(
    messages: import('./types.js').ProviderMessage[],
    model = 'meta/llama-3.3-70b-instruct',
    maxTokens = 32
  ): Promise<{ content: string; usage: { inputTokens: number; outputTokens: number; cost: number } | null }> {
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
      throw new Error(`NIM error ${response.status}: ${errorText}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string | null } }>;
      usage?: { prompt_tokens: number; completion_tokens: number };
    };

    const content = data.choices[0]?.message?.content || '';
    let usage: { inputTokens: number; outputTokens: number; cost: number } | null = null;

    if (data.usage) {
      usage = {
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
        cost: 0,
      };
    }

    return { content, usage };
  }
}
