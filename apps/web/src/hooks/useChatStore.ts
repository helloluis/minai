'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ConversationListItem,
  Message,
  LLMMode,
  SessionResponse,
  TokenUsage,
  ModelId,
} from '@minai/shared';
import * as api from '@/lib/api';

interface ChatState {
  // Auth
  session: SessionResponse | null;
  isAuthenticated: boolean;

  // Conversations
  conversations: ConversationListItem[];
  activeConversationId: string | null;

  // Messages
  messages: Message[];

  // Streaming
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  streamingModel: ModelId | null;

  // UI
  mode: LLMMode;
  sidebarOpen: boolean;

  // Actions
  login: () => Promise<void>;
  checkSession: () => Promise<void>;
  logout: () => void;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  selectConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  updateConversation: (id: string, updates: Partial<ConversationListItem>) => Promise<void>;

  loadMessages: (conversationId: string) => Promise<void>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;

  setMode: (mode: LLMMode) => void;
  toggleSidebar: () => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      session: null,
      isAuthenticated: false,
      conversations: [],
      activeConversationId: null,
      messages: [],
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      streamingModel: null,
      mode: 'auto',
      sidebarOpen: false,

      // Auth actions
      login: async () => {
        const session = await api.login();
        set({ session, isAuthenticated: true });
      },

      checkSession: async () => {
        try {
          const session = await api.getMe();
          set({ session, isAuthenticated: true });
        } catch {
          set({ session: null, isAuthenticated: false });
        }
      },

      logout: () => {
        set({
          session: null,
          isAuthenticated: false,
          conversations: [],
          activeConversationId: null,
          messages: [],
        });
      },

      // Conversation actions
      loadConversations: async () => {
        const conversations = await api.getConversations();
        set({ conversations });
      },

      createConversation: async () => {
        const conversation = await api.createConversation();
        await get().loadConversations();
        set({ activeConversationId: conversation.id, messages: [] });
        return conversation.id;
      },

      selectConversation: async (id: string) => {
        set({ activeConversationId: id, messages: [] });
        await get().loadMessages(id);
      },

      deleteConversation: async (id: string) => {
        await api.deleteConversation(id);
        const { activeConversationId } = get();
        if (activeConversationId === id) {
          set({ activeConversationId: null, messages: [] });
        }
        await get().loadConversations();
      },

      updateConversation: async (id: string, updates: Partial<ConversationListItem>) => {
        await api.updateConversation(id, updates);
        await get().loadConversations();
      },

      // Message actions
      loadMessages: async (conversationId: string) => {
        const messages = await api.getMessages(conversationId);
        set({ messages });
      },

      sendMessage: async (content: string, images?: string[]) => {
        const { activeConversationId, mode, messages } = get();
        if (!activeConversationId || get().isStreaming) return;

        // Optimistically add user message
        const userMsg: Message = {
          id: `temp-${Date.now()}`,
          conversation_id: activeConversationId,
          role: 'user',
          content,
          model: null,
          input_tokens: 0,
          output_tokens: 0,
          token_cost_usd: 0,
          created_at: new Date().toISOString(),
          deleted_at: null,
        };

        set({
          messages: [...messages, userMsg],
          isStreaming: true,
          streamingContent: '',
          streamingThinking: '',
          streamingModel: null,
        });

        try {
          for await (const { event, data } of api.fetchSSE(activeConversationId, content, mode, images)) {
            const chunk = data as Record<string, unknown>;

            switch (event) {
              case 'start':
                set({ streamingModel: chunk.model as ModelId });
                break;
              case 'thinking':
                set((s) => ({ streamingThinking: s.streamingThinking + (chunk.content as string) }));
                break;
              case 'chunk':
                set((s) => ({ streamingContent: s.streamingContent + (chunk.content as string) }));
                break;
              case 'usage':
                // Update session balance (Phase 2 will handle this properly)
                break;
              case 'done':
                break;
              case 'error':
                console.error('[Chat] Stream error:', chunk.error);
                break;
            }
          }

          // Reload messages from server to get proper IDs
          await get().loadMessages(activeConversationId);
          await get().loadConversations();
        } catch (err) {
          console.error('[Chat] Send error:', err);
        } finally {
          set({
            isStreaming: false,
            streamingContent: '',
            streamingThinking: '',
            streamingModel: null,
          });
        }
      },

      // UI actions
      setMode: (mode: LLMMode) => set({ mode }),
      toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
    }),
    {
      name: 'minai-chat',
      partialize: (state) => ({
        mode: state.mode,
      }),
    }
  )
);
