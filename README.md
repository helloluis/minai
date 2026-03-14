# Minai

A pay-as-you-go AI assistant platform for virtual assistants in emerging economies. Built on Qwen models via Alibaba Cloud DashScope, with Google Calendar integration and MiniPay support.

## Stack

- **API** — Fastify + TypeScript (`apps/api`)
- **Web** — Next.js 15 + Tailwind (`apps/web`)
- **DB** — PostgreSQL
- **LLM** — Qwen 3.5 Flash / Plus via DashScope
- **Monorepo** — pnpm workspaces

## Local setup

### 1. Prerequisites

- Node.js 20+
- pnpm (`npm i -g pnpm`)
- PostgreSQL running locally

### 2. Environment variables

```bash
cp .env.example apps/api/.env
```

Fill in the values — see `.env.example` for descriptions of each key. Required for basic local dev:

| Variable | Where to get it |
|---|---|
| `DASHSCOPE_API_KEY` | [dashscope.aliyuncs.com](https://dashscope.aliyuncs.com) |
| `DATABASE_URL` | Your local Postgres connection string |
| `COOKIE_SECRET` | Run `openssl rand -hex 32` |

Google Calendar and Brave Search are optional — the app works without them.

### 3. Install and migrate

```bash
pnpm install
pnpm --filter @minai/api db:migrate
```

### 4. Run

```bash
# Terminal 1
pnpm --filter @minai/api dev

# Terminal 2
pnpm --filter @minai/web dev
```

API runs on port 3006, web on port 3000.

## Deploy (VPS)

Build and deploy sequentially — **do not run API and web builds in parallel**, the VPS (4GB RAM) will OOM.

```bash
ssh beanie "cd /var/www/minai \
  && git pull origin main \
  && pnpm install \
  && pnpm --filter @minai/api build \
  && node apps/api/dist/migrations/run.js \
  && pnpm --filter @minai/web build \
  && pm2 restart all"
```

## Google OAuth setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable **Google Calendar API** and **Google OAuth2 API**
3. Create OAuth 2.0 credentials (Web application)
4. Add authorized redirect URIs:
   - Dev: `http://localhost:3006/api/auth/google/callback`
   - Prod: `https://yourdomain.com/api/auth/google/callback`
5. Add `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` to `apps/api/.env`

## Project structure

```
apps/
  api/          Fastify API server
    src/
      config/       Pricing, system prompt
      migrations/   SQL migrations (run sequentially via run.ts)
      routes/       Auth, conversations, messages, notes, google-auth
      services/     DB, router, tools, compaction, memory, google-calendar
  web/          Next.js frontend
    src/
      app/          Pages: /, /chat/[threadId], /settings
      components/
      hooks/        useChatStore (Zustand)
      lib/          API client
packages/
  shared/       Types and constants shared between API and web
```
