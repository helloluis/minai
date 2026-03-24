#!/usr/bin/env node

/**
 * Daily Conversation Review
 *
 * Samples 5-8 conversations from the last 24-48h (excluding the admin user),
 * analyzes them with Qwen 3.5 Plus for quality issues, and emails a morning
 * summary to lb@minai.work.
 *
 * Usage:
 *   node daily-review.js
 *
 * Env vars (loaded from .env.local):
 *   DATABASE_URL        — PostgreSQL connection
 *   DASHSCOPE_API_KEY   — Qwen 3.5 Plus for analysis
 *   RESEND_API_KEY      — email delivery
 */

import pg from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load env
try {
  const envPath = join(__dirname, '../../.env.local');
  const envContent = readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {}

const DATABASE_URL = process.env.DATABASE_URL;
const DASHSCOPE_API_KEY = process.env.DASHSCOPE_API_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_TO = process.env.REVIEW_EMAIL || 'lb@minai.work';
const ADMIN_EMAIL = 'lbuenaventura2@gmail.com';
const SENTRY_DSN = 'https://03c94e3a4e5ca9d7cd5bb1b2722e12b0@o4511097194414080.ingest.de.sentry.io/4511097210929232';

if (!DATABASE_URL || !DASHSCOPE_API_KEY || !RESEND_API_KEY) {
  console.error('[Review] Missing required env vars');
  process.exit(0); // Silent exit — don't fail the cron
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

// ─── Sentry error reporting ───

async function reportToSentry(error) {
  try {
    // Minimal Sentry envelope — no SDK needed
    const eventId = crypto.randomUUID().replace(/-/g, '');
    const dsn = new URL(SENTRY_DSN);
    const projectId = dsn.pathname.slice(1);
    const host = dsn.hostname;
    const publicKey = dsn.username;

    const envelope = [
      JSON.stringify({ event_id: eventId, dsn: SENTRY_DSN }),
      JSON.stringify({ type: 'event' }),
      JSON.stringify({
        event_id: eventId,
        timestamp: Date.now() / 1000,
        platform: 'node',
        level: 'error',
        logger: 'daily-review',
        message: { formatted: error.message || String(error) },
        exception: {
          values: [{
            type: error.name || 'Error',
            value: error.message || String(error),
            stacktrace: error.stack ? { frames: error.stack.split('\n').slice(1, 10).map(l => ({ filename: l.trim() })) } : undefined,
          }],
        },
      }),
    ].join('\n');

    await fetch(`https://${host}/api/${projectId}/envelope/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-sentry-envelope',
        'X-Sentry-Auth': `Sentry sentry_version=7,sentry_client=minai-review/1.0,sentry_key=${publicKey}`,
      },
      body: envelope,
    });
    console.log(`[Review] Error reported to Sentry: ${error.message}`);
  } catch (sentryErr) {
    console.error('[Review] Failed to report to Sentry:', sentryErr.message);
  }
}

// ─── DB queries ───

async function sampleConversations() {
  // Get 5-8 conversations from the last 48h that aren't from the admin
  // and have at least 2 messages (a user message + an assistant response)
  const { rows } = await pool.query(`
    SELECT c.id, c.title, c.created_at,
           u.timezone,
           COUNT(m.id)::int AS message_count
    FROM conversations c
    JOIN users u ON u.id = c.user_id
    JOIN messages m ON m.conversation_id = c.id AND m.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
      AND (u.email IS NULL OR u.email != $1)
      AND m.created_at >= NOW() - INTERVAL '48 hours'
    GROUP BY c.id, c.title, c.created_at, u.timezone
    HAVING COUNT(m.id) >= 2
    ORDER BY RANDOM()
    LIMIT 8
  `, [ADMIN_EMAIL]);

  return rows;
}

async function getConversationMessages(conversationId) {
  const { rows } = await pool.query(`
    SELECT role, content, model, token_cost_usd::float AS cost,
           created_at
    FROM messages
    WHERE conversation_id = $1
      AND deleted_at IS NULL
      AND created_at >= NOW() - INTERVAL '48 hours'
    ORDER BY created_at ASC
    LIMIT 20
  `, [conversationId]);
  return rows;
}

// ─── LLM analysis ───

async function analyzeConversations(samples) {
  const conversationTexts = [];

  for (const conv of samples) {
    const messages = await getConversationMessages(conv.id);
    if (messages.length < 2) continue;

    const transcript = messages.map(m => {
      const role = m.role === 'user' ? 'USER' : 'ASSISTANT';
      const content = m.content.slice(0, 500) + (m.content.length > 500 ? '...' : '');
      return `[${role}] ${content}`;
    }).join('\n');

    const totalCost = messages.reduce((sum, m) => sum + (m.cost || 0), 0);

    conversationTexts.push(
      `### Conversation: "${conv.title}" (${conv.message_count} messages, $${totalCost.toFixed(4)} cost, tz: ${conv.timezone})\n${transcript}`
    );
  }

  if (conversationTexts.length === 0) return null;

  const prompt = `You are a product analyst reviewing conversations from "minai", an AI assistant for users in emerging economies.

Below are ${conversationTexts.length} anonymized conversation samples from the last 24-48 hours. Analyze them and produce a morning briefing with:

1. **Usage Patterns** — What are users asking about? Categorize the topics (e.g., research, calendar, documents, general knowledge, creative, etc.)
2. **Quality Issues** — Flag any conversations where:
   - The assistant gave incorrect or hallucinated information
   - Tool calls failed or returned errors
   - The response was off-topic, too verbose, or unhelpful
   - The user seemed frustrated or had to repeat themselves
3. **Interesting Observations** — Any notable user behaviors, feature requests expressed in conversation, or unexpected use cases
4. **Overall Quality Score** — Rate the overall response quality as: Excellent / Good / Needs Attention / Poor

Be concise and direct. If everything looks fine, say so briefly.

---

${conversationTexts.join('\n\n---\n\n')}`;

  const res = await fetch('https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${DASHSCOPE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'qwen-plus',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 2000,
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`LLM analysis failed (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? null;
}

// ─── Email ───

async function sendReport(analysis, sampleCount) {
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 650px;">
      <h2 style="color: #16a34a; margin-bottom: 4px;">minai Daily Conversation Review</h2>
      <p style="color: #888; font-size: 13px; margin-top: 0;">${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })} — ${sampleCount} conversation(s) sampled</p>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
      <div style="font-size: 14px; line-height: 1.6; color: #333; white-space: pre-wrap;">${escapeHtml(analysis)}</div>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;">
      <p style="color: #888; font-size: 12px;">Automated daily review — minai.work</p>
    </div>
  `;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || 'minai <onboarding@resend.dev>',
      to: [EMAIL_TO],
      subject: `[minai] Daily review: ${sampleCount} conversations analyzed`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Email failed: ${err.slice(0, 200)}`);
  }

  console.log(`[Review] Report emailed to ${EMAIL_TO}`);
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
}

// ─── Main ───

async function run() {
  console.log(`[Review] Starting daily conversation review — ${new Date().toISOString()}`);

  // 1. Sample conversations
  const samples = await sampleConversations();
  if (samples.length === 0) {
    console.log('[Review] No qualifying conversations in the last 48h. Skipping.');
    await pool.end();
    return;
  }
  console.log(`[Review] Sampled ${samples.length} conversation(s)`);

  // 2. Analyze with LLM
  let analysis;
  try {
    analysis = await analyzeConversations(samples);
  } catch (err) {
    console.error('[Review] LLM analysis failed:', err.message);
    await reportToSentry(err);
    await pool.end();
    process.exit(0); // Don't fail the cron
  }

  if (!analysis) {
    console.log('[Review] No analysis produced. Skipping.');
    await pool.end();
    return;
  }

  // 3. Email report
  try {
    await sendReport(analysis, samples.length);
  } catch (err) {
    console.error('[Review] Email failed:', err.message);
    await reportToSentry(err);
  }

  await pool.end();
  console.log('[Review] Done.');
}

run().catch(async (err) => {
  console.error('[Review] Fatal error:', err);
  await reportToSentry(err);
  await pool.end();
  process.exit(0);
});
