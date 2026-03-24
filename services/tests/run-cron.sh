#!/bin/bash
# Daily smoke tests + conversation review
set -a
source /var/www/minai/.env.local 2>/dev/null
set +a
cd /var/www/minai/services/tests

# Smoke tests (email on failure)
EMAIL_REPORT=lb@minai.work node smoke.js >> /var/log/minai-smoke.log 2>&1

# Conversation review (always emails summary)
node daily-review.js >> /var/log/minai-review.log 2>&1
