-- Message feedback table for thumbs-down reports
CREATE TABLE message_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id) NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  feedback_type TEXT NOT NULL DEFAULT 'thumbs_down',
  feedback_text TEXT,
  original_prompt TEXT NOT NULL,
  original_response TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_message_feedback_user_id ON message_feedback(user_id);
CREATE INDEX idx_message_feedback_message_id ON message_feedback(message_id);

-- Prevent duplicate pins (pinned_messages table already exists from 001_initial.sql)
ALTER TABLE pinned_messages ADD CONSTRAINT unique_pinned_message
  UNIQUE (message_id, user_id);
