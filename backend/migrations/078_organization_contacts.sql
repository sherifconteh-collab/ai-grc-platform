-- Migration 078: Organization contacts (external stakeholders who don't log in)
-- These contacts can be assigned to controls without consuming a user seat.

CREATE TABLE IF NOT EXISTS organization_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  title VARCHAR(255),
  team VARCHAR(255),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_org_contacts_org
  ON organization_contacts(organization_id);

CREATE INDEX IF NOT EXISTS idx_org_contacts_org_active
  ON organization_contacts(organization_id)
  WHERE is_active = TRUE;

-- Add optional external contact reference to control_implementations
ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS assigned_to_contact UUID REFERENCES organization_contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_control_implementations_assigned_contact
  ON control_implementations(organization_id, assigned_to_contact)
  WHERE assigned_to_contact IS NOT NULL;

SELECT 'Migration 078 completed.' AS result;
