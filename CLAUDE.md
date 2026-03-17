# Minai — Claude Notes

## VPS / SSH

- SSH alias: `ssh minai` (new dedicated server, 192.248.144.62)
- SSH alias: `ssh beanie` (old shared server, 66.42.59.12 — being retired)
- App directory: `/var/www/minai`
- PM2 processes: `minai-api` (id 0), `minai-web` (id 1)
- Git remote: `git@github.com:helloluis/minai.git` (deploy key: `~/.ssh/id_minai` on server, configured in `~/.ssh/config`)
- To deploy:
  ```
  ssh minai "cd /var/www/minai && git pull origin main && pnpm install && pnpm --filter @minai/shared build && pnpm --filter @minai/api build && node apps/api/dist/migrations/run.js && NODE_OPTIONS='--max-old-space-size=1800' pnpm --filter @minai/web build && pm2 restart all --update-env"
  ```
- Always build `@minai/shared` first — the web and API bundle from its `dist/`, so skipping it causes stale constants
- The new server has 2GB RAM — always use `NODE_OPTIONS='--max-old-space-size=1800'` for web builds

**Never run parallel SSH commands.** Always sequential, one at a time.

**Never use `>` or `|` in SSH command strings from Claude Code on Windows** — the Windows shell intercepts them locally causing hangs. Instead: write files locally → `scp` to server → `ssh` to execute.

**Scripts copied from Windows have CRLF line endings.** Always strip before running:
```
ssh minai "sed -i 's/\r//' /root/script.sh && bash /root/script.sh"
```

See `VULTR-VPS-GUIDE.md` for full setup documentation.
