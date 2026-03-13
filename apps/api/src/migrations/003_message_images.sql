-- Add images column to messages (stores base64 data URLs as JSON array)
ALTER TABLE messages ADD COLUMN IF NOT EXISTS images JSONB DEFAULT NULL;
