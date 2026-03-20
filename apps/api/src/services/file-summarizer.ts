/**
 * File Summarizer — generates a compact LLM-friendly summary of uploaded documents.
 * Runs after text parsing succeeds. Uses the fast model for cost efficiency.
 *
 * The summary is structured for easy LLM consumption: key facts, numbers, names,
 * and relationships extracted into a dense format that fits in small context windows.
 */

import { DashScopeProvider } from './providers/dashscope.js';
import { calculateCost } from '../config/pricing.js';
import * as db from './db.js';

const provider = new DashScopeProvider(process.env.DASHSCOPE_API_KEY!);
const MODEL = 'qwen3.5-flash';
const MAX_INPUT_CHARS = 6000; // limit input to keep cost low

const SUMMARIZE_PROMPT = `You are a document analysis assistant. Given the text content of a document, produce a structured summary that captures ALL key information in a compact format.

Your summary MUST include:
- Document type (contract, report, letter, invoice, term sheet, etc.)
- All named entities (people, companies, organizations, locations)
- All monetary amounts, dates, percentages, and quantities
- Key terms, conditions, or requirements
- Any action items, deadlines, or milestones

Format as a structured block — use bullet points and key:value pairs. Be thorough but concise. Do NOT omit any specific names, numbers, or dates from the original. This summary will be used by another AI to answer questions about the document, so accuracy and completeness are critical.

Keep it under 500 words.`;

export async function summarizeFile(fileId: string, userId: string): Promise<void> {
  const file = await db.getNotebookFile(fileId, userId);
  if (!file || !file.parsed_text || file.summary_status === 'done') return;

  const inputText = file.parsed_text.slice(0, MAX_INPUT_CHARS);
  if (inputText.trim().length < 50) {
    await db.updateNotebookFile(fileId, userId, {
      summary_status: 'skipped',
    });
    return;
  }

  try {
    await db.updateNotebookFile(fileId, userId, { summary_status: 'processing' });

    const { content, usage } = await provider.complete(
      [
        { role: 'system', content: SUMMARIZE_PROMPT },
        { role: 'user', content: `Document: "${file.display_name}"\n\nContent:\n${inputText}` },
      ],
      MODEL,
      800
    );

    const cost = usage
      ? calculateCost(MODEL, usage.inputTokens, usage.outputTokens)
      : 0;

    if (content.trim()) {
      await db.updateNotebookFile(fileId, userId, {
        llm_summary: content.trim(),
        summary_status: 'done',
        summary_cost_usd: cost,
      });
      console.log(`[Summarizer] ${file.display_name}: ${content.length} chars, $${cost.toFixed(6)}`);
    } else {
      await db.updateNotebookFile(fileId, userId, { summary_status: 'failed' });
    }
  } catch (err) {
    console.error(`[Summarizer] Failed for ${file.display_name}:`, err);
    await db.updateNotebookFile(fileId, userId, { summary_status: 'failed' });
  }
}
