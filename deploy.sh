#!/bin/bash
set -e
cd /var/www/minai
export NODE_OPTIONS="--max-old-space-size=1800"
pnpm --filter @minai/shared build
pnpm --filter @minai/api build
pnpm --filter @minai/web build
pm2 restart all --update-env
echo "Deploy complete"
pm2 status
