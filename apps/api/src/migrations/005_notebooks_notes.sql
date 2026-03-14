-- Add timezone to conversations (used as notebooks)
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'UTC';

-- Notes table: one notebook can have many notes
CREATE TABLE IF NOT EXISTS notes (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID        NOT NULL REFERENCES conversations(id),
  user_id           UUID        NOT NULL REFERENCES users(id),
  title             TEXT        NOT NULL DEFAULT '',
  content           TEXT        NOT NULL DEFAULT '',
  display_order     INTEGER     NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notes_conversation_id_idx ON notes(conversation_id);
CREATE INDEX IF NOT EXISTS notes_user_id_idx ON notes(user_id);
