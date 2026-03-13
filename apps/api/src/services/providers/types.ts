import type { ModelId, TokenUsage } from '@minai/shared';

export type StreamChunkType = 'thinking' | 'content' | 'tool_call' | 'usage' | 'error' | 'done';

export interface ProviderStreamChunk {
  type: StreamChunkType;
  content?: string;
  usage?: TokenUsage;
  error?: string;
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ProviderContentPart[];
  reasoning_content?: string | null;
}

export type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ProviderOptions {
  model: ModelId;
  messages: ProviderMessage[];
  enableThinking?: boolean;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMProvider {
  stream(options: ProviderOptions): AsyncGenerator<ProviderStreamChunk>;
}
