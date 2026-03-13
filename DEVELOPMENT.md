# Minai Development Guide

## Quick Start

```bash
# Prerequisites: Node.js 22+, pnpm 9+, PostgreSQL 13+

# 1. Install dependencies
pnpm install

# 2. Create the database (password: postgres)
psql -U postgres -c "CREATE DATABASE minai;"

# 3. Run migrations
pnpm db:migrate

# 4. Start dev servers (API on 3001, Web on 3002)
pnpm dev

# 5. Open http://localhost:3002
```

## Environment Variables

Copy `.env.local.example` or create `.env.local` at the project root:

```
DASHSCOPE_API_KEY=<your-alibaba-cloud-dashscope-key>
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/minai
API_PORT=3001
COOKIE_SECRET=minai-dev-secret-change-in-production
```

## Architecture

```
minai/
├── apps/
│   ├── api/                    Fastify 5 backend (port 3001)
│   │   └── src/
│   │       ├── index.ts        Server entry + plugin registration
│   │       ├── env.ts          Dotenv loader (must import first)
│   │       ├── config/
│   │       │   ├── pricing.ts  Token pricing + free tier config
│   │       │   └── system-prompt.ts  Minai personality + auto-classifier
│   │       ├── plugins/
│   │       │   └── auth.ts     Session cookie auth (fastify-plugin)
│   │       ├── routes/
│   │       │   ├── auth.ts     POST /api/auth/login, GET /api/auth/me
│   │       │   ├── conversations.ts  CRUD for conversation threads
│   │       │   └── messages.ts SSE streaming + message CRUD
│   │       ├── services/
│   │       │   ├── db.ts       PostgreSQL queries (pg pool)
│   │       │   ├── router.ts   Auto/Fast/Deep LLM routing
│   │       │   ├── compaction.ts  Context compaction (summarize old messages)
│   │       │   ├── memory.ts   User memory extraction (language, preferences)
│   │       │   ├── tools.ts    Tool definitions + executors (crypto, search)
│   │       │   ├── tool-runner.ts  Pattern-based tool detection + execution
│   │       │   └── providers/
│   │       │       ├── types.ts      Provider interface
│   │       │       └── dashscope.ts  Alibaba Cloud Qwen provider
│   │       └── migrations/
│   │           ├── 001_initial.sql           Full schema
│   │           ├── 002_user_memory_unique.sql  Unique constraint
│   │           └── run.ts                    Migration runner
│   └── web/                    Next.js 15 frontend (port 3002)
│       └── src/
│           ├── app/
│           │   ├── layout.tsx  Root layout
│           │   ├── page.tsx    Landing page (MiniPay login)
│           │   └── chat/[threadId]/page.tsx  Main chat UI
│           ├── components/
│           │   ├── BalanceBar.tsx     Top bar with balance + pie chart
│           │   ├── ChatInput.tsx      Text input + Auto/Fast/Deep modes
│           │   ├── MessageBubble.tsx  Message rendering + markdown
│           │   ├── Sidebar.tsx        Conversation list
│           │   ├── ThinkingBlock.tsx  Reasoning stream display
│           │   └── WelcomeMessage.tsx Animated EN/SW greeting
│           ├── hooks/
│           │   └── useChatStore.ts   Zustand state management
│           └── lib/
│               └── api.ts      API client + SSE streaming
└── packages/
    └── shared/                 Shared TypeScript types
        └── src/types.ts
```

## Key Design Decisions

### Proxy Architecture
Next.js rewrites (`next.config.ts`) proxy `/api/*` to `http://localhost:3001/api/*`.
This avoids cross-origin cookie issues — all cookies stay on the same origin (port 3002).

### Auth (Demo Mode)
Clicking "Login via MiniPay" creates a UUID session token stored in an HttpOnly cookie.
No real MiniPay integration yet — it just creates a new user + balance each time.
The auth plugin uses `fastify-plugin` (`fp()`) to break Fastify's encapsulation so
the preHandler hook applies globally to all routes.

### LLM Routing
- **Auto**: Sends prompt to Qwen Flash for complexity classification ("simple"/"complex"),
  then routes to Flash or Plus accordingly.
- **Fast**: Always Qwen 3.5 Flash (qwen-turbo-latest) — cheap, fast
- **Deep**: Always Qwen 3.5 Plus (qwen-plus-latest) — reasoning, multimodal

### Streaming
SSE via `POST /api/conversations/:id/messages/stream`.
Events: `start`, `thinking`, `chunk`, `usage`, `done`, `error`.
Heartbeat comments every 5s to prevent proxy timeouts.

### Prefix Caching
DashScope provider applies `cache_control: { type: "ephemeral" }` markers on the
system prompt and conversation history prefix. Cache hit = 10% input cost.

### Pricing
Configured in `apps/api/src/config/pricing.ts`:
- Fast: $0.20 input / $1.00 output per million tokens
- Deep: $1.00 input / $5.00 output per million tokens
- Free tokens on signup: configurable (`free_tokens_initial`)

## Database

PostgreSQL with 8 tables. All deletes are soft-deletes (`deleted_at` column).

Tables: `users`, `user_balances`, `conversations`, `messages`, `user_memory`,
`compacted_messages`, `pinned_messages`, `payments`

Run migrations: `pnpm db:migrate`

## Phase Status

### Phase 1: Core Chat + Auth + Streaming — DONE
- Turborepo monorepo scaffolding
- PostgreSQL schema + migrations
- Session auth (demo login via cookie)
- DashScope provider (Qwen Flash + Plus, streaming, prefix caching, thinking)
- Auto/Fast/Deep router with prompt classification
- SSE streaming API with heartbeats
- Chat UI: messages, markdown rendering, thinking display, mode selector
- Sidebar with conversation list (pin, delete)
- Welcome message with EN/SW animation
- Balance bar with pie chart
- Zustand state management

### Phase 2: Billing, Balance & Token Tracking — DONE
- Token cost deduction from balance after each response
- Free tier: deducts `free_tokens_remaining` before charging balance
- Balance UI: real-time updates via SSE `usage` event, pie chart for free tokens
- Mock deposit button ($0.10 increments) in top balance bar
- Payment records logged to `payments` table

### Phase 3: Compaction, Memory & Tools — DONE
- Context compaction: fire-and-forget after each response, keeps last 8 messages raw,
  compacts older exchanges via Qwen Flash summarization, stored in `compacted_messages`
- User memory: detects Swahili language preference, extracts facts (name, location,
  occupation) via LLM, stored in `user_memory` and injected into system prompt
- Tools (pattern-based detection, results injected as system context):
  - `crypto_price` — **Live** via Binance API (price + 24h change/high/low/volume)
  - `crypto_history` — **Live** via Binance klines (daily OHLC, up to 30 days)
  - `web_search` — placeholder (returns notice that web search is not yet available)
  - `minipay_info` — static knowledge base about MiniPay wallet

## Reference

- Beaniebot (reference app): `../beaniebot/` — production AI chat by @helloluis
- DashScope API: https://dashscope-intl.aliyuncs.com/compatible-mode/v1/chat/completions
- Binance public data (no auth): https://data-api.binance.vision/api/v3/
- MiniPay SDK: https://github.com/jacksoncheek/minipay-android-sdk
