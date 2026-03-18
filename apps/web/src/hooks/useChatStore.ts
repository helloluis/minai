'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  LLMClassification,
  ConversationListItem,
  Message,
  LLMMode,
  SessionResponse,
  TokenUsage,
  ModelId,
  PinnedMessageWithDetails,
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
  hasMoreMessages: boolean;
  isLoadingMore: boolean;

  // Streaming
  isStreaming: boolean;
  streamingContent: string;
  streamingThinking: string;
  streamingModel: ModelId | null;
  streamingClassification: LLMClassification | null;
  streamError: string | null;

  // UI
  mode: LLMMode;
  sidebarWidth: 'closed' | 'normal' | 'expanded';
  pendingNavigation: string | null;
  targetNoteId: string | null;

  // Pinned Messages
  pinnedMessages: PinnedMessageWithDetails[];
  pinnedMenuOpen: boolean;

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
  loadOlderMessages: () => Promise<void>;
  sendMessage: (content: string, images?: string[]) => Promise<void>;

  deposit: (amount?: number) => Promise<void>;
  refreshSession: () => Promise<void>;
  setMode: (mode: LLMMode) => void;
  toggleSidebar: () => void;
  setSidebarWidth: (width: 'closed' | 'normal' | 'expanded') => void;
  setPendingNavigation: (path: string | null) => void;
  setTargetNoteId: (id: string | null) => void;

  // Pinned messages actions
  loadPinnedMessages: () => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<boolean>;
  togglePinnedMenu: () => void;
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
      hasMoreMessages: false,
      isLoadingMore: false,
      isStreaming: false,
      streamingContent: '',
      streamingThinking: '',
      streamingModel: null,
      streamingClassification: null,
      streamError: null,
      mode: 'auto',
      sidebarWidth: 'closed' as const,
      pendingNavigation: null,
      targetNoteId: null,
      pinnedMessages: [],
      pinnedMenuOpen: false,

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
        await get().loadMessages(conversation.id);
        return conversation.id;
      },

      selectConversation: async (id: string) => {
        set({ activeConversationId: id, messages: [], hasMoreMessages: false });
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
        const PAGE_SIZE = 40;
        const messages = await api.getMessages(conversationId, PAGE_SIZE);
        set({ messages, hasMoreMessages: messages.length >= PAGE_SIZE });
      },

      loadOlderMessages: async () => {
        const { activeConversationId, messages, isLoadingMore, hasMoreMessages } = get();
        if (!activeConversationId || isLoadingMore || !hasMoreMessages || messages.length === 0) return;
        set({ isLoadingMore: true });
        try {
          const PAGE_SIZE = 40;
          const oldest = messages[0].created_at;
          const older = await api.getMessages(activeConversationId, PAGE_SIZE, oldest);
          if (older.length > 0) {
            set({ messages: [...older, ...messages], hasMoreMessages: older.length >= PAGE_SIZE });
          } else {
            set({ hasMoreMessages: false });
          }
        } finally {
          set({ isLoadingMore: false });
        }
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
          images,
        };

        set({
          messages: [...messages, userMsg],
          isStreaming: true,
          streamingContent: '',
          streamingThinking: '',
          streamingModel: null,
      streamingClassification: null,
          streamError: null,
        });

        try {
          for await (const { event, data } of api.fetchSSE(activeConversationId, content, mode, images)) {
            const chunk = data as Record<string, unknown>;

            switch (event) {
              case 'start':
                set({ streamingModel: chunk.model as ModelId, streamingClassification: (chunk.classification as LLMClassification) ?? null });
                break;
              case 'thinking':
                set((s) => ({ streamingThinking: s.streamingThinking + (chunk.content as string) }));
                break;
              case 'chunk':
                set((s) => ({ streamingContent: s.streamingContent + (chunk.content as string) }));
                break;
              case 'usage': {
                const bal = chunk.balance as { balance_usd: number; free_credit_usd: number } | undefined;
                const displayName = chunk.display_name as string | null | undefined;
                set((s) => {
                  if (!s.session) return {};
                  return {
                    session: {
                      ...s.session,
                      ...(bal ? { balance: { balance_usd: bal.balance_usd, free_credit_usd: bal.free_credit_usd } } : {}),
                      user: {
                        ...s.session.user,
                        ...(displayName !== undefined ? { display_name: displayName } : {}),
                      },
                    },
                  };
                });
                break;
              }
              case 'action': {
                const actions = chunk.actions as { navigate?: string; open_sidebar?: boolean } | undefined;
                if (actions?.navigate) set({ pendingNavigation: actions.navigate });
                if (actions?.open_sidebar) set((s) => ({ sidebarWidth: s.sidebarWidth === 'closed' ? 'normal' : s.sidebarWidth }));
                break;
              }
              case 'done':
                break;
              case 'error':
                console.error('[Chat] Stream error:', chunk.error);
                break;
            }
          }

          // Reload messages from server to get proper IDs (images are persisted in DB)
          await get().loadMessages(activeConversationId);
          await get().loadConversations();
        } catch (err) {
          console.error('[Chat] Send error:', err);
          set({ streamError: err instanceof Error ? err.message : 'Failed to send message' });
        } finally {
          set({
            isStreaming: false,
            streamingContent: '',
            streamingThinking: '',
            streamingModel: null,
      streamingClassification: null,
          });
        }
      },

      // Billing actions
      deposit: async (amount?: number) => {
        const result = await api.deposit(amount);
        set((s) => ({
          session: s.session ? {
            ...s.session,
            balance: result.balance,
          } : s.session,
        }));
      },

      refreshSession: async () => {
        const session = await api.getMe();
        set({ session });
      },

      // UI actions
      setMode: (mode: LLMMode) => set({ mode }),
      toggleSidebar: () => set((s) => ({
        sidebarWidth: s.sidebarWidth === 'closed' ? 'normal' : 'closed',
      })),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
      setPendingNavigation: (path) => set({ pendingNavigation: path }),
      setTargetNoteId: (id) => set({ targetNoteId: id }),

      // Pinned messages actions
      loadPinnedMessages: async () => {
        const pinnedMessages = await api.getPinnedMessages();
        set({ pinnedMessages });
      },

      togglePinMessage: async (messageId: string) => {
        const { activeConversationId } = get();
        if (!activeConversationId) return false;

        const result = await api.togglePinMessage(activeConversationId, messageId);
        await get().loadPinnedMessages();
        return result.pinned;
      },

      togglePinnedMenu: () => set((s) => ({ pinnedMenuOpen: !s.pinnedMenuOpen })),
    }),
    {
      name: 'minai-chat',
      partialize: (state) => ({
        mode: state.mode,
      }),
    }
  )
);
