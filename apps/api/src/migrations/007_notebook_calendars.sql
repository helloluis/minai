-- Associate Google calendars with notebooks (conversations)
-- One calendar can only belong to one notebook per user, but a notebook can have multiple calendars
CREATE TABLE IF NOT EXISTS notebook_calendars (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  notebook_id    UUID        NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  calendar_id    TEXT        NOT NULL,
  calendar_name  TEXT        NOT NULL DEFAULT '',
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, calendar_id)
);

CREATE INDEX IF NOT EXISTS notebook_calendars_user_idx     ON notebook_calendars(user_id);
CREATE INDEX IF NOT EXISTS notebook_calendars_notebook_idx ON notebook_calendars(notebook_id);
