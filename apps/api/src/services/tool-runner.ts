/**
 * Tool Runner — detects when tools should be invoked based on user message patterns,
 * executes them, and returns results to inject into the LLM context.
 */

import { executeTool } from './tools.js';

interface ToolMatch {
  name: string;
  args: Record<string, unknown>;
}

// Common crypto symbols
const CRYPTO_SYMBOLS = new Set([
  'BTC', 'ETH', 'SOL', 'CELO', 'BNB', 'XRP', 'ADA', 'DOGE', 'DOT', 'MATIC',
  'AVAX', 'LINK', 'UNI', 'ATOM', 'FIL', 'LTC', 'NEAR', 'APT', 'ARB', 'OP',
  'SUI', 'SEI', 'TIA', 'INJ', 'PEPE', 'SHIB', 'WLD', 'USDT', 'USDC',
]);

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
  const words = message.toUpperCase().split(/\s+/);

  // Detect crypto price queries
  const pricePatterns = [
    /(?:price|cost|worth|value)\s+(?:of\s+)?(\w+)/i,
    /(?:how much is|what'?s)\s+(?:the\s+)?(\w+)/i,
    /(\w+)\s+(?:price|bei)/i, // "bei" is Swahili for "price"
  ];

  for (const pattern of pricePatterns) {
    const match = message.match(pattern);
    if (match) {
      const symbol = match[1].toUpperCase();
      if (CRYPTO_SYMBOLS.has(symbol)) {
        matches.push({ name: 'crypto_price', args: { symbol } });
        break;
      }
    }
  }

  // Also check if any crypto symbol appears with price-related context
  if (matches.length === 0) {
    const priceWords = ['price', 'bei', 'worth', 'value', 'cost', 'trading', 'market'];
    const hasPriceContext = priceWords.some((w) => lower.includes(w));
    if (hasPriceContext) {
      for (const word of words) {
        if (CRYPTO_SYMBOLS.has(word) && word !== 'USDT' && word !== 'USDC') {
          matches.push({ name: 'crypto_price', args: { symbol: word } });
          break;
        }
      }
    }
  }

  // Detect crypto history queries
  const historyPatterns = [
    /(?:history|trend|chart|performance|last\s+\d+\s+days?)\s+(?:of\s+|for\s+)?(\w+)/i,
    /(\w+)\s+(?:history|trend|chart|performance)/i,
  ];

  for (const pattern of historyPatterns) {
    const match = message.match(pattern);
    if (match) {
      const symbol = match[1].toUpperCase();
      if (CRYPTO_SYMBOLS.has(symbol)) {
        const daysMatch = message.match(/(\d+)\s*days?/i);
        const days = daysMatch ? parseInt(daysMatch[1]) : 7;
        matches.push({ name: 'crypto_history', args: { symbol, days } });
        break;
      }
    }
  }

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
