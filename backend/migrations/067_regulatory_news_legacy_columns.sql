-- Migration 067 (regulatory news legacy columns): make fresh installs migrate cleanly
--
-- Migration 024 creates regulatory_news_items with its original columns
-- (body, source_url, tags, ...). Migration 068 later tries to create the same
-- table with a newer shape; because the table already exists, its CREATE TABLE
-- IF NOT EXISTS is skipped and its indexes on relevant_frameworks, keywords and
-- is_archived fail with "column does not exist". Existing databases got past
-- this long ago (migration 100 reconciles the columns), but every fresh install
-- stopped at 068.
--
-- This file sorts between 024 and 068 and adds the columns 068 indexes, so a
-- fresh install proceeds. It is idempotent and a no-op on existing databases,
-- which already have these columns from migration 100. Migration 068 itself is
-- left untouched so databases that already applied it keep a matching checksum.
--
-- Ships in the community edition production-readiness batch.

ALTER TABLE IF EXISTS regulatory_news_items
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS relevant_frameworks TEXT[],
  ADD COLUMN IF NOT EXISTS impact_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;
