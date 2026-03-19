/**
 * LLM Proxy — OpenAI-compatible HTTP server that sits between Pi agents and DashScope.
 *
 * - Accepts requests from local Pi processes at localhost:LLM_PROXY_PORT
 * - Authenticates via Bearer token (user ID passed as the "API key")
 * - Checks user balance before forwarding
 * - Forwards to DashScope with the real API key
 * - Tracks token usage per user, deducts from balance
 * - Rate limits per user
 *
 * Pi sees this as a standard OpenAI-compatible endpoint.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'http';
import * as db from './db.js';
import { calculateCost } from '../config/pricing.js';
import { MODEL_DEEP } from './providers/index.js';

const PROXY_PORT = parseInt(process.env.LLM_PROXY_PORT ?? '3009');
const DASHSCOPE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions';
const DASHSCOPE_KEY = process.env.DASHSCOPE_API_KEY ?? '';

// Rate limiting: max requests per user per minute
const RATE_LIMIT_RPM = parseInt(process.env.PI_RATE_LIMIT_RPM ?? '20');
const rateCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let entry = rateCounts.get(userId);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + 60_000 };
    rateCounts.set(userId, entry);
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_RPM;
}

async function checkBalance(userId: string): Promise<boolean> {
  const balance = await db.getBalance(userId);
  if (!balance) return false;
  return (balance.free_credit_usd + balance.balance_usd) > 0;
}

async function deductUsage(userId: string, inputTokens: number, outputTokens: number): Promise<void> {
  const cost = calculateCost(MODEL_DEEP, inputTokens, outputTokens);
  if (cost <= 0) return;

  const freeCreditUsed = await db.deductFreeCredit(userId, cost);
  const chargeableCost = cost - freeCreditUsed;
  if (chargeableCost > 0) {
    await db.deductBalance(userId, chargeableCost);
    await db.recordPayment(userId, -chargeableCost, 'usage');
  }
  console.log(`[LLMProxy] User ${userId.slice(0, 8)}: ${inputTokens}in/${outputTokens}out = $${cost.toFixed(6)}`);
}

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function sendError(res: ServerResponse, status: number, message: string) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { message, type: 'proxy_error' } }));
}

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  // Only handle POST /v1/chat/completions (OpenAI-compatible)
  if (req.method !== 'POST' || !req.url?.includes('/chat/completions')) {
    // Pass through model list requests
    if (req.method === 'GET' && req.url?.includes('/models')) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ data: [{ id: MODEL_DEEP, object: 'model' }] }));
      return;
    }
    sendError(res, 404, 'Not found');
    return;
  }

  // Auth: Bearer token is the user ID — only accept IDs with an active agent session
  const auth = req.headers.authorization ?? '';
  const userId = auth.replace('Bearer ', '').trim();
  if (!userId || userId.length < 16) {
    sendError(res, 401, 'Invalid authorization');
    return;
  }

  // Verify this user actually has a running agent session (prevents user ID guessing)
  const { sessionManager } = await import('./pi-agent.js');
  const session = sessionManager.get(userId);
  if (!session?.ready) {
    sendError(res, 403, 'No active agent session');
    return;
  }

  // Rate limit
  if (!checkRateLimit(userId)) {
    sendError(res, 429, 'Rate limit exceeded — too many requests per minute');
    return;
  }

  // Balance check
  try {
    const hasBalance = await checkBalance(userId);
    if (!hasBalance) {
      sendError(res, 402, 'Insufficient balance — please top up your account');
      return;
    }
  } catch {
    sendError(res, 500, 'Balance check failed');
    return;
  }

  // Read and parse request body
  const body = await readBody(req);
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body.toString());
  } catch {
    sendError(res, 400, 'Invalid JSON body');
    return;
  }

  const isStreaming = parsed.stream === true;

  // Forward to DashScope
  try {
    const upstream = await fetch(DASHSCOPE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DASHSCOPE_KEY}`,
      },
      body: JSON.stringify(parsed),
    });

    if (!upstream.ok) {
      const errBody = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
      res.end(errBody);
      return;
    }

    if (isStreaming && upstream.body) {
      // Stream response back to Pi, intercept usage from the final chunk
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const reader = upstream.body.getReader();
      const decoder = new TextDecoder();
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);

          // Parse SSE lines for usage data
          for (const line of chunk.split('\n')) {
            if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.usage) {
                inputTokens = data.usage.prompt_tokens ?? data.usage.input_tokens ?? inputTokens;
                outputTokens = data.usage.completion_tokens ?? data.usage.output_tokens ?? outputTokens;
              }
            } catch { /* not all lines are valid JSON */ }
          }
        }
      } finally {
        res.end();
      }

      // Deduct usage after stream completes
      if (inputTokens > 0 || outputTokens > 0) {
        deductUsage(userId, inputTokens, outputTokens).catch(console.error);
      }
    } else {
      // Non-streaming: read full response, extract usage, forward
      const responseBody = await upstream.text();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(responseBody);

      // Extract and deduct usage
      try {
        const data = JSON.parse(responseBody);
        const usage = data.usage;
        if (usage) {
          const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
          const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
          deductUsage(userId, inputTokens, outputTokens).catch(console.error);
        }
      } catch { /* ignore parse errors */ }
    }
  } catch (err) {
    console.error('[LLMProxy] Upstream error:', err);
    sendError(res, 502, 'LLM upstream error');
  }
}

export function startLLMProxy(): number {
  const server = createServer(handleRequest);
  server.listen(PROXY_PORT, '127.0.0.1', () => {
    console.log(`[LLMProxy] OpenAI-compatible proxy on http://127.0.0.1:${PROXY_PORT}`);
  });
  return PROXY_PORT;
}
