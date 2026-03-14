import type {
  SessionResponse,
  ConversationListItem,
  Conversation,
  Message,
  LLMMode,
  PinnedMessageWithDetails,
  MessageFeedback,
} from '@minai/shared';

// Proxied through Next.js rewrites — same origin, no CORS/cookie issues
const API_BASE = '';

async function fetchAPI<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options?.body ? { 'Content-Type': 'application/json' } : {}),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(error.error || `API error ${res.status}`);
  }

  return res.json();
}

// Auth
export const login = () => fetchAPI<SessionResponse>('/api/auth/login', { method: 'POST', body: '{}' });
export const getMe = () => fetchAPI<SessionResponse>('/api/auth/me');
export const deposit = (amount?: number) =>
  fetchAPI<{ balance: { balance_usd: number; free_tokens_remaining: number } }>('/api/auth/deposit', {
    method: 'POST',
    body: JSON.stringify({ amount }),
  });

// Conversations
export const getConversations = () => fetchAPI<ConversationListItem[]>('/api/conversations');
export const createConversation = (title?: string) =>
  fetchAPI<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  });
export const updateConversation = (id: string, updates: Partial<Conversation>) =>
  fetchAPI<Conversation>(`/api/conversations/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
export const deleteConversation = (id: string) =>
  fetchAPI<{ success: boolean }>(`/api/conversations/${id}`, { method: 'DELETE' });

// Messages
export const getMessages = (conversationId: string, limit?: number, before?: string) => {
  const params = new URLSearchParams();
  if (limit) params.set('limit', String(limit));
  if (before) params.set('before', before);
  return fetchAPI<Message[]>(`/api/conversations/${conversationId}/messages?${params}`);
};

export const deleteMessage = (conversationId: string, messageId: string) =>
  fetchAPI<{ success: boolean }>(`/api/conversations/${conversationId}/messages/${messageId}`, {
    method: 'DELETE',
  });

// Pinned Messages
export const getPinnedMessages = () =>
  fetchAPI<PinnedMessageWithDetails[]>('/api/messages/pinned');

export const togglePinMessage = (conversationId: string, messageId: string) =>
  fetchAPI<{ pinned: boolean }>(
    `/api/conversations/${conversationId}/messages/${messageId}/pin`,
    { method: 'POST' }
  );

// Message Feedback
export const submitFeedback = (
  conversationId: string,
  messageId: string,
  data: { feedback_text?: string; original_prompt: string; original_response: string }
) =>
  fetchAPI<MessageFeedback>(
    `/api/conversations/${conversationId}/messages/${messageId}/feedback`,
    { method: 'POST', body: JSON.stringify(data) }
  );

// Notes
export interface Note {
  id: string;
  conversation_id: string;
  user_id: string;
  title: string;
  content: string;
  display_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export const getNotes = (conversationId: string) =>
  fetchAPI<Note[]>(`/api/conversations/${conversationId}/notes`);

export const createNote = (conversationId: string, title?: string, content?: string) =>
  fetchAPI<Note>(`/api/conversations/${conversationId}/notes`, {
    method: 'POST',
    body: JSON.stringify({ title, content }),
  });

export const updateNote = (
  conversationId: string,
  noteId: string,
  updates: { title?: string; content?: string; display_order?: number }
) =>
  fetchAPI<Note>(`/api/conversations/${conversationId}/notes/${noteId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });

export const deleteNote = (conversationId: string, noteId: string) =>
  fetchAPI<{ success: boolean }>(`/api/conversations/${conversationId}/notes/${noteId}`, {
    method: 'DELETE',
  });

// Settings / Usage
export interface DailyUsage {
  date: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  message_count: number;
}

export interface UsageResponse {
  daily: DailyUsage[];
  totals: { total_input: number; total_output: number; total_cost: number };
}

export const getUsage = (days = 30) =>
  fetchAPI<UsageResponse>(`/api/settings/usage?days=${days}`);

// Streaming
export function streamMessage(
  conversationId: string,
  content: string,
  mode: LLMMode,
  images?: string[]
): EventSource | null {
  // We use fetch + ReadableStream for SSE since EventSource doesn't support POST
  return null; // Handled directly in the store
}

export async function* fetchSSE(
  conversationId: string,
  content: string,
  mode: LLMMode,
  images?: string[]
): AsyncGenerator<{ event: string; data: unknown }> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, mode, images }),
  });

  if (!res.ok) {
    throw new Error(`Stream failed: ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    let currentEvent = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(':')) continue;

      if (trimmed.startsWith('event: ')) {
        currentEvent = trimmed.slice(7);
      } else if (trimmed.startsWith('data: ')) {
        try {
          const data = JSON.parse(trimmed.slice(6));
          yield { event: currentEvent, data };
        } catch {
          // Skip malformed JSON
        }
      }
    }
  }
}
