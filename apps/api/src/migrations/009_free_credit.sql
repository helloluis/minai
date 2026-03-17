-- Replace free token allocation with a $1.00 USD free credit
ALTER TABLE user_balances
  ADD COLUMN IF NOT EXISTS free_credit_usd NUMERIC(12,6) DEFAULT 1.000000;

-- Give all existing users $1.00 free credit
UPDATE user_balances
SET free_credit_usd = 1.000000
WHERE free_credit_usd IS NULL;
