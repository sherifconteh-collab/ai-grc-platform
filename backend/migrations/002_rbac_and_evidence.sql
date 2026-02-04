-- Migration: RBAC + Evidence Management + Control Workflow
-- Run after: 001_add_auth_tables.sql

-- ============================================================
-- PART 1: RBAC (Role-Based Access Control)
-- ============================================================

-- Roles table (predefined + custom roles)
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  is_system_role BOOLEAN DEFAULT FALSE, -- TRUE for Admin, Auditor, Viewer, Implementer
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(organization_id, name)
);

-- Permissions table (granular permissions)
CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) UNIQUE NOT NULL, -- e.g., "controls.read", "controls.write", "evidence.delete"
  resource VARCHAR(50) NOT NULL, -- e.g., "controls", "evidence", "frameworks", "users"
  action VARCHAR(50) NOT NULL, -- e.g., "read", "write", "delete", "approve"
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Role-Permission mapping (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- User-Role mapping (users can have multiple roles)
CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, role_id)
);

-- ============================================================
-- PART 2: Evidence Management
-- ============================================================

-- Evidence files (documents, screenshots, configs, logs)
CREATE TABLE IF NOT EXISTS evidence_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES users(id),
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL, -- S3/local storage path
  file_size_bytes BIGINT,
  mime_type VARCHAR(100),
  description TEXT,
  tags TEXT[], -- searchable tags
  version INTEGER DEFAULT 1,
  is_latest_version BOOLEAN DEFAULT TRUE,
  parent_file_id UUID REFERENCES evidence_files(id), -- for versioning
  uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Evidence-Control linking (one evidence file can support multiple controls)
CREATE TABLE IF NOT EXISTS control_evidence (
  control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
  evidence_id UUID REFERENCES evidence_files(id) ON DELETE CASCADE,
  linked_by UUID REFERENCES users(id),
  notes TEXT,
  linked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (control_id, evidence_id)
);

-- ============================================================
-- PART 3: Control Workflow Enhancements
-- ============================================================

-- Add workflow fields to control_implementations
ALTER TABLE control_implementations
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS completed_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS last_reviewed_at TIMESTAMP,
  ADD COLUMN IF NOT EXISTS last_reviewed_by UUID REFERENCES users(id);

-- Control status history (track all status changes)
CREATE TABLE IF NOT EXISTS control_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  control_implementation_id UUID REFERENCES control_implementations(id) ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by UUID REFERENCES users(id),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);

-- ============================================================
-- PART 4: Activity Feed / Audit Trail Enhancements
-- ============================================================

-- Extend auth_audit_log with more event types
ALTER TABLE auth_audit_log
  ADD COLUMN IF NOT EXISTS resource_type VARCHAR(50), -- e.g., "control", "evidence", "framework"
  ADD COLUMN IF NOT EXISTS resource_id UUID,
  ADD COLUMN IF NOT EXISTS details JSONB; -- structured event data

-- ============================================================
-- PART 5: Indexes for Performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_roles_org ON roles(organization_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_evidence_org ON evidence_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_evidence_uploaded_by ON evidence_files(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_control_evidence_control ON control_evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_control_evidence_evidence ON control_evidence(evidence_id);
CREATE INDEX IF NOT EXISTS idx_control_impl_assigned ON control_implementations(assigned_to);
CREATE INDEX IF NOT EXISTS idx_control_impl_due_date ON control_implementations(due_date);
CREATE INDEX IF NOT EXISTS idx_control_status_history ON control_status_history(control_implementation_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_resource ON auth_audit_log(resource_type, resource_id);

-- ============================================================
-- PART 6: Seed Default Permissions
-- ============================================================

INSERT INTO permissions (name, resource, action, description) VALUES
  -- Control permissions
  ('controls.read', 'controls', 'read', 'View controls'),
  ('controls.write', 'controls', 'write', 'Create and update controls'),
  ('controls.delete', 'controls', 'delete', 'Delete controls'),
  ('controls.approve', 'controls', 'approve', 'Approve control implementations'),
  ('controls.assign', 'controls', 'assign', 'Assign controls to users'),

  -- Evidence permissions
  ('evidence.read', 'evidence', 'read', 'View evidence files'),
  ('evidence.upload', 'evidence', 'upload', 'Upload evidence files'),
  ('evidence.delete', 'evidence', 'delete', 'Delete evidence files'),
  ('evidence.link', 'evidence', 'link', 'Link evidence to controls'),

  -- Framework permissions
  ('frameworks.read', 'frameworks', 'read', 'View frameworks'),
  ('frameworks.select', 'frameworks', 'select', 'Select frameworks for organization'),

  -- User management permissions
  ('users.read', 'users', 'read', 'View users'),
  ('users.write', 'users', 'write', 'Create and update users'),
  ('users.delete', 'users', 'delete', 'Delete users'),
  ('users.assign_roles', 'users', 'assign_roles', 'Assign roles to users'),

  -- Audit permissions
  ('audit.read', 'audit', 'read', 'View audit logs'),
  ('audit.export', 'audit', 'export', 'Export audit logs'),

  -- Dashboard permissions
  ('dashboard.read', 'dashboard', 'read', 'View dashboard'),

  -- Settings permissions
  ('settings.read', 'settings', 'read', 'View organization settings'),
  ('settings.write', 'settings', 'write', 'Update organization settings')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- PART 7: Seed System Roles
-- ============================================================

-- Note: We'll insert these per-organization via API when org is created
-- For now, create template system role definitions

-- The API will create these roles for each organization:
-- 1. Admin: Full access to everything
-- 2. Auditor: Read-only access + audit export
-- 3. Implementer: Manage controls and evidence
-- 4. Viewer: Read-only access to dashboards and controls

-- ============================================================
-- PART 8: Comments
-- ============================================================

COMMENT ON TABLE roles IS 'User roles with granular permissions (RBAC system)';
COMMENT ON TABLE permissions IS 'Granular permissions for resources (controls, evidence, etc.)';
COMMENT ON TABLE role_permissions IS 'Maps roles to permissions (many-to-many)';
COMMENT ON TABLE user_roles IS 'Maps users to roles (many-to-many)';
COMMENT ON TABLE evidence_files IS 'Uploaded evidence documents to support control implementations';
COMMENT ON TABLE control_evidence IS 'Links evidence files to specific controls';
COMMENT ON TABLE control_status_history IS 'Tracks all status changes for controls (audit trail)';
