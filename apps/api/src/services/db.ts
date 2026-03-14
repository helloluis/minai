import pg from 'pg';
import type {
  User,
  UserBalance,
  Conversation,
  Message,
  ConversationListItem,
  UserMemory,
} from '@minai/shared';
import { PRICING } from '../config/pricing.js';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

// ─── Users ───

export async function createUser(sessionToken: string): Promise<User> {
  const { rows } = await pool.query<User>(
    `INSERT INTO users (session_token) VALUES ($1) RETURNING *`,
    [sessionToken]
  );
  return rows[0];
}

export async function getUserBySession(sessionToken: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT * FROM users WHERE session_token = $1 AND deleted_at IS NULL`,
    [sessionToken]
  );
  return rows[0] ?? null;
}

// ─── Balances ───

export async function createBalance(userId: string): Promise<UserBalance> {
  const { rows } = await pool.query<UserBalance>(
    `INSERT INTO user_balances (user_id, free_tokens_remaining) VALUES ($1, $2) RETURNING *`,
    [userId, PRICING.free_tokens_initial]
  );
  return rows[0];
}

export async function getBalance(userId: string): Promise<UserBalance | null> {
  const { rows } = await pool.query<UserBalance>(
    `SELECT * FROM user_balances WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function deductBalance(userId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE user_balances SET balance_usd = balance_usd - $2, updated_at = now() WHERE user_id = $1`,
    [userId, amount]
  );
}

export async function addBalance(userId: string, amount: number): Promise<void> {
  await pool.query(
    `UPDATE user_balances SET balance_usd = balance_usd + $2, updated_at = now() WHERE user_id = $1`,
    [userId, amount]
  );
}

export async function deductFreeTokens(userId: string, tokens: number): Promise<number> {
  const balance = await getBalance(userId);
  if (!balance) return 0;

  const deducted = Math.min(balance.free_tokens_remaining, tokens);
  if (deducted > 0) {
    await pool.query(
      `UPDATE user_balances SET free_tokens_remaining = free_tokens_remaining - $2, updated_at = now() WHERE user_id = $1`,
      [userId, deducted]
    );
  }
  return deducted;
}

// ─── Conversations ───

export async function createConversation(userId: string, title?: string): Promise<Conversation> {
  const { rows } = await pool.query<Conversation>(
    `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *`,
    [userId, title ?? 'New conversation']
  );
  return rows[0];
}

export async function getConversations(userId: string): Promise<ConversationListItem[]> {
  const { rows } = await pool.query<ConversationListItem>(
    `SELECT c.id, c.title, c.pinned, c.pin_order, c.updated_at,
      (SELECT content FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL ORDER BY m.created_at DESC LIMIT 1) as last_message
     FROM conversations c
     WHERE c.user_id = $1 AND c.deleted_at IS NULL
     ORDER BY c.pinned DESC, c.pin_order ASC, c.updated_at DESC`,
    [userId]
  );
  return rows;
}

export async function getConversation(id: string, userId: string): Promise<Conversation | null> {
  const { rows } = await pool.query<Conversation>(
    `SELECT * FROM conversations WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function updateConversation(
  id: string,
  userId: string,
  updates: Partial<Pick<Conversation, 'title' | 'pinned' | 'pin_order'>>
): Promise<Conversation | null> {
  const sets: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 3;

  if (updates.title !== undefined) {
    sets.push(`title = $${paramIndex++}`);
    values.push(updates.title);
  }
  if (updates.pinned !== undefined) {
    sets.push(`pinned = $${paramIndex++}`);
    values.push(updates.pinned);
  }
  if (updates.pin_order !== undefined) {
    sets.push(`pin_order = $${paramIndex++}`);
    values.push(updates.pin_order);
  }

  if (sets.length === 0) return getConversation(id, userId);

  sets.push('updated_at = now()');
  const { rows } = await pool.query<Conversation>(
    `UPDATE conversations SET ${sets.join(', ')} WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
    [id, userId, ...values]
  );
  return rows[0] ?? null;
}

export async function deleteConversation(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE conversations SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Messages ───

export async function createMessage(
  conversationId: string,
  role: string,
  content: string,
  model?: string,
  images?: string[]
): Promise<Message> {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages (conversation_id, role, content, model, images) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [conversationId, role, content, model ?? null, images && images.length > 0 ? JSON.stringify(images) : null]
  );
  // Update conversation timestamp
  await pool.query(
    `UPDATE conversations SET updated_at = now() WHERE id = $1`,
    [conversationId]
  );
  return rows[0];
}

export async function getMessages(
  conversationId: string,
  limit = 50,
  before?: string
): Promise<Message[]> {
  let query = `SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL`;
  const params: unknown[] = [conversationId];

  if (before) {
    query += ` AND created_at < $2`;
    params.push(before);
  }

  query += ` ORDER BY created_at ASC`;

  if (limit) {
    query += ` LIMIT $${params.length + 1}`;
    params.push(limit);
  }

  const { rows } = await pool.query<Message>(query, params);
  return rows;
}

export async function updateMessageTokens(
  messageId: string,
  inputTokens: number,
  outputTokens: number,
  costUsd: number
): Promise<void> {
  await pool.query(
    `UPDATE messages SET input_tokens = $2, output_tokens = $3, token_cost_usd = $4 WHERE id = $1`,
    [messageId, inputTokens, outputTokens, costUsd]
  );
}

export async function deleteMessage(id: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE messages SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
  return (rowCount ?? 0) > 0;
}

// ─── User Memory ───

export async function getUserMemories(userId: string): Promise<UserMemory[]> {
  const { rows } = await pool.query<UserMemory>(
    `SELECT * FROM user_memory WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 10`,
    [userId]
  );
  return rows;
}

export async function upsertUserMemory(userId: string, key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO user_memory (user_id, key, value)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = now()`,
    [userId, key, value]
  );
}

// ─── Compacted Messages ───

export interface CompactedMessage {
  id: string;
  conversation_id: string;
  original_message_ids: string[];
  compacted_text: string;
  created_at: string;
}

export async function getCompactedMessages(conversationId: string): Promise<CompactedMessage[]> {
  const { rows } = await pool.query<CompactedMessage>(
    `SELECT * FROM compacted_messages WHERE conversation_id = $1 ORDER BY created_at ASC`,
    [conversationId]
  );
  return rows;
}

export async function createCompactedMessage(
  conversationId: string,
  originalMessageIds: string[],
  compactedText: string
): Promise<void> {
  await pool.query(
    `INSERT INTO compacted_messages (conversation_id, original_message_ids, compacted_text)
     VALUES ($1, $2, $3)`,
    [conversationId, originalMessageIds, compactedText]
  );
}

// ─── Payments ───

export async function recordPayment(
  userId: string,
  amountUsd: number,
  type: 'deposit' | 'usage',
  txHash?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO payments (user_id, amount_usd, tx_hash, status) VALUES ($1, $2, $3, $4)`,
    [userId, amountUsd, txHash ?? null, type === 'deposit' ? 'completed' : 'completed']
  );
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

export async function getPinnedMessages(userId: string): Promise<PinnedMessageWithDetails[]> {
  const { rows } = await pool.query<PinnedMessageWithDetails>(
    `SELECT pm.id, pm.message_id, pm.user_id, pm.created_at,
            m.conversation_id, m.content, m.model
     FROM pinned_messages pm
     JOIN messages m ON m.id = pm.message_id
     WHERE pm.user_id = $1 AND m.deleted_at IS NULL
     ORDER BY pm.created_at DESC`,
    [userId]
  );
  return rows;
}

export async function isPinned(messageId: string, userId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT 1 FROM pinned_messages WHERE message_id = $1 AND user_id = $2`,
    [messageId, userId]
  );
  return rows.length > 0;
}

export async function pinMessage(messageId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO pinned_messages (message_id, user_id)
     VALUES ($1, $2)
     ON CONFLICT (message_id, user_id) DO NOTHING`,
    [messageId, userId]
  );
}

export async function unpinMessage(messageId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `DELETE FROM pinned_messages WHERE message_id = $1 AND user_id = $2`,
    [messageId, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function togglePin(messageId: string, userId: string): Promise<boolean> {
  const pinned = await isPinned(messageId, userId);
  if (pinned) {
    await unpinMessage(messageId, userId);
    return false;
  } else {
    await pinMessage(messageId, userId);
    return true;
  }
}

// ─── Message Feedback ───

export interface MessageFeedbackRow {
  id: string;
  message_id: string;
  user_id: string;
  feedback_type: string;
  feedback_text: string | null;
  original_prompt: string;
  original_response: string;
  created_at: string;
}

export async function createFeedback(
  messageId: string,
  userId: string,
  feedbackText: string | null,
  originalPrompt: string,
  originalResponse: string
): Promise<MessageFeedbackRow> {
  const { rows } = await pool.query<MessageFeedbackRow>(
    `INSERT INTO message_feedback (message_id, user_id, feedback_text, original_prompt, original_response)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [messageId, userId, feedbackText, originalPrompt, originalResponse]
  );
  return rows[0];
}

// ─── Pool ───

export { pool };
