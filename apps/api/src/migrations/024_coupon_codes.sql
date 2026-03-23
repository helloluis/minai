-- Coupon codes for credit top-ups
CREATE TABLE IF NOT EXISTS coupon_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  amount_cents INTEGER NOT NULL,
  one_time_use BOOLEAN DEFAULT false,
  expires_at TIMESTAMPTZ,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Track which users redeemed which coupons (prevents double-use of one-time codes)
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id UUID NOT NULL REFERENCES coupon_codes(id),
  user_id UUID NOT NULL REFERENCES users(id),
  amount_usd NUMERIC(12,4) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(coupon_id, user_id)
);

-- Add coupon tracking to payments
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code_id UUID REFERENCES coupon_codes(id);
ALTER TABLE payments ADD COLUMN IF NOT EXISTS coupon_code_amount NUMERIC(12,4);
