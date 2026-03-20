ALTER TABLE notebook_files ADD COLUMN IF NOT EXISTS llm_summary TEXT;
ALTER TABLE notebook_files ADD COLUMN IF NOT EXISTS summary_status TEXT NOT NULL DEFAULT 'pending';
