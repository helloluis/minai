# Minai Smoke Test Suite

Production smoke tests that verify all major features are working end-to-end.

## What it tests

| Category | Tests |
|----------|-------|
| **Infrastructure** | API health, landing page loads |
| **Authentication** | Guest login, session validation |
| **Conversations** | Create, list, delete |
| **Chat & LLM** | Simple response (2+2), tool calls (crypto_price, web_search) |
| **Browse Service** | Health check, page browse |
| **Settings** | Usage stats, payment history |
| **Share** | Public share endpoint (404 for missing) |
| **Document Generation** | DOCX via chat tool |
| **About** | about_minai tool invocation |

Each test creates a temporary guest account, exercises the feature, and cleans up.

## Usage

```bash
# Run against production
node smoke.js

# Run against local dev
node smoke.js --base=http://localhost:3006

# Verbose output (show response details)
VERBOSE=1 node smoke.js

# Email report on failure (requires RESEND_API_KEY env var)
EMAIL_REPORT=lb@minai.work RESEND_API_KEY=re_xxx node smoke.js
```

## Daily cron

On the minai server, a cron job runs the tests daily at 7:00 AM UTC:

```
0 7 * * * cd /var/www/minai/services/tests && node smoke.js >> /var/log/minai-smoke.log 2>&1
```

With email alerts on failure:
```
0 7 * * * cd /var/www/minai/services/tests && EMAIL_REPORT=lb@minai.work RESEND_API_KEY=re_xxx node smoke.js >> /var/log/minai-smoke.log 2>&1
```

## Exit codes

- `0` — all tests passed
- `1` — one or more tests failed

## Cost

Each run costs approximately $0.01-0.03 in LLM tokens (3 chat messages with tool calls + 1 document generation).
