-- Migration 068: Regulatory news aggregation
-- Tracks compliance-relevant news from multiple sources

CREATE TABLE IF NOT EXISTS regulatory_news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  source VARCHAR(100) NOT NULL,
  title TEXT NOT NULL,
  summary TEXT,
  content TEXT,
  url TEXT NOT NULL,
  published_at TIMESTAMP NOT NULL,
  relevant_frameworks TEXT[],
  impact_level VARCHAR(20) CHECK (impact_level IN ('critical', 'high', 'medium', 'low', 'info')),
  keywords TEXT[],
  is_read BOOLEAN DEFAULT false,
  is_archived BOOLEAN DEFAULT false,
  read_at TIMESTAMP,
  archived_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (organization_id, source, url)
);

-- Migration 024 also creates regulatory_news_items with an older, narrower
-- schema (no relevant_frameworks/impact_level/keywords/is_archived/etc.).
-- Since 024 numerically precedes 068, on a from-scratch migration run its
-- CREATE TABLE wins the race and this one's CREATE TABLE IF NOT EXISTS above
-- silently no-ops, leaving the columns this migration's indexes need missing
-- until migration 100 backfills them. Add them here defensively so the
-- indexes below never fail regardless of which CREATE TABLE actually ran.
ALTER TABLE regulatory_news_items
  ADD COLUMN IF NOT EXISTS content TEXT,
  ADD COLUMN IF NOT EXISTS url TEXT,
  ADD COLUMN IF NOT EXISTS relevant_frameworks TEXT[],
  ADD COLUMN IF NOT EXISTS impact_level VARCHAR(20),
  ADD COLUMN IF NOT EXISTS keywords TEXT[],
  ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_regulatory_news_org ON regulatory_news_items(organization_id);
CREATE INDEX IF NOT EXISTS idx_regulatory_news_source ON regulatory_news_items(source);
CREATE INDEX IF NOT EXISTS idx_regulatory_news_published ON regulatory_news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_regulatory_news_frameworks ON regulatory_news_items USING GIN(relevant_frameworks);
CREATE INDEX IF NOT EXISTS idx_regulatory_news_impact ON regulatory_news_items(impact_level);
CREATE INDEX IF NOT EXISTS idx_regulatory_news_unread ON regulatory_news_items(is_read, is_archived) WHERE is_read = false AND is_archived = false;
CREATE INDEX IF NOT EXISTS idx_regulatory_news_keywords ON regulatory_news_items USING GIN(keywords);

COMMENT ON TABLE regulatory_news_items IS 'Aggregated regulatory and compliance news from multiple sources';
COMMENT ON COLUMN regulatory_news_items.source IS 'News source (fedramp, nist, cisa, gdpr, hipaa, pci, etc.)';
COMMENT ON COLUMN regulatory_news_items.relevant_frameworks IS 'Frameworks affected by this news';
COMMENT ON COLUMN regulatory_news_items.impact_level IS 'Estimated impact on compliance';
COMMENT ON COLUMN regulatory_news_items.keywords IS 'Extracted keywords for filtering';

SELECT 'Migration 068 completed.' AS result;
