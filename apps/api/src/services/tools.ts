/**
 * Tool System — provides external data to the LLM via function calling.
 * Phase 3: Binance crypto prices (real), web search (placeholder), MiniPay/Opera info (placeholder).
 */

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  content: string;
}

// ─── Tool Definitions ───

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'crypto_price',
    description: 'Get the current price of a cryptocurrency in USD. Supports major coins like BTC, ETH, SOL, CELO, etc.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The cryptocurrency symbol (e.g., BTC, ETH, SOL, CELO)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'crypto_history',
    description: 'Get price history for a cryptocurrency over a time period. Returns daily closing prices.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'The cryptocurrency symbol (e.g., BTC, ETH)',
        },
        days: {
          type: 'number',
          description: 'Number of days of history (default 7, max 30)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'web_search',
    description: 'Search the web for current information. Use this for recent news, events, or facts you are unsure about.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'minipay_info',
    description: 'Get information about MiniPay, the stablecoin wallet built into Opera Mini for emerging markets.',
    parameters: {
      type: 'object',
      properties: {
        topic: {
          type: 'string',
          description: 'The topic to look up (e.g., "how to send money", "supported countries", "stablecoins")',
        },
      },
      required: ['topic'],
    },
  },
  {
    name: 'url_fetch',
    description: 'Fetch and read the text content of a web page URL. Use this when the user shares a link or asks about a specific webpage.',
    parameters: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'The full URL to fetch (e.g., "https://example.com/page")',
        },
      },
      required: ['url'],
    },
  },
  {
    name: 'market_price',
    description: 'Get the current price of any stock, ETF, index, commodity, or forex pair using Yahoo Finance symbols. Examples: AAPL, MSFT, TSLA, GOOGL, ^GSPC (S&P 500), ^DJI (Dow Jones), ^IXIC (Nasdaq), GC=F (gold), SI=F (silver), CL=F (WTI crude oil), BZ=F (Brent crude), EURUSD=X (EUR/USD forex). Use this for any non-crypto financial market data.',
    parameters: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Yahoo Finance symbol (e.g., AAPL, ^GSPC, GC=F, BZ=F, EURUSD=X)',
        },
      },
      required: ['symbol'],
    },
  },
  {
    name: 'news_search',
    description: 'Search Google News for recent news articles on any topic. Returns headlines, sources, and publication dates. Use this when the user asks about current events, recent news, or wants to know what is happening with a topic.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The news search query (e.g., "Kenya elections", "Bitcoin regulation", "AI developments")',
        },
      },
      required: ['query'],
    },
  },
];

// ─── Binance API Endpoints ───
const SPOT_ENDPOINT = 'https://data-api.binance.vision/api/v3';
const FUTURES_ENDPOINT = 'https://fapi.binance.com/fapi';

// ─── Tool Executors ───

async function cryptoPrice(args: { symbol: string }): Promise<string> {
  const symbol = args.symbol.toUpperCase();
  const pair = `${symbol}USDT`;

  try {
    // Try spot market first
    let response = await fetch(`${SPOT_ENDPOINT}/ticker/price?symbol=${pair}`);
    let source = 'spot';

    // Fallback to futures if not on spot
    if (!response.ok) {
      response = await fetch(`${FUTURES_ENDPOINT}/v2/ticker/price?symbol=${pair}`);
      source = 'futures';
    }

    if (!response.ok) {
      return `Could not find price for ${symbol}. It may not be listed on Binance spot or futures.`;
    }

    const data = (await response.json()) as { symbol: string; price: string };
    const price = parseFloat(data.price);

    // Get 24h change from the same market
    const changeUrl = source === 'spot'
      ? `${SPOT_ENDPOINT}/ticker/24hr?symbol=${pair}`
      : `${FUTURES_ENDPOINT}/v1/ticker/24hr?symbol=${pair}`;
    const changeRes = await fetch(changeUrl);

    if (changeRes.ok) {
      const changeData = (await changeRes.json()) as {
        priceChangePercent: string;
        highPrice: string;
        lowPrice: string;
        volume: string;
      };

      return [
        `${symbol}/USD: $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `24h Change: ${parseFloat(changeData.priceChangePercent) >= 0 ? '+' : ''}${parseFloat(changeData.priceChangePercent).toFixed(2)}%`,
        `24h High: $${parseFloat(changeData.highPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `24h Low: $${parseFloat(changeData.lowPrice).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
        `24h Volume: ${parseFloat(changeData.volume).toLocaleString('en-US', { maximumFractionDigits: 0 })} ${symbol}`,
      ].join('\n');
    }

    return `${symbol}/USD: $${price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  } catch (err) {
    console.error(`[Tools] crypto_price error for ${symbol}:`, err);
    return `Error fetching price for ${symbol}. Please try again.`;
  }
}

async function cryptoHistory(args: { symbol: string; days?: number }): Promise<string> {
  const symbol = args.symbol.toUpperCase();
  const pair = `${symbol}USDT`;
  const days = Math.min(args.days ?? 7, 30);

  try {
    // Try spot market first, fallback to futures
    let response = await fetch(
      `${SPOT_ENDPOINT}/klines?symbol=${pair}&interval=1d&limit=${days}`
    );

    if (!response.ok) {
      response = await fetch(
        `${FUTURES_ENDPOINT}/v1/klines?symbol=${pair}&interval=1d&limit=${days}`
      );
    }

    if (!response.ok) {
      return `Could not find history for ${symbol}. It may not be listed on Binance spot or futures.`;
    }

    const data = (await response.json()) as Array<[number, string, string, string, string, ...unknown[]]>;

    const rows = data.map((candle) => {
      const date = new Date(candle[0]).toISOString().slice(0, 10);
      const open = parseFloat(candle[1]).toFixed(2);
      const high = parseFloat(candle[2]).toFixed(2);
      const low = parseFloat(candle[3]).toFixed(2);
      const close = parseFloat(candle[4]).toFixed(2);
      return `${date}: Open $${open} | High $${high} | Low $${low} | Close $${close}`;
    });

    const firstClose = parseFloat(data[0][4]);
    const lastClose = parseFloat(data[data.length - 1][4]);
    const changePct = ((lastClose - firstClose) / firstClose * 100).toFixed(2);

    return [
      `${symbol}/USD — Last ${days} days (${changePct.startsWith('-') ? '' : '+'}${changePct}%):`,
      ...rows,
    ].join('\n');
  } catch (err) {
    console.error(`[Tools] crypto_history error for ${symbol}:`, err);
    return `Error fetching history for ${symbol}. Please try again.`;
  }
}

async function marketPrice(args: { symbol: string }): Promise<string> {
  const symbol = args.symbol.toUpperCase();

  try {
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
      { headers: { 'User-Agent': 'Minai/1.0' } }
    );

    if (!response.ok) {
      return `Could not find market data for "${symbol}". Check the symbol and try again.`;
    }

    const data = (await response.json()) as {
      chart: {
        result: Array<{
          meta: {
            symbol: string;
            shortName?: string;
            longName?: string;
            regularMarketPrice: number;
            previousClose: number;
            currency: string;
            exchangeName: string;
            regularMarketTime: number;
          };
        }>;
      };
    };

    const meta = data.chart?.result?.[0]?.meta;
    if (!meta) {
      return `No data available for "${symbol}".`;
    }

    const price = meta.regularMarketPrice;
    const prevClose = meta.previousClose;
    if (price == null) {
      return `No current price available for "${symbol}".`;
    }

    const name = meta.longName || meta.shortName || symbol;
    const currency = meta.currency || 'USD';
    const prefix = currency === 'USD' ? '$' : currency + ' ';
    const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const lines = [
      `${name} (${meta.symbol})`,
      `Price: ${prefix}${fmt(price)}`,
    ];

    if (prevClose != null && prevClose > 0) {
      const change = price - prevClose;
      const changePct = (change / prevClose) * 100;
      lines.push(`Change: ${change >= 0 ? '+' : ''}${fmt(change)} (${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%)`);
      lines.push(`Previous Close: ${prefix}${fmt(prevClose)}`);
    }

    lines.push(`Exchange: ${meta.exchangeName}`);
    return lines.join('\n');
  } catch (err) {
    console.error(`[Tools] market_price error for ${symbol}:`, err);
    return `Error fetching market data for ${symbol}. Please try again.`;
  }
}

async function newsSearch(args: { query: string }): Promise<string> {
  try {
    const params = new URLSearchParams({
      q: args.query,
      hl: 'en-US',
      gl: 'US',
      ceid: 'US:en',
    });
    const response = await fetch(
      `https://news.google.com/rss/search?${params}`,
      {
        headers: { 'User-Agent': 'Minai/1.0' },
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      return `Could not search news for "${args.query}".`;
    }

    const xml = await response.text();

    // Parse RSS items with simple regex (no XML library needed)
    const items: { title: string; pubDate: string; source: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null && items.length < 8) {
      const itemXml = match[1];
      const title = itemXml.match(/<title>([\s\S]*?)<\/title>/)?.[1]?.trim() || '';
      const pubDate = itemXml.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim() || '';

      // Google News title format: "Headline - Source"
      const dashIdx = title.lastIndexOf(' - ');
      const headline = dashIdx > 0 ? title.slice(0, dashIdx) : title;
      const source = dashIdx > 0 ? title.slice(dashIdx + 3) : 'Unknown';

      // Format date
      let dateStr = '';
      if (pubDate) {
        const d = new Date(pubDate);
        dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }

      items.push({ title: headline, pubDate: dateStr, source });
    }

    if (items.length === 0) {
      return `No recent news found for "${args.query}".`;
    }

    return items
      .map((item, i) => `${i + 1}. ${item.title}\n   Source: ${item.source}${item.pubDate ? ` — ${item.pubDate}` : ''}`)
      .join('\n\n');
  } catch (err) {
    console.error('[Tools] news_search error:', err);
    return `Error searching news. Please try again.`;
  }
}

async function webSearch(args: { query: string }): Promise<string> {
  const apiKey = process.env.BRAVE_API_KEY;
  if (!apiKey) {
    return `[Web search is not configured. Set BRAVE_API_KEY in .env.local]\n\nI'll answer based on my training data instead.`;
  }

  try {
    const params = new URLSearchParams({ q: args.query, count: '5' });
    const response = await fetch(
      `https://api.search.brave.com/res/v1/web/search?${params}`,
      {
        headers: {
          'Accept': 'application/json',
          'Accept-Encoding': 'gzip',
          'X-Subscription-Token': apiKey,
        },
      }
    );

    if (!response.ok) {
      console.error(`[Tools] Brave Search error: ${response.status}`);
      return `Web search failed (${response.status}). I'll answer based on my training data.`;
    }

    const data = (await response.json()) as {
      web?: {
        results: Array<{
          title: string;
          url: string;
          description: string;
          age?: string;
        }>;
      };
    };

    const results = data.web?.results;
    if (!results || results.length === 0) {
      return `No web results found for "${args.query}".`;
    }

    return results
      .map((r, i) => `${i + 1}. **${r.title}**\n   ${r.description}\n   Source: ${r.url}${r.age ? ` (${r.age})` : ''}`)
      .join('\n\n');
  } catch (err) {
    console.error('[Tools] web_search error:', err);
    return `Web search failed. I'll answer based on my training data.`;
  }
}

async function minipayInfo(args: { topic: string }): Promise<string> {
  // Static knowledge base about MiniPay
  const kb: Record<string, string> = {
    'default': `MiniPay is a non-custodial stablecoin wallet built directly into Opera Mini browser. It's designed for emerging markets and allows users to send, receive, and store stablecoins (cUSD, USDT, USDC) on the Celo blockchain. No bank account needed.`,
    'send': `To send money with MiniPay:\n1. Open Opera Mini\n2. Tap the MiniPay icon\n3. Tap "Send"\n4. Enter the recipient's phone number or address\n5. Enter the amount in USD\n6. Confirm the transaction\nFees are under $0.01 per transaction.`,
    'countries': `MiniPay is available in: Kenya, Nigeria, Ghana, South Africa, and is expanding to more African and Southeast Asian countries. It operates on the Celo blockchain which is mobile-first.`,
    'stablecoins': `MiniPay supports:\n- cUSD (Celo Dollar) — pegged to USD on Celo blockchain\n- USDT (Tether) — on Celo\n- USDC (USD Coin) — on Celo\nAll stablecoins are pegged 1:1 to the US dollar.`,
  };

  const topic = args.topic.toLowerCase();
  const key = Object.keys(kb).find((k) => topic.includes(k)) ?? 'default';
  return kb[key];
}

async function urlFetch(args: { url: string }): Promise<string> {
  try {
    const response = await fetch(args.url, {
      headers: {
        'User-Agent': 'Minai/1.0 (AI Assistant)',
        'Accept': 'text/html,application/xhtml+xml,text/plain',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return `Could not fetch URL (${response.status}). The page may be unavailable or require authentication.`;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/') && !contentType.includes('application/json') && !contentType.includes('application/xml')) {
      return `The URL returned non-text content (${contentType}). I can only read text-based pages.`;
    }

    const text = await response.text();

    // Strip HTML tags to get readable text content
    const cleaned = text
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();

    // Truncate to ~3000 chars to stay within context limits
    const truncated = cleaned.length > 3000
      ? cleaned.slice(0, 3000) + '... [truncated]'
      : cleaned;

    return `Content from ${args.url}:\n\n${truncated}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[Tools] url_fetch error for ${args.url}:`, msg);
    return `Could not fetch URL: ${msg}`;
  }
}

// ─── Tool Executor ───

export async function executeTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  console.log(`[Tools] Executing ${name} with args:`, args);

  let content: string;

  switch (name) {
    case 'crypto_price':
      content = await cryptoPrice(args as { symbol: string });
      break;
    case 'crypto_history':
      content = await cryptoHistory(args as { symbol: string; days?: number });
      break;
    case 'web_search':
      content = await webSearch(args as { query: string });
      break;
    case 'minipay_info':
      content = await minipayInfo(args as { topic: string });
      break;
    case 'url_fetch':
      content = await urlFetch(args as { url: string });
      break;
    case 'market_price':
      content = await marketPrice(args as { symbol: string });
      break;
    case 'news_search':
      content = await newsSearch(args as { query: string });
      break;
    default:
      content = `Unknown tool: ${name}`;
  }

  return { name, content };
}
