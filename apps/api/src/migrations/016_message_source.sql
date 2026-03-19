ALTER TABLE messages ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'chat';
CREATE INDEX IF NOT EXISTS messages_source_idx ON messages(conversation_id, source) WHERE deleted_at IS NULL;
