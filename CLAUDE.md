# Minai — Claude Notes

## Two-Server Architecture

We manage **two separate VPS instances**:

| Server | IP | SSH | Purpose | PM2 processes |
|--------|-----|-----|---------|---------------|
| **minai** | 192.248.144.62 | `ssh minai` (port 2222) | Web app + API + PostgreSQL | `minai-api`, `minai-web` |
| **Browse box** | 45.76.180.229 | `ssh browse` | kamai browse API (headless browser) + dashboard | `kamai`, `kamai-dashboard` |

### Classifier retired — 2026-05-11

The GPU box (78.141.226.70) that ran the Ollama classifier on port 11434 has been decommissioned. The classifier was the largest consumer of that VPS's resources, so we downsized. 

**What changed:**
- The Ollama classifier is gone. Auto/Fast/Balanced modes are grayed out in the UI and map to Deep on the server (`apps/api/src/services/router.ts` — all modes route to `MODEL_DEEP` with thinking enabled).
- The original design used a binary classifier for ~400ms smart routing between Qwen Flash/Plus. Now everything goes straight to Qwen Plus with extended reasoning.
- The UI keeps the mode buttons visible but disabled, as a reminder of the original architecture.
- The classifier code in `router.ts` is still present but unreachable — kept for potential future re-enablement.
- Env vars `CLASSIFIER_PROVIDER`, `CLASSIFIER_COMPARE`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` are dead config.
- `apps/api/src/config/about.ts` was updated to reflect this.

**Browse service migration (completed 2026-05-11):** The browse API moved to 45.76.180.229. DNS for `kamai.minai.work` points there. `apps/api/src/services/tools.ts` has the hardcoded fallback updated to `http://45.76.180.229:3100`.

### Sister app keys (kamai)

Sister apps have `SISTER_API_KEYS` in kamai's `.env` — these bypass payment, get 50% discount on `/api/v1/browse`, and can use legacy `/browse` without auth.

| App | Key | Purpose |
|-----|-----|---------|
| minai | `0T2bn2DoqzrgU7igt-OeZpT09IfWX7Cy` | AI assistant browse |
| beaniebot | `jPXIgZDZ-6NvhfQo5_6YdSQCgaor2vb4` | Personal AI assistant browse |
| cryptoday news | `cd_news_qfEoOjTVpiPk95egewrfQneT` | News aggregator browse/search |

## VPS: minai (192.248.144.62)

- SSH alias: `ssh minai` (port 2222) — **always use this**
- App directory: `/var/www/minai`
- PM2 processes: `minai-api` (id 0), `minai-web` (id 1)
- Git remote: `git@github.com:helloluis/minai.git` (deploy key: `~/.ssh/id_minai` on server, configured in `~/.ssh/config`)
- **Deploy workflow:** always commit & push to GitHub first, then pull & build on the server. Never use `scp` to transfer dist files directly.
  ```
  ssh minai "cd /var/www/minai && git pull origin main && pnpm install && pnpm --filter @minai/shared build && pnpm --filter @minai/api build && node apps/api/dist/migrations/run.js && NODE_OPTIONS='--max-old-space-size=1800' pnpm --filter @minai/web build && pm2 restart all --update-env"
  ```
- Always build `@minai/shared` first — the web and API bundle from its `dist/`, so skipping it causes stale constants
- The server has 2GB RAM — use `NODE_OPTIONS='--max-old-space-size=1800'` for web builds
- **If the API `tsc` build OOMs:** stop both PM2 processes first (`pm2 stop all`), build with `NODE_OPTIONS='--max-old-space-size=1800'`, then restart

**Never run parallel SSH commands.** Always sequential, one at a time.

**Never use `>` or `|` in SSH command strings from Claude Code on Windows** — the Windows shell intercepts them locally causing hangs. Instead: write files locally → `scp` to server → `ssh` to execute.

**Scripts copied from Windows have CRLF line endings.** Always strip before running:
```
ssh minai "sed -i 's/\r//' /root/script.sh && bash /root/script.sh"
```

## Server Security (fail2ban is active!)

The server has **fail2ban** running. Be careful not to trigger bans:

- **SSH (port 2222):** 3 failed attempts → **2-hour ban**. Always use `ssh minai` alias (key-based auth). Never retry failed connections in a loop.
- **nginx auth:** 5 failed attempts in 10 min → 1-hour ban
- **nginx rate limit:** triggered by exceeding request rate → 1-hour ban
- **API rate limits (nginx layer):** auth endpoints 5/min, payment 3/min, general API 30/s

If you get banned (connection refused / timeout), wait or ask the user to run `fail2ban-client set sshd unbanip <IP>` from the Vultr console.

**Do NOT:**
- Retry failed SSH connections repeatedly
- Send rapid-fire HTTP requests to auth or payment endpoints
- Run load tests or parallel curl against the server

See `VULTR-VPS-GUIDE.md` for full setup documentation.

## VPS: Browse box / kamai (45.76.180.229)

- **Migrated from:** 78.141.226.70 (decommissioned 2026-05-11). Browse service + DBs moved here, classifier retired.
- SSH: `ssh browse` (alias for `root@45.76.180.229`)
- App directory: `/opt/kamai`
- PM2 processes: `kamai` (Express API on port 3100), `kamai-dashboard` (Next.js dashboard on port 3200)
- Public URL: `https://kamai.minai.work` (nginx + SSL via Let's Encrypt, proxied to port 3100/3200)
- Git remote: `https://github.com/helloluis/kamai.git` (public repo, cloned via HTTPS)
- **Deploy workflow:**
  ```
  ssh browse "cd /opt/kamai && git pull origin main && npm install && npm run build && pm2 restart kamai"
  ```
- **Legacy compat:** minai calls `/browse` and `/browse/memories` directly (no auth, no payment). New public API is at `/api/v1/browse` with wallet/key auth + credit system.
- **Firewall:** ports 80/443 open to all (nginx), port 3100 restricted to sister VPS IPs
- **SQLite DBs:** `credits.db` (accounts/deposits/usage), `browse_memories.db` (domain learnings) — both in `/opt/kamai/`
- **Note:** This VPS hosts multiple apps (bcp-web, cryptoday, tsocs, earnest). Be careful not to affect other services.

## Post-Deploy Checklist

After shipping a significant new feature or tool:

1. **Run smoke tests** — verify nothing is broken:
   ```
   ssh minai "cd /var/www/minai/services/tests && node smoke.js"
   ```
   17 end-to-end tests covering auth, chat, tool calls (crypto, web search, browse), document generation, share, and settings. Takes ~35s, costs ~$0.01 in LLM tokens.
2. **Update `apps/api/src/config/about.ts`** — this is minai's self-knowledge base, used by the `about_minai` tool when users or hackathon judges ask "how does minai work?". Keep it current with new capabilities, tools, and architecture changes.
3. **Update `services/browse/README.md`** — if the browse service API changed, update the docs so other agents can integrate correctly.

## Smoke Tests

- **Location:** `services/tests/smoke.js`
- **Daily cron:** runs at 00:15 UTC (8:15 AM Manila) — emails `lb@minai.work` on failure
- **Logs:** `/var/log/minai-smoke.log` on the server
- **Run on-demand:** `ssh minai "cd /var/www/minai/services/tests && node smoke.js"`
- **Run locally:** `cd services/tests && node smoke.js` (browse test goes through the LLM, not direct)
- **Verbose:** `VERBOSE=1 node smoke.js`
- **Cost:** ~$0.01–0.03 per run (4 LLM chat messages with tool calls)
