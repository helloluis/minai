-- Add wallet_address column to users for MiniPay/wallet-based auth
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_address_idx ON users (wallet_address) WHERE wallet_address IS NOT NULL;
