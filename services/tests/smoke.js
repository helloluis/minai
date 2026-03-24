#!/usr/bin/env node

/**
 * Minai Production Smoke Test Suite
 *
 * Hits the production API to verify all major features are working.
 * Creates a guest test session, exercises each feature, then reports.
 *
 * Usage:
 *   node smoke.js                    # run all tests against production
 *   node smoke.js --base=http://localhost:3006  # run against local
 *   VERBOSE=1 node smoke.js          # show response details
 *   EMAIL_REPORT=lb@minai.work node smoke.js  # email results (requires RESEND_API_KEY)
 *
 * Exit code: 0 if all pass, 1 if any fail
 */

const BASE = process.argv.find(a => a.startsWith('--base='))?.split('=')[1] ?? 'https://minai.work';
const VERBOSE = !!process.env.VERBOSE;
const EMAIL_REPORT = process.env.EMAIL_REPORT;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

// ─── Test runner ───

const results = [];
let sessionCookie = '';
let testConversationId = '';
let testMessageId = '';

async function test(name, fn) {
  const start = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    results.push({ name, pass: true, ms, detail });
    console.log(`  ✅ ${name} (${ms}ms)`);
    if (VERBOSE && detail) console.log(`     ${detail}`);
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err.message || String(err);
    results.push({ name, pass: false, ms, detail: msg });
    console.log(`  ❌ ${name} (${ms}ms) — ${msg}`);
  }
}

async function api(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Cookie: sessionCookie ? `session=${sessionCookie}` : '',
      ...options.headers,
    },
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  if (!res.ok && !options.allowFail) {
    throw new Error(`${res.status} ${res.statusText}: ${text.slice(0, 200)}`);
  }
  // Extract set-cookie for session
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const match = setCookie.match(/session=([^;]+)/);
    if (match) sessionCookie = match[1];
  }
  return { status: res.status, json, text, headers: res.headers };
}

// Helper: stream SSE and collect response
async function streamChat(conversationId, content) {
  const res = await fetch(`${BASE}/api/conversations/${conversationId}/messages/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Cookie: `session=${sessionCookie}`,
    },
    body: JSON.stringify({ content, mode: 'auto' }),
  });
  if (!res.ok) throw new Error(`Stream failed: ${res.status}`);

  const text = await res.text();
  // Parse SSE events
  let fullContent = '';
  let model = '';
  let hasUsage = false;
  for (const line of text.split('\n')) {
    if (line.startsWith('data: ')) {
      try {
        const data = JSON.parse(line.slice(6));
        if (data.type === 'chunk' && data.content) fullContent += data.content;
        if (data.type === 'start' && data.model) model = data.model;
        if (data.type === 'usage') hasUsage = true;
      } catch {}
    }
  }
  return { fullContent, model, hasUsage, rawLength: text.length };
}

// ─── Tests ───

async function run() {
  console.log(`\n🧪 Minai Smoke Tests — ${BASE}`);
  console.log(`   ${new Date().toISOString()}\n`);

  // ── 1. Health ──
  console.log('── Infrastructure ──');

  await test('API health check', async () => {
    const { json } = await api('/api/health');
    return `status: ${json?.status ?? 'ok'}`;
  });

  await test('Landing page loads', async () => {
    const res = await fetch(BASE);
    if (!res.ok) throw new Error(`${res.status}`);
    const html = await res.text();
    if (!html.includes('minai')) throw new Error('Page content missing');
    return `${html.length} bytes`;
  });

  // ── 2. Auth ──
  console.log('\n── Authentication ──');

  await test('Guest login', async () => {
    const { json } = await api('/api/auth/login', { method: 'POST', body: '{}' });
    if (!json?.user?.id) throw new Error('No user ID returned');
    return `user: ${json.user.id.slice(0, 8)}..., balance: $${json.balance?.free_credit_usd ?? 0}`;
  });

  await test('Session check (GET /api/auth/me)', async () => {
    const { json } = await api('/api/auth/me');
    if (!json?.user?.id) throw new Error('Session invalid');
    return `authenticated as ${json.user.id.slice(0, 8)}...`;
  });

  // ── 3. Conversations ──
  console.log('\n── Conversations ──');

  await test('Create conversation', async () => {
    const { json } = await api('/api/conversations', { method: 'POST', body: '{}' });
    if (!json?.id) throw new Error('No conversation ID');
    testConversationId = json.id;
    return `id: ${json.id.slice(0, 8)}...`;
  });

  await test('List conversations', async () => {
    const { json } = await api('/api/conversations');
    if (!Array.isArray(json)) throw new Error('Expected array');
    return `${json.length} conversation(s)`;
  });

  // ── 4. Chat & Streaming ──
  console.log('\n── Chat & LLM ──');

  await test('Send message + stream response (simple)', async () => {
    const { fullContent, model } = await streamChat(testConversationId, 'What is 2+2? Reply with just the number.');
    if (!fullContent) throw new Error('Empty response');
    if (!fullContent.includes('4')) throw new Error(`Expected "4" in response, got: ${fullContent.slice(0, 100)}`);
    return `model: ${model}, response: ${fullContent.slice(0, 80)}`;
  });

  await test('Send message + stream response (tool call: crypto_price)', async () => {
    const { fullContent, model } = await streamChat(testConversationId, 'What is the current price of BTC?');
    if (!fullContent) throw new Error('Empty response');
    // Should contain a dollar amount
    if (!fullContent.match(/\$[\d,]+/)) throw new Error(`No price in response: ${fullContent.slice(0, 100)}`);
    return `model: ${model}, response: ${fullContent.slice(0, 80)}`;
  });

  await test('Send message + stream response (tool call: web_search)', async () => {
    const { fullContent, model } = await streamChat(testConversationId, 'Search the web for "MiniPay wallet Celo"');
    if (!fullContent) throw new Error('Empty response');
    return `model: ${model}, ${fullContent.length} chars`;
  });

  // ── 5. Messages ──
  console.log('\n── Messages ──');

  await test('Get messages', async () => {
    const { json } = await api(`/api/conversations/${testConversationId}/messages`);
    if (!Array.isArray(json) || json.length === 0) throw new Error('No messages');
    testMessageId = json.find(m => m.role === 'assistant')?.id ?? json[0].id;
    return `${json.length} message(s)`;
  });

  // ── 6. Browse service ──
  console.log('\n── Browse Service ──');

  await test('Browse via chat (uses browse_web tool)', async () => {
    const { fullContent } = await streamChat(
      testConversationId,
      'Use the browse_web tool to visit https://example.com and tell me the title of the page.'
    );
    if (!fullContent) throw new Error('Empty response');
    if (!fullContent.toLowerCase().includes('example')) throw new Error(`Expected "example" in response: ${fullContent.slice(0, 100)}`);
    return `${fullContent.length} chars`;
  });

  // ── 7. Settings endpoints ──
  console.log('\n── Settings & Data ──');

  await test('Get usage stats', async () => {
    const { json } = await api('/api/settings/usage?days=7');
    if (!json?.totals) throw new Error('No totals');
    return `total cost: $${json.totals.total_cost.toFixed(4)}, ${json.daily.length} day(s)`;
  });

  await test('Get payment history', async () => {
    const { json } = await api('/api/settings/payments');
    if (!Array.isArray(json)) throw new Error('Expected array');
    return `${json.length} payment(s)`;
  });

  // ── 8. Share (read-only — test the public endpoint) ──
  console.log('\n── Share ──');

  await test('Public share endpoint', async () => {
    // Test with a known slug or just verify the endpoint responds
    const { status } = await api('/api/share/nonexistent-slug-test', { allowFail: true });
    if (status !== 404) throw new Error(`Expected 404, got ${status}`);
    return 'returns 404 for missing slugs';
  });

  // ── 9. Document generation (via tool) ──
  console.log('\n── Document Generation ──');

  await test('Generate DOCX via chat', async () => {
    const { fullContent } = await streamChat(
      testConversationId,
      'Generate a DOCX document titled "Test Report" with the content: "This is a test document generated by the smoke test suite."'
    );
    if (!fullContent) throw new Error('Empty response');
    return `${fullContent.length} chars response`;
  });

  // ── 10. About tool ──
  console.log('\n── About ──');

  await test('About minai tool', async () => {
    const { fullContent } = await streamChat(testConversationId, 'What is minai? Tell me about yourself.');
    if (!fullContent) throw new Error('Empty response');
    if (!fullContent.toLowerCase().includes('minai')) throw new Error('Response does not mention minai');
    return `${fullContent.length} chars`;
  });

  // ── Cleanup ──
  console.log('\n── Cleanup ──');

  await test('Delete test conversation', async () => {
    const res = await fetch(`${BASE}/api/conversations/${testConversationId}`, {
      method: 'DELETE',
      headers: { Cookie: `session=${sessionCookie}` },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return `deleted`;
  });

  // ── Report ──
  const passed = results.filter(r => r.pass).length;
  const failed = results.filter(r => !r.pass).length;
  const totalMs = results.reduce((sum, r) => sum + r.ms, 0);

  console.log(`\n${'═'.repeat(50)}`);
  console.log(`  ${passed} passed, ${failed} failed, ${results.length} total (${(totalMs / 1000).toFixed(1)}s)`);
  if (failed > 0) {
    console.log(`\n  Failed tests:`);
    for (const r of results.filter(r => !r.pass)) {
      console.log(`    ❌ ${r.name}: ${r.detail}`);
    }
  }
  console.log(`${'═'.repeat(50)}\n`);

  // ── Email report if configured ──
  if (EMAIL_REPORT && RESEND_API_KEY && failed > 0) {
    await sendEmailReport(passed, failed, results);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// ─── Email report ───

async function sendEmailReport(passed, failed, results) {
  const failedTests = results.filter(r => !r.pass);
  const html = `
    <div style="font-family: -apple-system, sans-serif; max-width: 600px;">
      <h2 style="color: ${failed > 0 ? '#dc2626' : '#16a34a'};">
        Minai Smoke Test: ${failed > 0 ? `${failed} FAILED` : 'ALL PASSED'}
      </h2>
      <p>${passed} passed, ${failed} failed — ${new Date().toISOString()}</p>
      <p>Server: ${BASE}</p>
      ${failed > 0 ? `
        <h3>Failed Tests:</h3>
        <ul>
          ${failedTests.map(r => `<li><strong>${r.name}</strong>: ${r.detail}</li>`).join('')}
        </ul>
      ` : ''}
      <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:16px;">
        <tr style="background:#f3f4f6;"><th style="padding:6px;text-align:left;">Test</th><th>Status</th><th>Time</th></tr>
        ${results.map(r => `
          <tr>
            <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;">${r.name}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:center;">${r.pass ? '✅' : '❌'}</td>
            <td style="padding:4px 6px;border-bottom:1px solid #e5e7eb;text-align:right;">${r.ms}ms</td>
          </tr>
        `).join('')}
      </table>
      <p style="color:#888;font-size:12px;margin-top:16px;">Sent from minai smoke test suite</p>
    </div>
  `;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: 'minai <onboarding@resend.dev>',
        to: [EMAIL_REPORT],
        subject: `[minai] Smoke test: ${failed > 0 ? `${failed} FAILED` : 'all passed'}`,
        html,
      }),
    });
    console.log(`📧 Report emailed to ${EMAIL_REPORT}`);
  } catch (err) {
    console.error(`📧 Failed to email report:`, err.message);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
