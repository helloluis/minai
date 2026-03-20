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

export async function getUserById(userId: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT * FROM users WHERE id = $1 AND deleted_at IS NULL`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function updateUserDisplayName(userId: string, name: string): Promise<void> {
  await pool.query(
    `UPDATE users SET display_name = $2 WHERE id = $1`,
    [userId, name]
  );
}

// ─── Balances ───

export async function createBalance(userId: string, freeCredit?: number): Promise<UserBalance> {
  const credit = freeCredit ?? PRICING.free_credit_initial_usd;
  const { rows } = await pool.query<UserBalance>(
    `INSERT INTO user_balances (user_id, free_credit_usd) VALUES ($1, $2) RETURNING *`,
    [userId, credit]
  );
  return rows[0];
}

export async function getBalance(userId: string): Promise<UserBalance | null> {
  const { rows } = await pool.query<UserBalance>(
    `SELECT *, balance_usd::float AS balance_usd FROM user_balances WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

export async function deductBalance(userId: string, amount: number): Promise<void> {
  if (amount <= 0) return;
  await pool.query(
    `UPDATE user_balances SET balance_usd = GREATEST(0, balance_usd - $2), updated_at = now() WHERE user_id = $1`,
    [userId, amount]
  );
}

export async function addBalance(userId: string, amount: number): Promise<void> {
  // Update balance and reset high-water mark to new total (ring resets to full on top-up)
  await pool.query(
    `UPDATE user_balances SET
       balance_usd = balance_usd + $2,
       balance_high_water = balance_usd + $2 + free_credit_usd,
       updated_at = now()
     WHERE user_id = $1`,
    [userId, amount]
  );
}

export async function deductFreeCredit(userId: string, amount: number): Promise<number> {
  const balance = await getBalance(userId);
  if (!balance) return 0;

  const deducted = Math.min(balance.free_credit_usd, amount);
  if (deducted > 0) {
    await pool.query(
      `UPDATE user_balances SET free_credit_usd = free_credit_usd - $2, updated_at = now() WHERE user_id = $1`,
      [userId, deducted]
    );
  }
  return deducted;
}

// ─── Conversations ───

export async function createConversation(userId: string, title?: string): Promise<Conversation> {
  let conversationTitle = title ?? 'New conversation';
  if (!title) {
    const user = await getUserById(userId);
    if (user?.display_name) conversationTitle = user.display_name;
  }
  const { rows } = await pool.query<Conversation>(
    `INSERT INTO conversations (user_id, title) VALUES ($1, $2) RETURNING *`,
    [userId, conversationTitle]
  );
  const conv = rows[0];
  // Insert greeting widget as the permanent first message
  const greetingWidget = {
    widget_type: 'multi-lingual-greeting',
    widget_style: 'message',
    widget_content: [
      'Hello! How can I help you today?',
      'Habari! Ninaweza kukusaidia vipi leo?',
      'Kumusta! Paano kita matutulungan ngayon?',
      'Bonjour! Comment puis-je vous aider?',
      '¡Hola! ¿En qué puedo ayudarte hoy?',
      'Sannu! Yaya zan iya taimaka muku yau?',
    ],
  };
  await pool.query(
    `INSERT INTO messages (conversation_id, role, content, widget_data) VALUES ($1, 'assistant', '', $2)`,
    [conv.id, JSON.stringify(greetingWidget)]
  );
  return conv;
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

// Rename a user's only default-titled conversation when a name is learned
export async function renameDefaultConversation(userId: string, name: string): Promise<void> {
  const DEFAULT_TITLES = ['New conversation', 'My Notebook'];
  await pool.query(
    `UPDATE conversations
     SET title = $3, updated_at = now()
     WHERE user_id = $1
       AND deleted_at IS NULL
       AND title = ANY($2::text[])
       AND (SELECT COUNT(*) FROM conversations WHERE user_id = $1 AND deleted_at IS NULL) = 1`,
    [userId, DEFAULT_TITLES, name]
  );
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
  images?: string[],
  fileIds?: string[]
): Promise<Message> {
  const { rows } = await pool.query<Message>(
    `INSERT INTO messages (conversation_id, role, content, model, images, file_ids) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [conversationId, role, content, model ?? null, images && images.length > 0 ? JSON.stringify(images) : null, fileIds && fileIds.length > 0 ? JSON.stringify(fileIds) : null]
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
  const params: unknown[] = [conversationId];

  if (before) {
    // Pagination: get N messages BEFORE a timestamp (for loading older messages)
    // Ordered DESC to get the N closest to the cursor, then reversed to ASC
    params.push(before);
    const limitClause = limit ? `LIMIT $${params.length + 1}` : '';
    if (limit) params.push(limit);
    const { rows } = await pool.query<Message>(
      `SELECT * FROM (
        SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL AND created_at < $2
        ORDER BY created_at DESC ${limitClause}
      ) sub ORDER BY created_at ASC`,
      params
    );
    return hydrateMessageFiles(rows);
  }

  if (limit) {
    // Initial load: get the NEWEST N messages (subquery DESC, then ASC)
    params.push(limit);
    const { rows } = await pool.query<Message>(
      `SELECT * FROM (
        SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL
        ORDER BY created_at DESC LIMIT $2
      ) sub ORDER BY created_at ASC`,
      params
    );
    return hydrateMessageFiles(rows);
  }

  // No limit, no cursor: return all messages
  const { rows } = await pool.query<Message>(
    `SELECT * FROM messages WHERE conversation_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    params
  );
  return hydrateMessageFiles(rows);
}

/** Attach file metadata to messages that have file_ids */
async function hydrateMessageFiles(messages: Message[]): Promise<Message[]> {
  const allFileIds = messages.flatMap((m) => m.file_ids ?? []);
  if (allFileIds.length === 0) return messages;

  const { rows: files } = await pool.query<{ id: string; display_name: string; mime_type: string; file_size: number }>(
    `SELECT id, display_name, mime_type, file_size FROM notebook_files WHERE id = ANY($1) AND deleted_at IS NULL`,
    [allFileIds]
  );
  const fileMap = new Map(files.map((f) => [f.id, f]));

  return messages.map((m) => {
    if (!m.file_ids?.length) return m;
    return {
      ...m,
      files: m.file_ids.map((id) => fileMap.get(id)).filter(Boolean) as Message['files'],
    };
  });
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
  txHash?: string,
  paymentMethod: 'mock' | 'celo' = 'mock',
  token?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO payments (user_id, amount_usd, tx_hash, status, payment_method, token)
     VALUES ($1, $2, $3, 'completed', $4, $5)`,
    [userId, amountUsd, txHash ?? null, paymentMethod, token ?? null]
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

// ─── Notes ───

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

export async function getNotes(conversationId: string, userId: string): Promise<Note[]> {
  const { rows } = await pool.query<Note>(
    `SELECT * FROM notes
     WHERE conversation_id = $1 AND user_id = $2 AND deleted_at IS NULL
     ORDER BY display_order ASC, created_at ASC`,
    [conversationId, userId]
  );
  return rows;
}

export async function createNote(
  conversationId: string,
  userId: string,
  title = '',
  content = ''
): Promise<Note> {
  const { rows: [{ next_order }] } = await pool.query<{ next_order: number }>(
    `SELECT COALESCE(MAX(display_order), -1) + 1 AS next_order
     FROM notes WHERE conversation_id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [conversationId, userId]
  );
  const { rows } = await pool.query<Note>(
    `INSERT INTO notes (conversation_id, user_id, title, content, display_order)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [conversationId, userId, title, content, next_order]
  );
  return rows[0];
}

export async function updateNote(
  id: string,
  userId: string,
  updates: { title?: string; content?: string; display_order?: number }
): Promise<Note | null> {
  const sets: string[] = ['updated_at = now()'];
  const values: unknown[] = [id, userId];
  let i = 3;
  if (updates.title !== undefined)         { sets.push(`title = $${i++}`);         values.push(updates.title); }
  if (updates.content !== undefined)       { sets.push(`content = $${i++}`);       values.push(updates.content); }
  if (updates.display_order !== undefined) { sets.push(`display_order = $${i++}`); values.push(updates.display_order); }

  const { rows } = await pool.query<Note>(
    `UPDATE notes SET ${sets.join(', ')}
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL RETURNING *`,
    values
  );
  return rows[0] ?? null;
}

export async function deleteNote(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE notes SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

// ─── Google OAuth ─────────────────────────────────────────────────────────────

export async function findUserByGoogleId(googleId: string): Promise<User | null> {
  const { rows } = await pool.query<User>(
    `SELECT * FROM users WHERE google_id = $1 AND deleted_at IS NULL`,
    [googleId]
  );
  return rows[0] ?? null;
}

export async function linkGoogleAccount(
  userId: string,
  googleId: string,
  email: string,
  displayName: string,
  avatarUrl: string
): Promise<User> {
  const { rows } = await pool.query<User>(
    `UPDATE users SET google_id = $2, email = $3, display_name = $4, avatar_url = $5
     WHERE id = $1 RETURNING *`,
    [userId, googleId, email, displayName, avatarUrl]
  );
  return rows[0];
}

export interface GoogleTokens {
  access_token: string;
  refresh_token: string | null;
  token_expiry: string | null;
  scopes: string | null;
}

export async function saveGoogleTokens(
  userId: string,
  accessToken: string,
  refreshToken: string | null,
  tokenExpiry: Date | null,
  scopes: string | null
): Promise<void> {
  await pool.query(`
    INSERT INTO google_tokens (user_id, access_token, refresh_token, token_expiry, scopes, updated_at)
    VALUES ($1, $2, $3, $4, $5, now())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      refresh_token = COALESCE(EXCLUDED.refresh_token, google_tokens.refresh_token),
      token_expiry = EXCLUDED.token_expiry,
      scopes = EXCLUDED.scopes,
      updated_at = now()
  `, [userId, accessToken, refreshToken, tokenExpiry, scopes]);
}

export async function getGoogleTokens(userId: string): Promise<GoogleTokens | null> {
  const { rows } = await pool.query<GoogleTokens>(
    `SELECT access_token, refresh_token, token_expiry, scopes FROM google_tokens WHERE user_id = $1`,
    [userId]
  );
  return rows[0] ?? null;
}

// ─── Notebook-Calendar associations ──────────────────────────────────────────

export interface CalendarAssociation {
  calendar_id: string;
  calendar_name: string;
  notebook_id: string;
  notebook_name: string;
}

export async function getCalendarAssociations(userId: string): Promise<CalendarAssociation[]> {
  const { rows } = await pool.query<CalendarAssociation>(`
    SELECT nc.calendar_id, nc.calendar_name, nc.notebook_id, c.title AS notebook_name
    FROM notebook_calendars nc
    JOIN conversations c ON c.id = nc.notebook_id
    WHERE nc.user_id = $1
  `, [userId]);
  return rows;
}

export async function getNotebookForCalendar(
  userId: string,
  calendarId: string
): Promise<{ notebook_id: string; notebook_name: string } | null> {
  const { rows } = await pool.query(`
    SELECT nc.notebook_id, c.title AS notebook_name
    FROM notebook_calendars nc
    JOIN conversations c ON c.id = nc.notebook_id
    WHERE nc.user_id = $1 AND nc.calendar_id = $2
  `, [userId, calendarId]);
  return rows[0] ?? null;
}

export async function associateCalendarWithNotebook(
  userId: string,
  notebookId: string,
  calendarId: string,
  calendarName: string
): Promise<void> {
  await pool.query(`
    INSERT INTO notebook_calendars (user_id, notebook_id, calendar_id, calendar_name)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, calendar_id) DO UPDATE SET
      notebook_id   = EXCLUDED.notebook_id,
      calendar_name = EXCLUDED.calendar_name
  `, [userId, notebookId, calendarId, calendarName]);
}

export async function getNotebookTimezone(notebookId: string): Promise<string> {
  const { rows } = await pool.query<{ timezone: string }>(
    `SELECT timezone FROM conversations WHERE id = $1`,
    [notebookId]
  );
  return rows[0]?.timezone ?? 'UTC';
}

// ─── Token usage ──────────────────────────────────────────────────────────────

export interface DailyUsage {
  date: string; // YYYY-MM-DD
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  message_count: number;
}

export async function getTokenUsageByDay(userId: string, days = 30): Promise<DailyUsage[]> {
  const { rows } = await pool.query<DailyUsage>(`
    SELECT
      DATE(m.created_at)::text AS date,
      SUM(m.input_tokens)::int AS input_tokens,
      SUM(m.output_tokens)::int AS output_tokens,
      SUM(m.token_cost_usd)::float AS cost_usd,
      COUNT(*)::int AS message_count
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1
      AND m.role = 'assistant'
      AND m.deleted_at IS NULL
      AND m.created_at >= NOW() - INTERVAL '1 day' * $2
    GROUP BY DATE(m.created_at)
    ORDER BY date ASC
  `, [userId, days]);
  return rows;
}

export async function getTotalUsage(userId: string): Promise<{ total_input: number; total_output: number; total_cost: number }> {
  const { rows } = await pool.query(`
    SELECT
      COALESCE(SUM(m.input_tokens), 0)::int AS total_input,
      COALESCE(SUM(m.output_tokens), 0)::int AS total_output,
      COALESCE(SUM(m.token_cost_usd), 0)::float AS total_cost
    FROM messages m
    JOIN conversations c ON c.id = m.conversation_id
    WHERE c.user_id = $1 AND m.role = 'assistant' AND m.deleted_at IS NULL
  `, [userId]);
  return rows[0];
}

// ─── Timezone & Briefings ────────────────────────────────────────────────────

export async function setUserTimezone(userId: string, timezone: string): Promise<void> {
  await pool.query('UPDATE users SET timezone = $1 WHERE id = $2', [timezone, userId]);
}

export interface BriefingUser {
  id: string;
  email: string | null;
  display_name: string | null;
  timezone: string;
  notebook_id: string;
}

/**
 * Find users who:
 *  - have Google Calendar connected
 *  - have briefings enabled
 *  - whose local time is within ±2 minutes of a target HH:MM
 *  - haven't received a briefing in the last 4 hours
 * Returns one row per user with their most recently active conversation.
 * Does NOT require notebook_calendars — if no calendars are linked, the
 * briefing service falls back to the user's primary Google Calendar.
 */
export async function getUsersDueForBriefing(targetHour: number, targetMinute: number): Promise<BriefingUser[]> {
  const { rows } = await pool.query<BriefingUser>(`
    SELECT DISTINCT ON (u.id)
      u.id, u.email, u.display_name, u.timezone,
      c.id AS notebook_id
    FROM users u
    JOIN google_tokens gt ON gt.user_id = u.id
    JOIN conversations c ON c.user_id = u.id
    WHERE u.deleted_at IS NULL
      AND u.briefings_enabled = true
      AND gt.refresh_token IS NOT NULL
      AND c.deleted_at IS NULL
      AND DATE_PART('hour',   NOW() AT TIME ZONE u.timezone)::int = $1
      AND ABS(DATE_PART('minute', NOW() AT TIME ZONE u.timezone)::int - $2) <= 2
      AND (u.last_briefing_at IS NULL OR u.last_briefing_at < NOW() - INTERVAL '4 hours')
    ORDER BY u.id, c.updated_at DESC
  `, [targetHour, targetMinute]);
  return rows;
}

export async function updateLastBriefing(userId: string): Promise<void> {
  await pool.query('UPDATE users SET last_briefing_at = NOW() WHERE id = $1', [userId]);
}

// ─── Notebook Files ──────────────────────────────────────────────────────────

export interface NotebookFile {
  id: string;
  conversation_id: string;
  user_id: string;
  original_name: string;
  display_name: string;
  mime_type: string;
  file_size: number;
  storage_path: string;
  parsed_text: string | null;
  parse_status: string;
  parse_error: string | null;
  llm_summary: string | null;
  summary_status: string;
  summary_cost_usd: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export async function createNotebookFile(
  conversationId: string,
  userId: string,
  originalName: string,
  mimeType: string,
  fileSize: number,
  storagePath: string,
): Promise<NotebookFile> {
  const { rows } = await pool.query<NotebookFile>(
    `INSERT INTO notebook_files (conversation_id, user_id, original_name, display_name, mime_type, file_size, storage_path)
     VALUES ($1, $2, $3, $3, $4, $5, $6) RETURNING *`,
    [conversationId, userId, originalName, mimeType, fileSize, storagePath]
  );
  return rows[0];
}

export async function getNotebookFiles(conversationId: string, userId: string): Promise<NotebookFile[]> {
  const { rows } = await pool.query<NotebookFile>(
    `SELECT * FROM notebook_files WHERE conversation_id = $1 AND user_id = $2 AND deleted_at IS NULL ORDER BY created_at DESC`,
    [conversationId, userId]
  );
  return rows;
}

export async function getNotebookFile(id: string, userId: string): Promise<NotebookFile | null> {
  const { rows } = await pool.query<NotebookFile>(
    `SELECT * FROM notebook_files WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return rows[0] ?? null;
}

export async function updateNotebookFile(
  id: string,
  userId: string,
  updates: { display_name?: string; parsed_text?: string; parse_status?: string; parse_error?: string; llm_summary?: string; summary_status?: string; summary_cost_usd?: number },
): Promise<NotebookFile | null> {
  const sets: string[] = ['updated_at = now()'];
  const params: unknown[] = [];
  let idx = 1;

  for (const [key, val] of Object.entries(updates)) {
    if (val !== undefined) {
      sets.push(`${key} = $${idx}`);
      params.push(val);
      idx++;
    }
  }
  params.push(id, userId);

  const { rows } = await pool.query<NotebookFile>(
    `UPDATE notebook_files SET ${sets.join(', ')} WHERE id = $${idx} AND user_id = $${idx + 1} AND deleted_at IS NULL RETURNING *`,
    params
  );
  return rows[0] ?? null;
}

export async function deleteNotebookFile(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE notebook_files SET deleted_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [id, userId]
  );
  return (rowCount ?? 0) > 0;
}

export async function getNotebookFileContent(
  fileId: string,
  conversationId: string,
  userId: string,
): Promise<{ display_name: string; parsed_text: string | null; parse_status: string; llm_summary: string | null; summary_status: string } | null> {
  const { rows } = await pool.query<{ display_name: string; parsed_text: string | null; parse_status: string; llm_summary: string | null; summary_status: string }>(
    `SELECT display_name, parsed_text, parse_status, llm_summary, summary_status FROM notebook_files
     WHERE id = $1 AND conversation_id = $2 AND user_id = $3 AND deleted_at IS NULL`,
    [fileId, conversationId, userId]
  );
  return rows[0] ?? null;
}

export async function searchNotebookFiles(
  conversationId: string,
  userId: string,
  query: string,
): Promise<{ id: string; display_name: string; snippet: string }[]> {
  const pattern = `%${query}%`;
  const { rows } = await pool.query<{ id: string; display_name: string; snippet: string }>(
    `SELECT id, display_name,
       SUBSTRING(parsed_text FROM GREATEST(1, POSITION(LOWER($3) IN LOWER(parsed_text)) - 80) FOR 200) AS snippet
     FROM notebook_files
     WHERE conversation_id = $1 AND user_id = $2 AND deleted_at IS NULL
       AND parsed_text ILIKE $4
     LIMIT 10`,
    [conversationId, userId, query, pattern]
  );
  return rows;
}

// ─── Pool ───

export { pool };
