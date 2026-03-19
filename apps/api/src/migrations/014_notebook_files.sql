CREATE TABLE IF NOT EXISTS notebook_files (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID        NOT NULL REFERENCES conversations(id),
  user_id         UUID        NOT NULL REFERENCES users(id),
  original_name   TEXT        NOT NULL,
  display_name    TEXT        NOT NULL,
  mime_type       TEXT        NOT NULL,
  file_size       INTEGER     NOT NULL,
  storage_path    TEXT        NOT NULL,
  parsed_text     TEXT,
  parse_status    TEXT        NOT NULL DEFAULT 'pending',
  parse_error     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notebook_files_conversation_id_idx ON notebook_files(conversation_id);
CREATE INDEX IF NOT EXISTS notebook_files_user_id_idx ON notebook_files(user_id);
