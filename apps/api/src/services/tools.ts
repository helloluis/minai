/**
 * Tool System — provides external data to the LLM via function calling.
 */

import * as gcal from './google-calendar.js';
import * as db from './db.js';
import * as imageGen from './image-gen.js';
import { PRICING } from '../config/pricing.js';

export interface ContextImage {
  url: string;           // base64 data URL or https:// URL
  source: 'user' | 'generated';
  label: string;         // human-readable label for the LLM
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  content: string;
  cost_usd?: number; // additional cost beyond LLM tokens (e.g. image generation)
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

  // ─── Google Calendar tools ─────────────────────────────────────────────────

  {
    name: 'calendar_list_calendars',
    description: 'List all Google calendars the user has access to, including shared client calendars. Shows which calendar is associated with which notebook. Use this first to understand what calendars are available before performing other calendar operations.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'calendar_get_events',
    description: 'Get events from a Google calendar for a date range. Use this to check a schedule, find an event, or see what is happening on a given day or week.',
    parameters: {
      type: 'object',
      properties: {
        calendar_id: {
          type: 'string',
          description: 'The Google calendar ID (from calendar_list_calendars). Use "primary" for the user\'s own calendar.',
        },
        start_date: {
          type: 'string',
          description: 'Start date/datetime in ISO format (e.g., "2026-03-20" or "2026-03-20T09:00:00")',
        },
        end_date: {
          type: 'string',
          description: 'End date/datetime in ISO format (e.g., "2026-03-21" or "2026-03-20T17:00:00")',
        },
        max_results: {
          type: 'number',
          description: 'Maximum number of events to return (default 20)',
        },
        query: {
          type: 'string',
          description: 'Optional text search within event titles and descriptions',
        },
      },
      required: ['calendar_id', 'start_date', 'end_date'],
    },
  },
  {
    name: 'calendar_create_event',
    description: 'Create a new event on a Google calendar. Always use the client\'s timezone (from the notebook), not the user\'s local timezone. After creating, show the event link to the user.',
    parameters: {
      type: 'object',
      properties: {
        calendar_id: {
          type: 'string',
          description: 'The Google calendar ID to create the event on',
        },
        title: {
          type: 'string',
          description: 'Event title',
        },
        start: {
          type: 'string',
          description: 'Start datetime in ISO format (e.g., "2026-03-20T14:00:00")',
        },
        end: {
          type: 'string',
          description: 'End datetime in ISO format (e.g., "2026-03-20T15:00:00")',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone for the event, e.g. "Africa/Nairobi", "Asia/Manila", "America/New_York". Use the client\'s timezone.',
        },
        description: {
          type: 'string',
          description: 'Optional event description or agenda',
        },
        location: {
          type: 'string',
          description: 'Optional location (address or meeting link)',
        },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional list of attendee email addresses',
        },
        notebook_id: {
          type: 'string',
          description: 'Optional notebook (conversation) ID — if provided, the notebook\'s timezone is used automatically',
        },
      },
      required: ['calendar_id', 'title', 'start', 'end'],
    },
  },
  {
    name: 'calendar_update_event',
    description: 'Update an existing calendar event. Only include fields you want to change.',
    parameters: {
      type: 'object',
      properties: {
        calendar_id: {
          type: 'string',
          description: 'The Google calendar ID containing the event',
        },
        event_id: {
          type: 'string',
          description: 'The event ID to update',
        },
        title: { type: 'string', description: 'New event title' },
        start: { type: 'string', description: 'New start datetime (ISO format)' },
        end: { type: 'string', description: 'New end datetime (ISO format)' },
        timezone: { type: 'string', description: 'IANA timezone if changing times' },
        description: { type: 'string', description: 'New description' },
        location: { type: 'string', description: 'New location' },
        attendees: {
          type: 'array',
          items: { type: 'string' },
          description: 'Full replacement attendee list (email addresses)',
        },
      },
      required: ['calendar_id', 'event_id'],
    },
  },
  {
    name: 'calendar_delete_event',
    description: 'Delete or cancel a calendar event. Attendees will be notified.',
    parameters: {
      type: 'object',
      properties: {
        calendar_id: {
          type: 'string',
          description: 'The Google calendar ID containing the event',
        },
        event_id: {
          type: 'string',
          description: 'The event ID to delete',
        },
      },
      required: ['calendar_id', 'event_id'],
    },
  },
  {
    name: 'calendar_find_free_slots',
    description: 'Find available time slots across one or more calendars on a given day. Use this to schedule meetings — checks all specified calendars for conflicts.',
    parameters: {
      type: 'object',
      properties: {
        calendar_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of Google calendar IDs to check for conflicts',
        },
        date: {
          type: 'string',
          description: 'The date to find slots on (ISO format, e.g., "2026-03-20")',
        },
        duration_minutes: {
          type: 'number',
          description: 'Required meeting duration in minutes (e.g., 30, 60, 90)',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone for interpreting working hours (use the client\'s timezone)',
        },
        workday_start: {
          type: 'string',
          description: 'Working hours start time (e.g., "09:00"), default "09:00"',
        },
        workday_end: {
          type: 'string',
          description: 'Working hours end time (e.g., "17:00"), default "17:00"',
        },
      },
      required: ['calendar_ids', 'date', 'duration_minutes', 'timezone'],
    },
  },
  {
    name: 'calendar_associate_notebook',
    description: 'Associate a Google calendar with a notebook (client). Call this when the user tells you which calendar belongs to which client, or when you can infer the match from the calendar name. Once associated, events created for that notebook will use the right timezone automatically.',
    parameters: {
      type: 'object',
      properties: {
        calendar_id: {
          type: 'string',
          description: 'The Google calendar ID to associate',
        },
        notebook_id: {
          type: 'string',
          description: 'The notebook (conversation) ID to associate the calendar with',
        },
        calendar_name: {
          type: 'string',
          description: 'The display name of the calendar',
        },
      },
      required: ['calendar_id', 'notebook_id', 'calendar_name'],
    },
  },
  {
    name: 'set_preferred_name',
    description: "Save the user's preferred name so it appears throughout the app. Call this as soon as the user shares their first name. If the user declines to share their name, call this with name=\"boss\".",
    parameters: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: "The user's first name, or \"boss\" if they declined to share it",
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'suggest_feature',
    description: "Submit a feature suggestion from the user to the Minai team. The user can earn up to $10 in app credits if their suggestion is accepted. Use this when a user describes a feature they'd like to see, a tool they'd find useful, or an improvement to Minai.",
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'A short title for the feature suggestion (max 100 characters)',
        },
        description: {
          type: 'string',
          description: "The user's detailed description of the feature they want",
        },
      },
      required: ['title', 'description'],
    },
  },
  {
    name: 'create_notebook',
    description: "Create a new notebook for the user. Use this when the user asks to start a new project, client, or topic area. A notebook organizes all related chat, notes, and files together.",
    parameters: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'The name of the notebook (e.g. the client name, project name, or topic)',
        },
      },
      required: ['title'],
    },
  },
  {
    name: 'create_note',
    description: "Create a note inside a notebook. Use this to save structured information — a client profile, meeting notes, a summary, extracted data from a screenshot, etc.",
    parameters: {
      type: 'object',
      properties: {
        notebook_id: {
          type: 'string',
          description: 'The ID of the notebook to create the note in',
        },
        title: {
          type: 'string',
          description: 'A short title for the note',
        },
        content: {
          type: 'string',
          description: 'The note content in plain text or markdown',
        },
      },
      required: ['notebook_id', 'title', 'content'],
    },
  },
  {
    name: 'open_sidebar',
    description: "Signal the user's interface to open the sidebar so they can see their notebooks and notes.",
    parameters: { type: 'object', properties: {} },
  },

  // ─── Image tools ──────────────────────────────────────────────────────────

  {
    name: 'generate_image',
    description: "Generate an original image from a text description. Use for creating illustrations, backgrounds, concepts, logos, scenes, etc. Do NOT use if the user has uploaded a photo they want edited — use edit_image instead.",
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Detailed description of the image to generate. Be specific about style, lighting, composition, colors.',
        },
        size: {
          type: 'string',
          description: 'Output dimensions as WIDTHxHEIGHT. Common sizes: "1024*1024" (square), "1792*1024" (landscape), "1024*1792" (portrait). Default: "1024*1024".',
        },
      },
      required: ['prompt'],
    },
  },
  {
    name: 'edit_image',
    description: "Edit or transform an image. Use for: professional headshots, background replacement, style transfers, object removal, color adjustments, artistic effects, etc. Call this when the user wants to edit an image — either one they just attached to their current message, OR one that already appeared earlier in the conversation (you do NOT need them to re-upload). If the user refers to 'the photo', 'the image', 'it', or wants to iterate on a previous result, call this tool. The IMAGE CONTEXT system message lists all available images with their indices.",
    parameters: {
      type: 'object',
      properties: {
        prompt: {
          type: 'string',
          description: 'Clear instruction describing what to change. Examples: "professional headshot with neutral grey background, sharp focus, studio lighting", "replace the background with a beach sunset", "convert to oil painting style".',
        },
        image_index: {
          type: 'number',
          description: 'Which image to edit from the available context images (see IMAGE CONTEXT). 0 = most recent image (default). Use this to select the user\'s original upload vs. a previously generated image.',
        },
        size: {
          type: 'string',
          description: 'Output dimensions as WIDTHxHEIGHT. Default: "1024*1024". Use "1024*1792" for portrait, "1792*1024" for landscape.',
        },
      },
      required: ['prompt'],
    },
  },

  // ─── File tools ──────────────────────────────────────────────────────────

  {
    name: 'list_files',
    description: 'List all files uploaded to the current notebook/conversation. Shows file names, types, sizes, and IDs. Call this when the user asks about their uploaded documents.',
    parameters: {
      type: 'object',
      properties: {},
      required: [],
    },
  },
  {
    name: 'read_file',
    description: 'Read the parsed text content of an uploaded file. Works for PDFs, DOCX, TXT, CSV files. Use this to answer questions about a document, summarize it, extract data from it, etc. Get file IDs from list_files first.',
    parameters: {
      type: 'object',
      properties: {
        file_id: {
          type: 'string',
          description: 'The file ID to read (get IDs from list_files)',
        },
      },
      required: ['file_id'],
    },
  },
  {
    name: 'search_files',
    description: 'Search across all uploaded files in the current notebook for a text query. Returns matching snippets with file names. Useful for finding specific information across multiple documents.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The text to search for across all file contents',
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

// ─── Calendar tool executors ──────────────────────────────────────────────────

async function calendarListCalendars(userId: string): Promise<string> {
  const calendars = await gcal.listCalendars(userId);
  if (calendars.length === 0) return 'No calendars found.';

  const lines = calendars.map((c) => {
    const association = c.notebookName ? ` → Notebook: "${c.notebookName}"` : ' → (not yet linked to a notebook)';
    const shared = c.isShared ? ' [shared]' : ' [owned]';
    return `• ${c.name}${shared}${association}\n  ID: ${c.id}${c.timeZone ? `\n  Timezone: ${c.timeZone}` : ''}`;
  });

  return `Found ${calendars.length} calendar(s):\n\n${lines.join('\n\n')}`;
}

async function calendarGetEvents(userId: string, args: Record<string, unknown>): Promise<string> {
  const events = await gcal.getEvents({
    userId,
    calendarId: args.calendar_id as string,
    startDate: args.start_date as string,
    endDate: args.end_date as string,
    maxResults: args.max_results as number | undefined,
    query: args.query as string | undefined,
  });

  if (events.length === 0) return `No events found between ${args.start_date} and ${args.end_date}.`;

  const lines = events.map((e) => {
    const parts = [`**${e.title}**`, `  Time: ${e.start} → ${e.end}`];
    if (e.location) parts.push(`  Location: ${e.location}`);
    if (e.attendees?.length) parts.push(`  Attendees: ${e.attendees.join(', ')}`);
    if (e.link) parts.push(`  Link: ${e.link}`);
    parts.push(`  Event ID: ${e.id}`);
    return parts.join('\n');
  });

  return `${events.length} event(s):\n\n${lines.join('\n\n')}`;
}

async function calendarCreateEvent(userId: string, args: Record<string, unknown>): Promise<string> {
  // If notebook_id provided, use its timezone automatically
  let timezone = args.timezone as string | undefined;
  if (!timezone && args.notebook_id) {
    timezone = await db.getNotebookTimezone(args.notebook_id as string);
  }
  if (!timezone) timezone = 'UTC';

  const result = await gcal.createEvent({
    userId,
    calendarId: args.calendar_id as string,
    title: args.title as string,
    start: args.start as string,
    end: args.end as string,
    timezone,
    description: args.description as string | undefined,
    location: args.location as string | undefined,
    attendees: args.attendees as string[] | undefined,
  });

  return `Event created successfully:\n\n${result.summary}\n\nEvent ID: ${result.id}`;
}

async function calendarUpdateEvent(userId: string, args: Record<string, unknown>): Promise<string> {
  const result = await gcal.updateEvent({
    userId,
    calendarId: args.calendar_id as string,
    eventId: args.event_id as string,
    title: args.title as string | undefined,
    start: args.start as string | undefined,
    end: args.end as string | undefined,
    timezone: args.timezone as string | undefined,
    description: args.description as string | undefined,
    location: args.location as string | undefined,
    attendees: args.attendees as string[] | undefined,
  });

  return `Event updated successfully:\n\n${result.summary}\n\nEvent ID: ${result.id}`;
}

async function calendarDeleteEvent(userId: string, args: Record<string, unknown>): Promise<string> {
  await gcal.deleteEvent({
    userId,
    calendarId: args.calendar_id as string,
    eventId: args.event_id as string,
  });
  return `Event deleted. Attendees have been notified.`;
}

async function calendarFindFreeSlots(userId: string, args: Record<string, unknown>): Promise<string> {
  const slots = await gcal.findFreeSlots({
    userId,
    calendarIds: args.calendar_ids as string[],
    date: args.date as string,
    durationMinutes: args.duration_minutes as number,
    timezone: args.timezone as string,
    workdayStart: args.workday_start as string | undefined,
    workdayEnd: args.workday_end as string | undefined,
  });

  if (slots.length === 0) {
    return `No free slots of ${args.duration_minutes} minutes found on ${args.date} within working hours.`;
  }

  const fmt = (iso: string) => {
    try {
      return new Date(iso).toLocaleTimeString('en-US', {
        timeZone: args.timezone as string,
        hour: 'numeric',
        minute: '2-digit',
        timeZoneName: 'short',
      });
    } catch { return iso; }
  };

  const lines = slots.map((s, i) => `${i + 1}. ${fmt(s.start)} – ${fmt(s.end)}`);
  return `Free slots on ${args.date} (${args.timezone}):\n\n${lines.join('\n')}`;
}

async function calendarAssociateNotebook(userId: string, args: Record<string, unknown>): Promise<string> {
  await db.associateCalendarWithNotebook(
    userId,
    args.notebook_id as string,
    args.calendar_id as string,
    args.calendar_name as string,
  );
  return `Calendar "${args.calendar_name}" is now linked to this notebook. Future events will use the notebook's timezone automatically.`;
}

async function createNotebook(userId: string, args: { title: string }): Promise<string> {
  const conversation = await db.createConversation(userId, args.title);
  return JSON.stringify({
    success: true,
    notebook_id: conversation.id,
    title: conversation.title,
    __navigate__: `/notebooks/${conversation.id}/chat`,
    __open_sidebar__: true,
  });
}

async function createNoteInNotebook(userId: string, args: { notebook_id: string; title: string; content: string }): Promise<string> {
  const note = await db.createNote(args.notebook_id, userId, args.title, args.content);
  return JSON.stringify({
    success: true,
    note_id: note.id,
    notebook_id: args.notebook_id,
    title: note.title,
    __navigate__: `/notebooks/${args.notebook_id}/notes/${note.id}`,
    __open_sidebar__: true,
  });
}

async function submitFeatureSuggestion(userId: string, args: { title: string; description: string }): Promise<string> {
  await db.pool.query(
    `INSERT INTO feature_suggestions (user_id, title, description) VALUES ($1, $2, $3)`,
    [userId, args.title.slice(0, 100), args.description]
  );
  console.log(`[FeatureSuggestion] New suggestion from ${userId}: "${args.title}"`);

  // Send email notification to the team (fire-and-forget)
  const user = await db.getUserById(userId);
  import('./email.js').then(({ sendFeatureSuggestionEmail }) => {
    sendFeatureSuggestionEmail({
      title: args.title,
      description: args.description,
      userName: user?.display_name ?? null,
      userEmail: user?.email ?? null,
      userId,
    });
  }).catch(console.error);

  return JSON.stringify({
    success: true,
    message: "Suggestion submitted! The platform team has been notified and will reach out if they have questions.",
  });
}

async function setPreferredName(userId: string, args: { name: string }): Promise<string> {
  const name = args.name?.trim();
  if (!name) return 'Name is required.';
  await db.updateUserDisplayName(userId, name);
  // Rename the user's only default conversation to their name
  await db.renameDefaultConversation(userId, name);
  return JSON.stringify({ success: true, name });
}

// ─── Tool Executor ───

export async function executeTool(name: string, args: Record<string, unknown>, userId?: string, images?: ContextImage[], conversationId?: string): Promise<ToolResult> {
  console.log(`[Tools] Executing ${name} with args:`, args);

  let content: string;
  let toolCost: number | undefined;

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

    // Calendar tools — require userId
    case 'calendar_list_calendars':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarListCalendars(userId);
      break;
    case 'calendar_get_events':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarGetEvents(userId, args);
      break;
    case 'calendar_create_event':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarCreateEvent(userId, args);
      break;
    case 'calendar_update_event':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarUpdateEvent(userId, args);
      break;
    case 'calendar_delete_event':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarDeleteEvent(userId, args);
      break;
    case 'calendar_find_free_slots':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarFindFreeSlots(userId, args);
      break;
    case 'calendar_associate_notebook':
      if (!userId) { content = 'Calendar tools require an authenticated session.'; break; }
      content = await calendarAssociateNotebook(userId, args);
      break;

    case 'set_preferred_name':
      if (!userId) { content = 'Authentication required.'; break; }
      content = await setPreferredName(userId, args as { name: string });
      break;

    case 'suggest_feature':
      if (!userId) { content = 'Authentication required.'; break; }
      content = await submitFeatureSuggestion(userId, args as { title: string; description: string });
      break;

    case 'create_notebook':
      if (!userId) { content = 'Authentication required.'; break; }
      content = await createNotebook(userId, args as { title: string });
      break;

    case 'create_note':
      if (!userId) { content = 'Authentication required.'; break; }
      content = await createNoteInNotebook(userId, args as { notebook_id: string; title: string; content: string });
      break;

    case 'open_sidebar':
      content = JSON.stringify({ success: true, __open_sidebar__: true });
      break;

    case 'generate_image': {
      const prompt = args.prompt as string;
      const size = (args.size as string | undefined) ?? '1024*1024';
      console.log(`[Tools] Generating image: "${prompt}" (${size})`);
      try {
        const url = await imageGen.generateImage(prompt, size);
        content = JSON.stringify({ image_url: url, prompt });
        toolCost = PRICING.image_gen_cost_usd;
      } catch (err) {
        content = `Image generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
      break;
    }

    case 'edit_image': {
      const prompt = args.prompt as string;
      const size = (args.size as string | undefined) ?? '1024*1024';
      const imageIndex = typeof args.image_index === 'number' ? args.image_index : 0;
      const sourceCtx = images?.[imageIndex] ?? images?.[0];
      if (!sourceCtx) {
        content = 'No image found. Please attach a photo to your message and try again.';
        break;
      }
      console.log(`[Tools] Editing image[${imageIndex}] (${sourceCtx.source}): "${prompt}" (${size})`);
      try {
        const url = await imageGen.editImage(prompt, sourceCtx.url, size);
        content = JSON.stringify({ image_url: url, prompt });
        toolCost = PRICING.image_edit_cost_usd;
      } catch (err) {
        content = `Image editing failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
      break;
    }

    // ─── File tools ──────────────────────────────────────────────────────────

    case 'list_files': {
      if (!userId || !conversationId) { content = 'Authentication required.'; break; }
      const files = await db.getNotebookFiles(conversationId, userId);
      if (files.length === 0) { content = 'No files uploaded to this notebook.'; break; }
      content = files.map((f) =>
        `- ${f.display_name} (${f.mime_type}, ${(f.file_size / 1024).toFixed(1)} KB, status: ${f.parse_status})\n  ID: ${f.id}`
      ).join('\n');
      break;
    }

    case 'read_file': {
      if (!userId || !conversationId) { content = 'Authentication required.'; break; }
      const fileId = args.file_id as string;
      const result = await db.getNotebookFileContent(fileId, conversationId, userId);
      if (!result) { content = 'File not found.'; break; }
      if (result.parse_status !== 'done' || !result.parsed_text) {
        content = `File "${result.display_name}" has no parsed text (status: ${result.parse_status}). It may still be processing or the format is unsupported.`;
        break;
      }
      const text = result.parsed_text.length > 8000
        ? result.parsed_text.slice(0, 8000) + '\n\n... [truncated — file has more content]'
        : result.parsed_text;
      content = `Content of "${result.display_name}":\n\n${text}`;
      break;
    }

    case 'search_files': {
      if (!userId || !conversationId) { content = 'Authentication required.'; break; }
      const query = args.query as string;
      const results = await db.searchNotebookFiles(conversationId, userId, query);
      if (results.length === 0) { content = `No matches found for "${query}" across uploaded files.`; break; }
      content = results.map((r) =>
        `**${r.display_name}** (ID: ${r.id}):\n  ...${r.snippet}...`
      ).join('\n\n');
      break;
    }

    default:
      content = `Unknown tool: ${name}`;
  }

  return { name, content, cost_usd: toolCost };
}
