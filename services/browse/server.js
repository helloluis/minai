/**
 * Browse Service — Playwright + Chromium + Domain Memories + MCP + OpenAI Tools
 *
 * Thin HTTP wrapper around a headless Chromium browser, with MCP and OpenAI-compatible
 * tool APIs so external apps (Claude Code, Ollama, llama.cpp, etc.) can use these tools.
 *
 * Core endpoints:
 *   POST /browse              — browse a URL with optional actions
 *   GET  /browse/memories     — get learnings for a domain
 *   POST /browse/memories     — save a learning for a domain
 *   GET  /health              — health check
 *
 * MCP server (Streamable HTTP transport, spec 2025-03-26):
 *   POST /mcp                 — JSON-RPC 2.0 endpoint (initialize / tools/list / tools/call)
 *
 * OpenAI-compatible tool API:
 *   GET  /openai/tools        — tool schemas in OpenAI function format
 *   POST /openai/execute      — execute a tool call ({ name, arguments })
 *
 * Actions (for browse):
 *   - { action: "type", selector, text }       — type into an input/textarea
 *   - { action: "click", selector }            — click a button/link/element
 *   - { action: "click_and_wait", selector }   — click and wait for navigation
 *   - { action: "submit", selector? }          — programmatically submit a form
 *   - { action: "evaluate", text }             — run arbitrary JS on the page
 *   - { action: "select", selector, value }    — pick an <option> in a <select>
 *   - { action: "wait", selector, timeout? }   — wait for an element to appear
 *   - { action: "wait_ms", ms }                — sleep for N milliseconds
 *
 * Domain Memories:
 *   The service maintains a SQLite database of per-domain learnings.
 *   When /browse is called, any memories matching the URL's domain are
 *   automatically included in the response so the LLM can use them.
 *
 * web_search availability:
 *   Set BRAVE_API_KEY in env to enable the web_search tool.
 */

import http from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import Database from 'better-sqlite3';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT ?? '3100', 10);
const MAX_TEXT_LENGTH = parseInt(process.env.MAX_TEXT_LENGTH ?? '30000', 10);
const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT ?? '15000', 10);
const MAX_ACTIONS = 20;

// ─── SQLite: Domain Memories ───

const db = new Database(join(__dirname, 'browse_memories.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS browse_page_memories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    learning TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_browse_memories_domain ON browse_page_memories (domain);
`);

const stmtGetMemories = db.prepare('SELECT id, domain, learning, created_at FROM browse_page_memories WHERE domain = ? ORDER BY created_at ASC');
const stmtInsertMemory = db.prepare('INSERT INTO browse_page_memories (domain, learning) VALUES (?, ?)');
const stmtAllMemories = db.prepare('SELECT id, domain, learning, created_at FROM browse_page_memories ORDER BY domain, created_at ASC');
const stmtDeleteMemory = db.prepare('DELETE FROM browse_page_memories WHERE id = ?');

function extractDomain(url) {
  try {
    return new URL(url.startsWith('http') ? url : 'https://' + url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

function getMemoriesForDomain(domain) {
  return stmtGetMemories.all(domain);
}

// ─── Persistent browser instance ───

let browser = null;

async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  console.log('[Browse] Launching Chromium...');
  browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--disable-sync',
      '--no-first-run',
    ],
  });
  console.log('[Browse] Chromium ready');
  return browser;
}

// ─── Safety ───

const BLOCKED_PATTERNS = [
  /^file:/i,
  /^data:/i,
  /^(https?:\/\/)?(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|0\.0\.0\.0)/i,
];

// ─── Actions ───

async function executeActions(page, actions) {
  const log = [];
  for (const step of actions.slice(0, MAX_ACTIONS)) {
    const { action, selector, text, value, timeout: waitTimeout, ms } = step;
    try {
      switch (action) {
        case 'type':
          if (!selector || !text) throw new Error('type requires "selector" and "text"');
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.fill(selector, text);
          log.push(`typed "${text}" into ${selector}`);
          break;

        case 'click':
          if (!selector) throw new Error('click requires "selector"');
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
          await page.waitForTimeout(500);
          log.push(`clicked ${selector}`);
          break;

        case 'click_and_wait':
          if (!selector) throw new Error('click_and_wait requires "selector"');
          await page.waitForSelector(selector, { timeout: 5000 });
          try {
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: waitTimeout || 10000 }),
              page.click(selector),
            ]);
            log.push(`clicked ${selector} → navigated to ${page.url()}`);
          } catch (navErr) {
            log.push(`clicked ${selector} (no navigation: ${navErr.message})`);
          }
          break;

        case 'submit':
          try {
            const formSelector = selector || 'form';
            await page.waitForSelector(formSelector, { timeout: 5000 });
            await Promise.all([
              page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: waitTimeout || 10000 }),
              page.evaluate((sel) => {
                const form = document.querySelector(sel);
                if (form && form.submit) form.submit();
                else throw new Error('Form not found: ' + sel);
              }, formSelector),
            ]);
            log.push(`submitted ${formSelector} → ${page.url()}`);
          } catch (submitErr) {
            log.push(`submit ${selector || 'form'} failed: ${submitErr.message}`);
          }
          break;

        case 'evaluate':
          if (!text) throw new Error('evaluate requires "text" (the JS expression)');
          try {
            const evalResult = await page.evaluate(text);
            log.push(`eval: ${JSON.stringify(evalResult)}`.slice(0, 200));
          } catch (evalErr) {
            log.push(`eval failed: ${evalErr.message}`);
          }
          break;

        case 'select':
          if (!selector || value === undefined) throw new Error('select requires "selector" and "value"');
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.selectOption(selector, value);
          log.push(`selected "${value}" in ${selector}`);
          break;

        case 'wait':
          if (!selector) throw new Error('wait requires "selector"');
          await page.waitForSelector(selector, { timeout: waitTimeout || 10000 });
          log.push(`found ${selector}`);
          break;

        case 'wait_ms':
          await page.waitForTimeout(Math.min(ms || 1000, 5000));
          log.push(`waited ${Math.min(ms || 1000, 5000)}ms`);
          break;

        default:
          log.push(`unknown action: ${action}`);
      }
    } catch (err) {
      log.push(`${action} ${selector || ''} failed: ${err.message}`);
    }
  }
  return log;
}

// ─── Page extraction ───

async function extractPage(page, selector) {
  let text;
  if (selector) {
    try {
      await page.waitForSelector(selector, { timeout: 5000 });
      text = await page.$eval(selector, (el) => el.innerText || el.textContent || '');
    } catch {
      text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || '');
    }
  } else {
    text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || '');
  }

  const title = await page.title().catch(() => '');

  const links = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('a[href]'))
      .slice(0, 50)
      .map((a) => ({ text: (a.textContent || '').trim().slice(0, 100), href: a.href }))
      .filter((l) => l.href && l.text);
  }).catch(() => []);

  const forms = await page.evaluate(() => {
    const inputs = Array.from(document.querySelectorAll('input, textarea, select, button[type="submit"], input[type="submit"]'));
    return inputs.slice(0, 40).map((el) => {
      const tag = el.tagName.toLowerCase();
      const type = el.getAttribute('type') || '';
      const name = el.getAttribute('name') || '';
      const id = el.getAttribute('id') || '';
      const placeholder = el.getAttribute('placeholder') || '';
      const label = id ? document.querySelector(`label[for="${id}"]`)?.textContent?.trim() : '';
      const value = (tag === 'select')
        ? Array.from(el.options || []).map((o) => `${o.value}:${o.text.trim()}`).join(', ')
        : '';
      const selectorParts = [];
      if (id) selectorParts.push(`#${id}`);
      else if (name) selectorParts.push(`${tag}[name="${name}"]`);
      else selectorParts.push(tag);
      return {
        tag,
        type: type || undefined,
        name: name || undefined,
        id: id || undefined,
        placeholder: placeholder || undefined,
        label: label || undefined,
        value: value || undefined,
        selector: selectorParts[0],
      };
    }).filter((f) => f.type !== 'hidden');
  }).catch(() => []);

  const trimmed = (text || '').trim();
  const truncated = trimmed.length > MAX_TEXT_LENGTH
    ? trimmed.slice(0, MAX_TEXT_LENGTH) + `\n\n[Truncated — ${trimmed.length} chars total]`
    : trimmed;

  return { title, text: truncated, links: links.slice(0, 30), forms, length: trimmed.length };
}

// ─── Browse logic ───

async function browse(url, actions, selector, timeout) {
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(url)) {
      return { ok: false, error: `Blocked URL pattern: ${url}` };
    }
  }

  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  const b = await getBrowser();
  const context = await b.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 720 },
  });

  try {
    const page = await context.newPage();
    page.setDefaultTimeout(timeout);

    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout });

      let actionLog = [];
      if (actions && actions.length > 0) {
        actionLog = await executeActions(page, actions);
      }

      const extracted = await extractPage(page, selector);

      // Look up domain memories
      const domain = extractDomain(url);
      const memories = domain ? getMemoriesForDomain(domain) : [];

      return {
        ok: true,
        url: page.url(),
        ...extracted,
        actions_performed: actionLog.length > 0 ? actionLog : undefined,
        memories: memories.length > 0 ? memories.map((m) => m.learning) : undefined,
      };
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
  }
}

// ─── Tool definitions ───

const TOOL_BROWSE_PAGE = {
  name: 'browse_page',
  description: 'Browse a URL using a headless Chromium browser. Returns the page text, title, links, and form fields. Optionally performs interactions (click, type, select, evaluate JS, etc.) before extracting content. Use this to read web pages, fill forms, or navigate dynamic sites.',
  inputSchema: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'URL to browse (must begin with http:// or https://)',
      },
      actions: {
        type: 'array',
        description: 'Ordered list of interactions to perform on the page before extracting content',
        items: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: ['type', 'click', 'click_and_wait', 'submit', 'evaluate', 'select', 'wait', 'wait_ms'],
              description: 'Action type',
            },
            selector: { type: 'string', description: 'CSS selector for the target element' },
            text: { type: 'string', description: 'Text to type (for "type") or JS expression (for "evaluate")' },
            value: { type: 'string', description: 'Option value to select (for "select")' },
            ms: { type: 'number', description: 'Milliseconds to wait (for "wait_ms", max 5000)' },
          },
          required: ['action'],
        },
      },
      selector: {
        type: 'string',
        description: 'CSS selector to extract only a specific section of the page instead of the full body',
      },
      timeout: {
        type: 'number',
        description: 'Navigation timeout in milliseconds (default 15000)',
      },
    },
    required: ['url'],
  },
};

const TOOL_WEB_SEARCH = {
  name: 'web_search',
  description: 'Search the web using Brave Search. Returns relevant results with titles, URLs, and content excerpts. Prefer this over browse_page when you need to find information across multiple sources.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query' },
      count: { type: 'number', description: 'Number of results to return (default 5, max 10)' },
    },
    required: ['query'],
  },
};

function getTools() {
  return process.env.BRAVE_API_KEY
    ? [TOOL_BROWSE_PAGE, TOOL_WEB_SEARCH]
    : [TOOL_BROWSE_PAGE];
}

// ─── Web search (Brave) ───

async function webSearch(query, count = 5) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) throw new Error('web_search is not available (BRAVE_API_KEY not configured)');

  const n = Math.min(count, 10);

  // AI-optimised LLM context endpoint — returns pre-extracted content
  try {
    const r = await fetch(
      `https://api.search.brave.com/res/v1/llm/context?q=${encodeURIComponent(query)}&count=${n}`,
      { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }
    );
    if (r.ok) {
      const data = await r.json();
      if (data.context) return data.context;
    }
  } catch { /* fall through to standard endpoint */ }

  // Standard web search fallback
  const r = await fetch(
    `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${n}`,
    { headers: { Accept: 'application/json', 'X-Subscription-Token': key } }
  );
  if (!r.ok) throw new Error(`Brave search failed: ${r.status} ${r.statusText}`);

  const data = await r.json();
  const results = data.web?.results || [];
  if (!results.length) return 'No results found.';

  return results.map((item, i) => {
    const age = item.age ? `\n   (${item.age})` : '';
    return `${i + 1}. **${item.title}**${age}\n   ${item.url}\n   ${item.description || ''}`;
  }).join('\n\n');
}

// ─── Tool execution ───

async function executeTool(name, args) {
  switch (name) {
    case 'browse_page': {
      if (!args?.url) throw new Error('Missing required parameter: url');
      const result = await browse(
        args.url,
        args.actions || [],
        args.selector || null,
        args.timeout || DEFAULT_TIMEOUT
      );
      if (!result.ok) throw new Error(result.error || 'Browse failed');
      return formatBrowseResult(result);
    }
    case 'web_search': {
      if (!args?.query) throw new Error('Missing required parameter: query');
      return webSearch(args.query, args.count ?? 5);
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

function formatBrowseResult(result) {
  const parts = [
    `Page: ${result.title}`,
    `URL: ${result.url}`,
    `Length: ${result.length} chars`,
  ];

  if (result.actions_performed?.length) {
    parts.push(`Actions: ${result.actions_performed.join(' → ')}`);
  }
  if (result.memories?.length) {
    parts.push(`\nDomain tips:\n${result.memories.map((m) => `- ${m}`).join('\n')}`);
  }

  parts.push('', result.text);

  if (result.links?.length) {
    const linkList = result.links.slice(0, 20).map((l) => `- [${l.text}](${l.href})`).join('\n');
    parts.push(`\nLinks:\n${linkList}`);
  }

  return parts.join('\n');
}

// ─── MCP server (Streamable HTTP transport, spec 2025-03-26) ───

const MCP_PROTOCOL_VERSION = '2025-03-26';

function mcpOk(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function mcpErr(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMcp(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Mcp-Session-Id');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const raw = await readBody(req);
  let msg;
  try { msg = JSON.parse(raw); } catch { return json(res, 400, mcpErr(null, -32700, 'Parse error')); }

  if (msg.jsonrpc !== '2.0') {
    return json(res, 400, mcpErr(msg.id ?? null, -32600, 'Invalid Request'));
  }

  const { id, method, params } = msg;
  // MCP notifications have no id — acknowledge with 202, no body
  const isNotification = id === undefined || id === null;

  switch (method) {
    case 'initialize':
      return json(res, 200, mcpOk(id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: 'kamai', version: '0.0.2' },
      }));

    case 'ping':
      if (isNotification) { res.writeHead(202); return res.end(); }
      return json(res, 200, mcpOk(id, {}));

    case 'notifications/initialized':
      res.writeHead(202);
      return res.end();

    case 'tools/list':
      return json(res, 200, mcpOk(id, { tools: getTools() }));

    case 'tools/call': {
      const { name, arguments: args } = params || {};
      try {
        const text = await executeTool(name, args || {});
        return json(res, 200, mcpOk(id, { content: [{ type: 'text', text }] }));
      } catch (err) {
        return json(res, 200, mcpOk(id, {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        }));
      }
    }

    default:
      if (isNotification) { res.writeHead(202); return res.end(); }
      return json(res, 200, mcpErr(id, -32601, `Method not found: ${method}`));
  }
}

// ─── OpenAI-compatible tool API ───

function handleOpenAITools(_req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const tools = getTools().map((t) => ({
    type: 'function',
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
  return json(res, 200, tools);
}

async function handleOpenAIExecute(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }

  const raw = await readBody(req);
  let data;
  try { data = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON' }); }

  const { name } = data;
  let args = data.arguments;
  if (typeof args === 'string') {
    try { args = JSON.parse(args); } catch { return json(res, 400, { error: 'Invalid arguments JSON' }); }
  }

  try {
    const content = await executeTool(name, args || {});
    return json(res, 200, { content });
  } catch (err) {
    return json(res, 400, { error: err.message });
  }
}

// ─── Route helpers ───

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => resolve(body));
  });
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function parseUrl(reqUrl) {
  return new URL(reqUrl, 'http://localhost');
}

// ─── HTTP server ───

const server = http.createServer(async (req, res) => {
  const parsed = parseUrl(req.url);
  const path = parsed.pathname;

  // ── Health check ──
  if (req.method === 'GET' && path === '/health') {
    const memCount = db.prepare('SELECT COUNT(*) AS n FROM browse_page_memories').get();
    const tools = getTools().map((t) => t.name);
    return json(res, 200, { ok: true, engine: 'playwright-chromium', memories: memCount.n, tools });
  }

  // ── MCP (Streamable HTTP transport) ──
  if ((req.method === 'POST' || req.method === 'OPTIONS') && path === '/mcp') {
    return handleMcp(req, res);
  }

  // ── OpenAI-compatible tool API ──
  if (req.method === 'GET' && path === '/openai/tools') {
    return handleOpenAITools(req, res);
  }
  if ((req.method === 'POST' || req.method === 'OPTIONS') && path === '/openai/execute') {
    return handleOpenAIExecute(req, res);
  }

  // ── GET /browse/memories?domain=... ──
  if (req.method === 'GET' && path === '/browse/memories') {
    const domain = parsed.searchParams.get('domain');
    if (domain) {
      const memories = getMemoriesForDomain(domain.replace(/^www\./, ''));
      return json(res, 200, { ok: true, domain, memories });
    }
    // No domain filter → return all
    const all = stmtAllMemories.all();
    return json(res, 200, { ok: true, memories: all });
  }

  // ── POST /browse/memories ──
  if (req.method === 'POST' && path === '/browse/memories') {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }

    const { domain, learning } = data;
    if (!domain || !learning) return json(res, 400, { ok: false, error: 'Missing "domain" and "learning"' });

    const cleanDomain = domain.replace(/^www\./, '').toLowerCase();
    const result = stmtInsertMemory.run(cleanDomain, learning);
    console.log(`[Memory] Saved for ${cleanDomain}: "${learning.slice(0, 80)}"`);
    return json(res, 201, { ok: true, id: result.lastInsertRowid, domain: cleanDomain, learning });
  }

  // ── DELETE /browse/memories/:id ──
  if (req.method === 'DELETE' && path.startsWith('/browse/memories/')) {
    const id = parseInt(path.split('/').pop(), 10);
    if (isNaN(id)) return json(res, 400, { ok: false, error: 'Invalid ID' });
    stmtDeleteMemory.run(id);
    return json(res, 200, { ok: true, deleted: id });
  }

  // ── POST /browse ──
  if (req.method === 'POST' && path === '/browse') {
    const body = await readBody(req);
    let data;
    try { data = JSON.parse(body); } catch { return json(res, 400, { ok: false, error: 'Invalid JSON' }); }

    const { url, actions, selector, timeout } = data;
    if (!url || typeof url !== 'string') return json(res, 400, { ok: false, error: 'Missing "url" field' });

    const callerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const ts = new Date().toISOString();
    const startMs = Date.now();
    const actionSummary = actions?.length ? ` | ${actions.length} actions` : '';

    console.log(`[Browse] ${ts} | ${callerIp} | REQ ${url}${actionSummary}${selector ? ` (${selector})` : ''}`);

    try {
      const result = await browse(url, actions || [], selector || null, timeout || DEFAULT_TIMEOUT);
      const elapsed = Date.now() - startMs;
      json(res, 200, result);
      const memTag = result.memories?.length ? ` | ${result.memories.length} memories` : '';
      console.log(`[Browse] ${ts} | ${callerIp} | OK  ${url} | ${result.length} chars | ${elapsed}ms${memTag}`);
    } catch (err) {
      const elapsed = Date.now() - startMs;
      console.error(`[Browse] ${ts} | ${callerIp} | ERR ${url} | ${err.message} | ${elapsed}ms`);
      json(res, 500, { ok: false, error: err.message || 'Browse failed' });
    }
    return;
  }

  json(res, 404, { ok: false, error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  const searchEnabled = process.env.BRAVE_API_KEY ? 'yes' : 'no (set BRAVE_API_KEY to enable)';
  console.log(`[Browse] HTTP server listening on port ${PORT} (Playwright + Chromium + Memories)`);
  console.log(`[Browse] MCP endpoint:    POST /mcp`);
  console.log(`[Browse] OpenAI endpoint: GET /openai/tools  POST /openai/execute`);
  console.log(`[Browse] web_search:      ${searchEnabled}`);
});

// Graceful shutdown
process.on('SIGINT', async () => { db.close(); await browser?.close(); process.exit(0); });
process.on('SIGTERM', async () => { db.close(); await browser?.close(); process.exit(0); });
