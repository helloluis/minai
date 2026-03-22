CREATE TABLE IF NOT EXISTS shared_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  user_id UUID NOT NULL REFERENCES users(id),
  message_id UUID NOT NULL REFERENCES messages(id),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  original_content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS shared_posts_slug_idx ON shared_posts (slug);
