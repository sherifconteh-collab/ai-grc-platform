-- Migration 009: AI features, org settings, framework enhancements

-- 1. Add code column to frameworks
ALTER TABLE frameworks ADD COLUMN IF NOT EXISTS code VARCHAR(100);
ALTER TABLE frameworks ADD COLUMN IF NOT EXISTS tier_required VARCHAR(50) DEFAULT 'free';

-- 2. Organization Frameworks (which frameworks each org has selected)
CREATE TABLE IF NOT EXISTS organization_frameworks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  framework_id UUID NOT NULL REFERENCES frameworks(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, framework_id)
);

-- 3. Evidence table
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name VARCHAR(500),
  file_path TEXT,
  file_size BIGINT,
  mime_type VARCHAR(200),
  description TEXT,
  tags TEXT[],
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evidence_control_links (
  evidence_id UUID REFERENCES evidence(id) ON DELETE CASCADE,
  control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (evidence_id, control_id)
);

-- 4. Add similarity_score to control_mappings
ALTER TABLE control_mappings ADD COLUMN IF NOT EXISTS similarity_score INTEGER DEFAULT 80;

-- 5. Simple AI usage log for tracking monthly limits
CREATE TABLE IF NOT EXISTS ai_usage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feature VARCHAR(100) NOT NULL,
  provider VARCHAR(50),
  model VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_org_month
ON ai_usage_log(organization_id, created_at);

-- 6. Organization settings for BYOK API keys
CREATE TABLE IF NOT EXISTS organization_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  setting_key VARCHAR(100) NOT NULL,
  setting_value TEXT,
  is_encrypted BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(organization_id, setting_key)
);

CREATE INDEX IF NOT EXISTS idx_org_settings_lookup
ON organization_settings(organization_id, setting_key);

-- 7. Sessions table if not exists
CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

SELECT 'Migration 009 completed.' as result;
