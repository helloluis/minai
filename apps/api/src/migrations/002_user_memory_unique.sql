-- Add unique constraint on user_memory for upsert support
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memory_user_key ON user_memory(user_id, key);
