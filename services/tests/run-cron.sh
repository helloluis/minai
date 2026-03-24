#!/bin/bash
# Daily smoke test runner — loads env vars and runs tests
set -a
source /var/www/minai/.env.local 2>/dev/null
set +a
cd /var/www/minai/services/tests
EMAIL_REPORT=lb@minai.work node smoke.js >> /var/log/minai-smoke.log 2>&1
