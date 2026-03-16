-- Per-user HD wallet deposit addresses
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS deposit_address TEXT;
ALTER TABLE user_balances ADD COLUMN IF NOT EXISTS deposit_address_index INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_balances_deposit_address
  ON user_balances(deposit_address) WHERE deposit_address IS NOT NULL;

-- Payment metadata
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_method TEXT NOT NULL DEFAULT 'mock';
ALTER TABLE payments ADD COLUMN IF NOT EXISTS token TEXT;

-- Prevent double-processing a tx hash
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_tx_hash
  ON payments(tx_hash) WHERE tx_hash IS NOT NULL;
