/**
 * Lightpanda Browse Service
 *
 * Thin HTTP wrapper around Lightpanda headless browser.
 * Accepts POST /browse with { url, actions?, selector?, timeout? }
 * Returns { ok, url, title, text, links? } or { ok: false, error }.
 *
 * Actions let callers interact with the page before extracting content:
 *   - { action: "type", selector, text }  — type into an input/textarea
 *   - { action: "click", selector }       — click a button/link/element
 *   - { action: "select", selector, value } — pick an <option> in a <select>
 *   - { action: "wait", selector, timeout? } — wait for an element to appear
 *   - { action: "wait_ms", ms }           — sleep for N milliseconds
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
const MAX_ACTIONS = 20;

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

async function executeActions(page, actions) {
  const log = [];
  for (const step of actions.slice(0, MAX_ACTIONS)) {
    const { action, selector, text, value, timeout: waitTimeout, ms } = step;
    try {
      switch (action) {
        case 'type':
          if (!selector || !text) throw new Error('type requires "selector" and "text"');
          await page.waitForSelector(selector, { timeout: 5000 });
          // Clear existing value first, then type
          await page.$eval(selector, (el) => { el.value = ''; });
          await page.type(selector, text);
          log.push(`typed "${text}" into ${selector}`);
          break;

        case 'click':
          if (!selector) throw new Error('click requires "selector"');
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.click(selector);
          // Brief pause for navigation/rendering after click
          await new Promise((r) => setTimeout(r, 500));
          log.push(`clicked ${selector}`);
          break;

        case 'select':
          if (!selector || value === undefined) throw new Error('select requires "selector" and "value"');
          await page.waitForSelector(selector, { timeout: 5000 });
          await page.select(selector, value);
          log.push(`selected "${value}" in ${selector}`);
          break;

        case 'wait':
          if (!selector) throw new Error('wait requires "selector"');
          await page.waitForSelector(selector, { timeout: waitTimeout || 10000 });
          log.push(`found ${selector}`);
          break;

        case 'wait_ms':
          await new Promise((r) => setTimeout(r, Math.min(ms || 1000, 5000)));
          log.push(`waited ${Math.min(ms || 1000, 5000)}ms`);
          break;

        default:
          log.push(`unknown action: ${action}`);
      }
    } catch (err) {
      log.push(`${action} ${selector || ''} failed: ${err.message}`);
      // Don't stop on action failure — continue with remaining actions
    }
  }
  return log;
}

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

  // Also extract form fields so the LLM knows what's available to interact with
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
        : el.value || '';
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

async function browse(url, actions, selector, timeout) {
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

      // Execute actions if provided
      let actionLog = [];
      if (actions && actions.length > 0) {
        actionLog = await executeActions(page, actions);
      }

      // Extract page content
      const extracted = await extractPage(page, selector);

      return {
        ok: true,
        url: page.url(), // may have changed after clicks/navigation
        ...extracted,
        actions_performed: actionLog.length > 0 ? actionLog : undefined,
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

  const { url, actions, selector, timeout } = parsed;
  if (!url || typeof url !== 'string') {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'Missing "url" field' }));
    return;
  }

  const callerIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const ts = new Date().toISOString();
  const startMs = Date.now();
  const actionSummary = actions?.length ? ` | ${actions.length} actions` : '';

  console.log(`[Browse] ${ts} | ${callerIp} | REQ ${url}${actionSummary}${selector ? ` (selector: ${selector})` : ''} | queue: ${queue.length}`);

  try {
    const result = await enqueue(() =>
      browse(url, actions || [], selector || null, timeout || DEFAULT_TIMEOUT)
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
