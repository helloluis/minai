/**
 * User Memory — extracts and stores user preferences from messages.
 * Runs fire-and-forget after each user message.
 */

import type { ProviderMessage } from './providers/types.js';
import { DashScopeProvider } from './providers/dashscope.js';
import * as db from './db.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);
const MODEL = 'qwen3.5-flash';

const MEMORY_EXTRACTION_PROMPT = `You extract user preferences and facts from messages. Given a user message, identify any personal facts worth remembering for future conversations.

Return JSON array of key-value pairs, or empty array if nothing notable.

Examples:
- "I live in Nairobi" → [{"key": "location", "value": "Nairobi"}]
- "I'm a software developer" → [{"key": "occupation", "value": "software developer"}]
- "Habari yako" → [{"key": "language_preference", "value": "Swahili"}]
- "What's the weather?" → []
- "My name is John" → [{"key": "name", "value": "John"}]

Only extract clear, definitive facts. Do not infer or guess.
Respond with ONLY a JSON array, nothing else.`;

/**
 * Fire-and-forget memory extraction from user messages.
 */
export function extractMemories(userId: string, userMessage: string): void {
  doExtract(userId, userMessage).catch((err) => {
    console.error('[Memory] Extraction error:', err);
  });
}

async function doExtract(userId: string, userMessage: string): Promise<void> {
  // Skip very short messages — unlikely to contain memorable info
  if (userMessage.length < 10) return;

  // Simple language detection for Swahili
  const swahiliWords = ['habari', 'jambo', 'asante', 'sana', 'karibu', 'ndiyo', 'hapana', 'tafadhali', 'rafiki', 'ninaweza', 'vipi', 'leo', 'kesho', 'shukrani'];
  const words = userMessage.toLowerCase().split(/\s+/);
  const swahiliCount = words.filter((w) => swahiliWords.includes(w)).length;

  if (swahiliCount >= 2 || (swahiliCount >= 1 && words.length <= 5)) {
    await db.upsertUserMemory(userId, 'language_preference', 'Swahili');
    console.log(`[Memory] Detected Swahili preference for user ${userId}`);
  }

  // Use LLM for deeper extraction only for longer messages
  if (userMessage.length < 20) return;

  try {
    const messages: ProviderMessage[] = [
      { role: 'system', content: MEMORY_EXTRACTION_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const { content } = await provider.complete(messages, MODEL, 128);
    const trimmed = content.trim();

    if (!trimmed || trimmed === '[]') return;

    const memories = JSON.parse(trimmed) as Array<{ key: string; value: string }>;

    for (const mem of memories) {
      if (mem.key && mem.value) {
        await db.upsertUserMemory(userId, mem.key, mem.value);
        console.log(`[Memory] Stored: ${mem.key} = ${mem.value}`);
      }
    }
  } catch (err) {
    // JSON parse failure or LLM error — not critical
    console.error('[Memory] LLM extraction failed:', err);
  }
}
