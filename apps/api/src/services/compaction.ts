/**
 * Context Compaction — summarizes old messages to keep context windows small.
 * Fires after each assistant response (non-blocking).
 * Keeps last 8 messages raw, compacts older exchanges using Qwen Flash.
 */

import type { Message } from '@minai/shared';
import type { ProviderMessage } from './providers/types.js';
import { DashScopeProvider } from './providers/dashscope.js';
import * as db from './db.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);

const KEEP_RECENT = 8; // Keep this many recent messages uncompacted
const MODEL = 'qwen3.5-flash'; // Use cheapest model for summarization

const COMPACTION_PROMPT = `You are a conversation summarizer. Given a sequence of messages from a conversation, produce a brief summary that captures:
- Key topics discussed
- Important facts, decisions, or preferences mentioned
- Any tasks or questions that were asked/answered

Be concise — aim for 2-4 sentences. Preserve specific details (names, numbers, code snippets) that might be referenced later.`;

/**
 * Fire-and-forget compaction. Call this after storing an assistant response.
 * It won't block the response — errors are logged and swallowed.
 */
export function triggerCompaction(conversationId: string): void {
  compactConversation(conversationId).catch((err) => {
    console.error('[Compaction] Error:', err);
  });
}

async function compactConversation(conversationId: string): Promise<void> {
  // Get all messages in the conversation
  const allMessages = await db.getMessages(conversationId, 200);

  if (allMessages.length <= KEEP_RECENT) {
    return; // Not enough messages to compact
  }

  // Split into messages to compact and messages to keep
  const toCompact = allMessages.slice(0, allMessages.length - KEEP_RECENT);

  // Check if these messages are already compacted
  const existing = await db.getCompactedMessages(conversationId);
  const alreadyCompactedIds = new Set(existing.flatMap((c) => c.original_message_ids));
  const newToCompact = toCompact.filter((m) => !alreadyCompactedIds.has(m.id));

  if (newToCompact.length < 4) {
    return; // Not enough new messages to justify compaction
  }

  console.log(`[Compaction] Compacting ${newToCompact.length} messages in conversation ${conversationId}`);

  // Build the text to summarize
  const conversationText = newToCompact
    .map((m) => `${m.role}: ${m.content.slice(0, 500)}`)
    .join('\n\n');

  const messages: ProviderMessage[] = [
    { role: 'system', content: COMPACTION_PROMPT },
    { role: 'user', content: conversationText },
  ];

  try {
    const { content } = await provider.complete(messages, MODEL, 256);

    if (content.trim()) {
      await db.createCompactedMessage(
        conversationId,
        newToCompact.map((m) => m.id),
        content.trim()
      );
      console.log(`[Compaction] Stored summary (${content.length} chars) for ${newToCompact.length} messages`);
    }
  } catch (err) {
    console.error('[Compaction] LLM summarization failed:', err);
  }
}

/**
 * Build context including compacted history for the conversation.
 * Returns compacted summaries that should be prepended to the conversation context.
 */
export async function getCompactedContext(conversationId: string): Promise<string | null> {
  const compacted = await db.getCompactedMessages(conversationId);
  if (compacted.length === 0) return null;

  return compacted
    .map((c) => `[Earlier conversation summary]: ${c.compacted_text}`)
    .join('\n\n');
}
