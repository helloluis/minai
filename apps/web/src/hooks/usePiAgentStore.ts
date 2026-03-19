'use client';

import { create } from 'zustand';
import type { PiAgentMessage } from '@minai/shared';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface PiAgentState {
  // Connection
  status: ConnectionStatus;
  error: string | null;
  ws: WebSocket | null;

  // Messages
  messages: PiAgentMessage[];
  streamingContent: string;
  streamingThinking: string;
  isStreaming: boolean;

  // Actions
  connect: (sessionToken: string, conversationId?: string) => void;
  disconnect: () => void;
  sendMessage: (content: string) => void;
  newSession: () => void;
  abort: () => void;
  clearMessages: () => void;
}

let msgIdCounter = 0;

function getWsUrl(sessionToken: string, conversationId?: string): string {
  if (typeof window === 'undefined') return '';
  const loc = window.location;
  const params = new URLSearchParams({ session: sessionToken });
  if (conversationId) params.set('conversation', conversationId);
  if (loc.port === '3002') {
    return `ws://${loc.hostname}:3001/api/agent/ws?${params}`;
  }
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${loc.host}/api/agent/ws?${params}`;
}

export const usePiAgentStore = create<PiAgentState>()((set, get) => ({
  status: 'disconnected',
  error: null,
  ws: null,
  messages: [],
  streamingContent: '',
  streamingThinking: '',
  isStreaming: false,

  connect: (sessionToken: string, conversationId?: string) => {
    const { ws } = get();
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    set({ status: 'connecting', error: null });

    const url = getWsUrl(sessionToken, conversationId);
    const socket = new WebSocket(url);

    socket.onopen = () => {
      console.log('[pi-agent] WebSocket connected');
    };

    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handlePiMessage(msg, set, get);
      } catch {
        console.error('[pi-agent] Failed to parse message:', event.data);
      }
    };

    socket.onerror = () => {
      set({ status: 'error', error: 'WebSocket connection failed' });
    };

    socket.onclose = () => {
      set({ status: 'disconnected', ws: null });
    };

    set({ ws: socket });
  },

  disconnect: () => {
    const { ws } = get();
    if (ws) ws.close();
    set({ ws: null, status: 'disconnected' });
  },

  sendMessage: (content: string) => {
    const { ws, status } = get();
    if (!ws || status !== 'connected') return;

    const userMsg: PiAgentMessage = {
      id: `user-${++msgIdCounter}`,
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    set((state) => ({ messages: [...state.messages, userMsg] }));
    // Pi RPC protocol: {type: 'prompt', message: '...'}
    ws.send(JSON.stringify({ type: 'prompt', message: content }));
  },

  newSession: () => {
    const { ws } = get();
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'new_session' }));
    set({ messages: [], streamingContent: '', streamingThinking: '', isStreaming: false });
  },

  abort: () => {
    const { ws } = get();
    if (!ws) return;
    ws.send(JSON.stringify({ type: 'abort' }));
  },

  clearMessages: () => {
    set({ messages: [], streamingContent: '', streamingThinking: '', isStreaming: false });
  },
}));

// ── Pi RPC message handler ──

function handlePiMessage(
  msg: Record<string, unknown>,
  set: (fn: Partial<PiAgentState> | ((state: PiAgentState) => Partial<PiAgentState>)) => void,
  get: () => PiAgentState
) {
  const type = msg.type as string;

  switch (type) {
    case 'auth_ok':
      set({ status: 'connected' });
      break;

    // ── Agent lifecycle ──
    case 'agent_start':
      set({ isStreaming: true, streamingContent: '', streamingThinking: '' });
      break;

    case 'agent_end': {
      // Flush any remaining streaming content as a message
      const { streamingContent } = get();
      if (streamingContent) {
        const assistantMsg: PiAgentMessage = {
          id: `asst-${++msgIdCounter}`,
          role: 'assistant',
          content: streamingContent,
          timestamp: Date.now(),
        };
        set((state) => ({
          messages: [...state.messages, assistantMsg],
          streamingContent: '',
          streamingThinking: '',
          isStreaming: false,
        }));
      } else {
        set({ streamingContent: '', streamingThinking: '', isStreaming: false });
      }
      break;
    }

    // ── Text streaming via message_update ──
    case 'message_update': {
      const event = msg.assistantMessageEvent as Record<string, unknown> | undefined;
      if (!event) break;

      const eventType = event.type as string;

      if (eventType === 'text_delta') {
        const delta = (event.delta as string) || '';
        if (delta) {
          set((state) => ({ streamingContent: state.streamingContent + delta }));
        }
      } else if (eventType === 'thinking_delta') {
        const delta = (event.delta as string) || '';
        if (delta) {
          set((state) => ({ streamingThinking: state.streamingThinking + delta }));
        }
      } else if (eventType === 'done') {
        // Message complete — flush streaming content
        const { streamingContent } = get();
        if (streamingContent) {
          const assistantMsg: PiAgentMessage = {
            id: `asst-${++msgIdCounter}`,
            role: 'assistant',
            content: streamingContent,
            timestamp: Date.now(),
          };
          set((state) => ({
            messages: [...state.messages, assistantMsg],
            streamingContent: '',
            streamingThinking: '',
          }));
        }
      }
      break;
    }

    // ── Tool execution ──
    case 'tool_execution_start': {
      const toolMsg: PiAgentMessage = {
        id: `tool-${msg.toolCallId || ++msgIdCounter}`,
        role: 'tool',
        content: '',
        toolName: (msg.toolName as string) || 'unknown',
        toolInput: typeof msg.args === 'string' ? msg.args : JSON.stringify(msg.args || {}),
        timestamp: Date.now(),
      };
      set((state) => ({ messages: [...state.messages, toolMsg] }));
      break;
    }

    case 'tool_execution_update': {
      const callId = msg.toolCallId as string;
      const partial = msg.partialResult as Record<string, unknown> | undefined;
      const output = partial?.output as string || '';
      if (callId && output) {
        set((state) => {
          const msgs = [...state.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].id === `tool-${callId}`) {
              msgs[i] = { ...msgs[i], toolOutput: (msgs[i].toolOutput || '') + output };
              break;
            }
          }
          return { messages: msgs };
        });
      }
      break;
    }

    case 'tool_execution_end': {
      const callId = msg.toolCallId as string;
      const result = msg.result as Record<string, unknown> | undefined;
      const isError = msg.isError as boolean;
      if (callId) {
        set((state) => {
          const msgs = [...state.messages];
          for (let i = msgs.length - 1; i >= 0; i--) {
            if (msgs[i].id === `tool-${callId}`) {
              const content = result?.content;
              const output = Array.isArray(content)
                ? content.map((c: Record<string, unknown>) => c.text || '').join('\n')
                : JSON.stringify(result || '');
              msgs[i] = {
                ...msgs[i],
                toolOutput: msgs[i].toolOutput || output,
                content: isError ? 'error' : 'done',
              };
              break;
            }
          }
          return { messages: msgs };
        });
      }
      break;
    }

    // ── RPC response (get_state, etc) ──
    case 'response': {
      const command = msg.command as string;
      if (command === 'get_state' && msg.success && msg.data) {
        const data = msg.data as Record<string, unknown>;
        const history = data.messages as Array<Record<string, unknown>> | undefined;
        if (history && Array.isArray(history) && history.length > 0) {
          const parsed: PiAgentMessage[] = history.map((m, i) => ({
            id: `hist-${i}`,
            role: (m.role as string) === 'user' ? 'user' as const : 'assistant' as const,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''),
            timestamp: Date.now(),
          }));
          set({ messages: parsed });
        }
      } else if (!msg.success) {
        console.warn(`[pi-agent] Command failed: ${command}`, msg.error);
      }
      break;
    }

    // ── Context management ──
    case 'auto_compaction_start':
      // Could show a UI indicator
      break;
    case 'auto_compaction_end':
      break;

    // ── Retry ──
    case 'auto_retry_start':
      break;
    case 'auto_retry_end':
      if (!(msg.success as boolean) && msg.finalError) {
        set({ error: msg.finalError as string, isStreaming: false });
      }
      break;

    case 'turn_end':
      break;

    case 'error':
      set({ error: msg.error as string, isStreaming: false });
      break;

    default:
      console.log('[pi-agent] Unhandled message type:', type, msg);
  }
}
