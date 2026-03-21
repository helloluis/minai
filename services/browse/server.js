/**
 * Lightpanda Browse Service
 *
 * Thin HTTP wrapper around Lightpanda headless browser.
 * Accepts POST /browse with { url, selector?, timeout? }
 * Returns { ok, url, title, text, links? } or { ok: false, error }.
 *
 * Serializes requests through a queue (Lightpanda beta has a
 * multi-client bug where closing one CDP connection kills others).
 */

import http from 'node:http';
import { lightpanda } from '@lightpanda/browser';
import puppeteer from 'puppeteer-core';

const PORT = parseInt(process.env.PORT ?? '3100', 10);
const CDP_PORT = parseInt(process.env.CDP_PORT ?? '9222', 10);
const MAX_TEXT_LENGTH = parseInt(process.env.MAX_TEXT_LENGTH ?? '30000', 10);
const DEFAULT_TIMEOUT = parseInt(process.env.DEFAULT_TIMEOUT ?? '15000', 10);

// ─── Lightpanda CDP server ───

let cdpProc = null;

async function ensureCDP() {
  if (cdpProc) return;
  console.log(`[Browse] Starting Lightpanda CDP server on port ${CDP_PORT}...`);
  cdpProc = await lightpanda.serve({ host: '127.0.0.1', port: CDP_PORT });
  console.log('[Browse] Lightpanda CDP server ready');
}

// ─── Request queue (serialize to avoid multi-client bug) ───

let busy = false;
const queue = [];

function enqueue(fn) {
  return new Promise((resolve, reject) => {
    queue.push(() => fn().then(resolve, reject));
    drain();
  });
}

function drain() {
  if (busy || queue.length === 0) return;
  busy = true;
  const next = queue.shift();
  next().finally(() => { busy = false; drain(); });
}

// ─── Browse logic ───

const BLOCKED_PATTERNS = [
  /^file:/i,
  /^data:/i,
  /^(https?:\/\/)?(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|0\.0\.0\.0)/i,
];

async function browse(url, selector, timeout) {
  // Safety: block local/private URLs
  for (const pat of BLOCKED_PATTERNS) {
    if (pat.test(url)) {
      return { ok: false, error: `Blocked URL pattern: ${url}` };
    }
  }

  // Ensure URL has protocol
  if (!/^https?:\/\//i.test(url)) {
    url = 'https://' + url;
  }

  await ensureCDP();

  const browser = await puppeteer.connect({
    browserWSEndpoint: `ws://127.0.0.1:${CDP_PORT}`,
  });

  try {
    const page = await browser.newPage();

    try {
      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout,
      });

      // If a selector is specified, wait for it and extract only that element
      let text;
      if (selector) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 });
          text = await page.$eval(selector, (el) => el.innerText || el.textContent || '');
        } catch {
          // Selector not found, fall back to full page
          text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || '');
        }
      } else {
        text = await page.evaluate(() => document.body?.innerText || document.body?.textContent || '');
      }

      const title = await page.title().catch(() => '');

      // Extract links (useful for navigation)
      const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href]'))
          .slice(0, 50)
          .map((a) => ({ text: (a.textContent || '').trim().slice(0, 100), href: a.href }))
          .filter((l) => l.href && l.text);
      }).catch(() => []);

      // Truncate text
      const trimmed = (text || '').trim();
      const truncated = trimmed.length > MAX_TEXT_LENGTH
        ? trimmed.slice(0, MAX_TEXT_LENGTH) + `\n\n[Truncated — ${trimmed.length} chars total]`
        : trimmed;

      return {
        ok: true,
        url,
        title,
        text: truncated,
        links: links.slice(0, 30),
        length: trimmed.length,
      };
    } finally {
      await page.close().catch(() => {});
    }
  } finally {
    await browser.disconnect().catch(() => {});
  }
}

// ─── HTTP server ───

const server = http.createServer(async (req, res) => {
  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, queue: queue.length, busy }));
    return;
  }

  if (req.method !== 'POST' || req.url !== '/browse') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Not found' }));
    return;
  }

  // Read body
  let body = '';
  for await (const chunk of req) body += chunk;

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Invalid JSON' }));
    return;
  }

  const { url, selector, timeout } = parsed;
  if (!url || typeof url !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing "url" field' }));
    return;
  }

  const callerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ts = new Date().toISOString();
  const startMs = Date.now();

  console.log(`[Browse] ${ts} | ${callerIp} | REQ ${url}${selector ? ` (selector: ${selector})` : ''} | queue: ${queue.length}`);

  try {
    const result = await enqueue(() =>
      browse(url, selector || null, timeout || DEFAULT_TIMEOUT)
    );
    const elapsed = Date.now() - startMs;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result));
    console.log(`[Browse] ${ts} | ${callerIp} | OK  ${url} | ${result.length} chars | ${elapsed}ms`);
  } catch (err) {
    const elapsed = Date.now() - startMs;
    console.error(`[Browse] ${ts} | ${callerIp} | ERR ${url} | ${err.message} | ${elapsed}ms`);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: err.message || 'Browse failed' }));
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Browse] HTTP server listening on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => { cdpProc?.kill(); process.exit(0); });
process.on('SIGTERM', () => { cdpProc?.kill(); process.exit(0); });
