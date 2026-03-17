# Vultr VPS Setup & Deployment Guide for Node.js/Next.js Apps

Learnings from deploying a pnpm monorepo (Node 22, Next.js 15, Fastify, PostgreSQL) on Vultr.

---

## Initial Server Setup

### 1. Install Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
```

### 2. Install pnpm and PM2

```bash
npm install -g pnpm pm2
```

### 3. Install PostgreSQL and nginx

```bash
apt-get install -y postgresql postgresql-contrib nginx
systemctl enable postgresql
systemctl start postgresql
```

### 4. Create database and user

```bash
sudo -u postgres psql -c "CREATE USER myapp WITH PASSWORD 'yourpassword';"
sudo -u postgres psql -c "CREATE DATABASE myapp OWNER myapp;"
```

### 5. Add swap space (critical for low-RAM servers)

2GB RAM is the minimum for building a Next.js + TypeScript monorepo. Always add swap:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

---

## GitHub Deploy Key

```bash
# On the server
ssh-keygen -t ed25519 -C 'deploy@myapp' -f /root/.ssh/id_deploy -N ''
cat /root/.ssh/id_deploy.pub  # Add this to GitHub → Repo → Settings → Deploy keys

# Configure SSH to use it for GitHub
cat >> /root/.ssh/config << 'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/id_deploy
  IdentitiesOnly yes
EOF

# Test
ssh -o StrictHostKeyChecking=no -T git@github.com
```

---

## Building

### TypeScript / tsc memory issues

`tsc` and `next build` are memory hungry. On servers with 2GB RAM you must raise Node's heap limit explicitly — otherwise Node hits its ~1GB default cap before swap can help:

```bash
export NODE_OPTIONS="--max-old-space-size=1800"
pnpm --filter @myapp/shared build
pnpm --filter @myapp/api build
pnpm --filter @myapp/web build
```

**Rule of thumb:**
- 1GB RAM: not enough, even with swap
- 2GB RAM: set `--max-old-space-size=1800` + 2GB swap
- 4GB RAM: no special flags needed

### Build order for monorepos

Always build shared packages first — downstream packages (api, web) import from `shared/dist/`:

```bash
pnpm --filter @myapp/shared build
pnpm --filter @myapp/api build   # depends on shared
pnpm --filter @myapp/web build   # depends on shared
```

Never run these in parallel — they have implicit ordering dependencies.

---

## PM2

### ecosystem.config.cjs

```js
module.exports = {
  apps: [
    {
      name: 'myapp-api',
      cwd: './apps/api',
      script: 'dist/index.js',
      interpreter: 'node',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
    {
      name: 'myapp-web',
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3007',
      interpreter: 'none',
      env: { NODE_ENV: 'production' },
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
    },
  ],
};
```

### PM2 autostart on reboot

```bash
pm2 startup     # outputs a command — run it
pm2 save        # saves current process list
```

### Restart with updated env vars

```bash
pm2 restart all --update-env
```

---

## Nginx reverse proxy

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://localhost:3006;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://localhost:3007;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
ln -sf /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/myapp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

### SSL with Let's Encrypt

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d yourdomain.com
```

---

## Standard Deploy Command

```bash
cd /var/www/myapp
git pull origin main
pnpm install
pnpm --filter @myapp/shared build
pnpm --filter @myapp/api build
node apps/api/dist/migrations/run.js
pnpm --filter @myapp/web build
pm2 restart all --update-env
```

**Never run parallel SSH commands** — run one at a time, wait for each to complete.

---

## SSH from Claude Code (Windows)

Claude Code runs in Windows Git Bash. Two known issues:

### 1. `>` and `|` in SSH command strings hang

The Windows shell intercepts `>` and `|` even inside double-quoted SSH arguments. Commands like:
```bash
ssh host "echo foo > /tmp/bar"      # HANGS
ssh host "cat file | grep pattern"  # HANGS
```

**Fix:** Write files locally, then `scp` them. Never redirect inside an SSH command string.

```bash
# Write the file locally, then copy it
scp ./myfile.sh root@host:/root/myfile.sh
ssh host "bash /root/myfile.sh"
```

### 2. Scripts written on Windows have CRLF line endings

Shell scripts created on Windows cause `$'\r': command not found` errors on Linux.

**Fix:** Always strip them on the server before running:
```bash
ssh host "sed -i 's/\r//' /root/script.sh && bash /root/script.sh"
```

### 3. Never run parallel SSH connections

Multiple simultaneous SSH sessions cause connection timeouts, especially on low-resource VPS servers. Always sequential.

---

## Environment Variables

Store in `/var/www/myapp/.env.local` (not `.env` — loaded first by the app).

Never commit secrets to git. Use `.env.example` with blank values as documentation.
