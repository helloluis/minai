/**
 * Tool Runner — detects when tools should be invoked based on user message patterns,
 * executes them, and returns results to inject into the LLM context.
 *
 * This handles simple, unambiguous cases (URLs, MiniPay mentions).
 * For crypto prices and complex queries, the LLM uses the tool-use loop
 * to call tools directly with the correct arguments.
 */

import { executeTool } from './tools.js';

interface ToolMatch {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Detect tools that should be run based on the user's message.
 * Returns tool results as a context string, or null if no tools triggered.
 */
export async function detectAndExecuteTools(userMessage: string): Promise<string | null> {
  const matches = detectTools(userMessage);
  if (matches.length === 0) return null;

  const results = await Promise.all(
    matches.map(async (match) => {
      const result = await executeTool(match.name, match.args);
      return `[Tool: ${result.name}]\n${result.content}`;
    })
  );

  return results.join('\n\n');
}

function detectTools(message: string): ToolMatch[] {
  const matches: ToolMatch[] = [];
  const lower = message.toLowerCase();

  // Detect URLs in the message — fetch page content
  const urlMatch = message.match(/https?:\/\/[^\s,)]+/);
  if (urlMatch) {
    matches.push({ name: 'url_fetch', args: { url: urlMatch[0] } });
  }

  // Detect MiniPay queries
  if (lower.includes('minipay') || lower.includes('mini pay') || lower.includes('opera mini')) {
    const topic = message.replace(/minipay|mini pay|opera mini/gi, '').trim() || 'general';
    matches.push({ name: 'minipay_info', args: { topic } });
  }

  // Detect web search queries
  const searchPatterns = [
    /(?:search|look up|find|google|search for)\s+(.+)/i,
    /(?:what'?s|what is)\s+(?:the\s+)?(?:latest|recent|current|new)\s+(.+)/i,
    /(?:latest|recent|current)\s+(?:news|updates?)\s+(?:on|about|for)\s+(.+)/i,
  ];

  if (matches.length === 0) {
    for (const pattern of searchPatterns) {
      const match = message.match(pattern);
      if (match) {
        matches.push({ name: 'web_search', args: { query: match[1].trim() } });
        break;
      }
    }
  }

  return matches;
}
