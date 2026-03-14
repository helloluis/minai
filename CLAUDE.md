# Minai — Claude Notes

## VPS / SSH

- SSH alias: `ssh beanie`
- App directory: `/var/www/minai`
- PM2 processes: `minai-api` (id 0), `minai-web` (id 1)
- Git remote: `git@github.com:helloluis/minai.git` (deploy key: `~/.ssh/id_minai`, configured in `~/.ssh/config`)
- To deploy: `ssh beanie "cd /var/www/minai && git pull origin main && pnpm install && pnpm --filter @minai/api build && pnpm --filter @minai/web build && pm2 restart all"`

**Never run parallel SSH commands** (multiple simultaneous `ssh beanie` connections). The VPS has limited resources and parallel SSH sessions cause connection timeouts, PM2 daemon crashes, and can take the entire server down. Always run SSH commands sequentially, waiting for each to complete before starting the next.
