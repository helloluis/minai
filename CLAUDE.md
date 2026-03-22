# Minai — Claude Notes

## VPS / SSH

- SSH alias: `ssh minai` (dedicated server, 192.248.144.62, port 2222) — **always use this**
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

## Post-Deploy Checklist

After shipping a significant new feature or tool:

1. **Update `apps/api/src/config/about.ts`** — this is minai's self-knowledge base, used by the `about_minai` tool when users or hackathon judges ask "how does minai work?". Keep it current with new capabilities, tools, and architecture changes.
2. **Update `services/browse/README.md`** — if the browse service API changed, update the docs so other agents can integrate correctly.
