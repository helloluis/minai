// ─── Config ───

export const FREE_CREDIT_INITIAL_USD = 1.00; // $1.00 free credit for every new user

// ─── Models ───

export type LLMMode = 'auto' | 'fast' | 'balanced' | 'deep';
export type LLMClassification = 'simple' | 'balanced' | 'deep';
export type ModelId = 'qwen3.5-flash' | 'qwen3.5-plus';
export type MessageRole = 'user' | 'assistant' | 'system';

// ─── Database Entities ───

export interface User {
  id: string;
  session_token: string;
  google_id: string | null;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at: string;
  deleted_at: string | null;
}

export interface UserBalance {
  id: string;
  user_id: string;
  balance_usd: number;
  free_credit_usd: number;
  updated_at: string;
}

export interface Conversation {
  id: string;
  user_id: string;
  title: string;
  pinned: boolean;
  pin_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Message {
  id: string;
  conversation_id: string;
  role: MessageRole;
  content: string;
  model: ModelId | null;
  input_tokens: number;
  output_tokens: number;
  token_cost_usd: number;
  created_at: string;
  deleted_at: string | null;
  images?: string[]; // base64 data URLs (stored as JSONB in DB)
}

export interface UserMemory {
  id: string;
  user_id: string;
  key: string;
  value: string;
  created_at: string;
  updated_at: string;
}

export interface Payment {
  id: string;
  user_id: string;
  amount_usd: number;
  tx_hash: string | null;
  status: string;
  created_at: string;
}

// ─── Pinned Messages ───

export interface PinnedMessageWithDetails {
  id: string;
  message_id: string;
  user_id: string;
  created_at: string;
  conversation_id: string;
  content: string;
  model: string | null;
}

// ─── Message Feedback ───

export interface MessageFeedback {
  id: string;
  message_id: string;
  user_id: string;
  feedback_type: 'thumbs_down';
  feedback_text: string | null;
  original_prompt: string;
  original_response: string;
  created_at: string;
}

// ─── Streaming ───

export type StreamChunkType = 'start' | 'thinking' | 'chunk' | 'usage' | 'done' | 'error';

export interface StreamChunk {
  type: StreamChunkType;
  content?: string;
  messageId?: string;
  model?: ModelId;
  classification?: LLMClassification;
  usage?: TokenUsage;
  balance?: Pick<UserBalance, 'balance_usd' | 'free_credit_usd'>;
  display_name?: string | null;
  error?: string;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cost: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
}

// ─── API Types ───

export interface SendMessageRequest {
  content: string;
  mode: LLMMode;
  images?: string[]; // base64 encoded
}

export interface ConversationListItem {
  id: string;
  title: string;
  pinned: boolean;
  pin_order: number;
  updated_at: string;
  last_message?: string;
}

export interface SessionResponse {
  user: Pick<User, 'id' | 'created_at' | 'email' | 'display_name' | 'avatar_url' | 'google_id'>;
  balance: Pick<UserBalance, 'balance_usd' | 'free_credit_usd'>;
}
