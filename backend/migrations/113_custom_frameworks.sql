-- Custom Framework Builder: org-defined frameworks with custom controls
CREATE TABLE custom_frameworks (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id  UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    code             TEXT NOT NULL,
    name             TEXT NOT NULL,
    version          TEXT NOT NULL DEFAULT '1.0',
    category         TEXT NOT NULL DEFAULT 'custom',
    description      TEXT,
    is_published     BOOLEAN NOT NULL DEFAULT false,
    created_by       UUID REFERENCES users(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (organization_id, code)
);

CREATE TABLE custom_framework_controls (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    custom_framework_id UUID NOT NULL REFERENCES custom_frameworks(id) ON DELETE CASCADE,
    organization_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    control_id          TEXT NOT NULL,
    title               TEXT NOT NULL,
    description         TEXT,
    priority            TEXT NOT NULL DEFAULT 'medium'
                            CHECK (priority IN ('critical', 'high', 'medium', 'low')),
    control_type        TEXT NOT NULL DEFAULT 'technical',
    sort_order          INTEGER NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (custom_framework_id, control_id)
);

CREATE INDEX idx_custom_frameworks_org ON custom_frameworks (organization_id);
CREATE INDEX idx_custom_framework_controls_framework ON custom_framework_controls (custom_framework_id);
CREATE INDEX idx_custom_framework_controls_org ON custom_framework_controls (organization_id);

-- Row-level security (same pattern as migration 104)
ALTER TABLE custom_frameworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_frameworks FORCE ROW LEVEL SECURITY;

ALTER TABLE custom_framework_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_framework_controls FORCE ROW LEVEL SECURITY;

CREATE POLICY custom_frameworks_org_isolation ON custom_frameworks
    USING (
        current_setting('app.org_id', true) IS NULL
        OR current_setting('app.org_id', true) = ''
        OR organization_id::text = current_setting('app.org_id', true)
    );

CREATE POLICY custom_framework_controls_org_isolation ON custom_framework_controls
    USING (
        current_setting('app.org_id', true) IS NULL
        OR current_setting('app.org_id', true) = ''
        OR organization_id::text = current_setting('app.org_id', true)
    );
