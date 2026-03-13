import type { ModelId, TokenUsage } from '@minai/shared';

export type StreamChunkType = 'thinking' | 'content' | 'tool_call' | 'usage' | 'error' | 'done';

export interface ToolCallInfo {
  id: string;
  name: string;
  arguments: string;
}

export interface ProviderStreamChunk {
  type: StreamChunkType;
  content?: string;
  usage?: TokenUsage;
  error?: string;
  toolCalls?: ToolCallInfo[];
}

export interface OpenAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface ProviderMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ProviderContentPart[] | null;
  reasoning_content?: string | null;
  tool_calls?: ToolCallInfo[] | OpenAIToolCall[];
  tool_call_id?: string;
}

export type ProviderContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ProviderOptions {
  model: ModelId;
  messages: ProviderMessage[];
  enableThinking?: boolean;
  temperature?: number;
  maxTokens?: number;
  tools?: ToolDefinition[];
}

export interface LLMProvider {
  stream(options: ProviderOptions): AsyncGenerator<ProviderStreamChunk>;
}
