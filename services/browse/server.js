/**
 * Browse Service — Playwright + Chromium + Domain Memories
 *
 * Thin HTTP wrapper around a headless Chromium browser.
 *
 * Endpoints:
 *   POST /browse           — browse a URL with optional actions
 *   GET  /browse/memories   — get learnings for a domain
 *   POST /browse/memories   — save a learning for a domain
 *   GET  /health            — health check
 *
 * Actions let callers interact with the page before extracting content:
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
    return json(res, 200, { ok: true, engine: 'playwright-chromium', memories: memCount.n });
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
  console.log(`[Browse] HTTP server listening on port ${PORT} (Playwright + Chromium + Memories)`);
});

// Graceful shutdown
process.on('SIGINT', async () => { db.close(); await browser?.close(); process.exit(0); });
process.on('SIGTERM', async () => { db.close(); await browser?.close(); process.exit(0); });
