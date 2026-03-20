ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS balance_high_water NUMERIC(12,6) NOT NULL DEFAULT 1.00;
-- Initialize to current total for existing users
UPDATE user_balances SET balance_high_water = GREATEST(balance_usd + free_credit_usd, balance_high_water);
