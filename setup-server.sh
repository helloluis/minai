#!/bin/bash
set -e

echo "=== Minai Server Setup ==="

# 0. Swap
echo "[0/7] Setting up swap..."
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap created"
else
  echo "Swap already exists"
fi

# 1. DB
echo "[1/7] Setting up database..."
sudo -u postgres psql -c "CREATE USER minai WITH PASSWORD 'minai_prod_2024';" 2>/dev/null || echo "User already exists"
sudo -u postgres psql -c "CREATE DATABASE minai OWNER minai;" 2>/dev/null || echo "DB already exists"

# 2. .env.local
echo "[2/7] Writing .env.local..."
cat > /var/www/minai/.env.local << 'ENVEOF'
DASHSCOPE_API_KEY=sk-269f8335673f481aa9d5c58677ad7a6e
DATABASE_URL=postgresql://minai:minai_prod_2024@localhost:5432/minai
API_PORT=3006
COOKIE_SECRET=f6bf47501f7d1eee850d19b615586161ab94fc59aa57888eedae95f9ab53cd17
BRAVE_API_KEY=BSAdPDEu96rEku2WIxUisgjwzU8CP96
NODE_ENV=production
WALLET_SEED=laugh direct mother heavy grant core suspect axis comfort weather hello film
CELO_RPC_URL=https://forno.celo-sepolia.celo-testnet.org
ENVEOF

# 3. Install dependencies
echo "[3/7] Installing dependencies..."
cd /var/www/minai
pnpm install

# 4. Build
echo "[4/7] Building..."
export NODE_OPTIONS="--max-old-space-size=1800"
pnpm --filter @minai/shared build
pnpm --filter @minai/api build
pnpm --filter @minai/web build

# 5. Migrate
echo "[5/7] Running migrations..."
node apps/api/dist/migrations/run.js

# 6. PM2
echo "[6/7] Starting PM2 processes..."
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup | tail -1 | bash || true

# 7. Nginx
echo "[7/7] Configuring nginx..."
cat > /etc/nginx/sites-available/minai << 'NGINXEOF'
server {
    listen 80;
    server_name _;

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
NGINXEOF

ln -sf /etc/nginx/sites-available/minai /etc/nginx/sites-enabled/minai
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ""
echo "=== Setup complete ==="
pm2 status
