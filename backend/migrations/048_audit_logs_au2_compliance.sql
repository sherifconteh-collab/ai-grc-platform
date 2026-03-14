-- Migration: Enhance audit_logs table for AU-2 compliance and SIEM/SSO tracking
-- AU-2 requires auditable events to include:
-- - Event type, date/time, location, source, outcome
-- - Subject identity (user/process)
-- - Objects accessed
-- - Session/correlation identifiers

-- Add AU-2 compliant fields to audit_logs table
ALTER TABLE audit_logs
ADD COLUMN IF NOT EXISTS session_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS authentication_method VARCHAR(50),
ADD COLUMN IF NOT EXISTS sso_provider VARCHAR(100),
ADD COLUMN IF NOT EXISTS siem_forwarded BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS outcome VARCHAR(20) DEFAULT 'success',
ADD COLUMN IF NOT EXISTS request_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS actor_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS source_system VARCHAR(100);

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_auth_method ON audit_logs(authentication_method);
CREATE INDEX IF NOT EXISTS idx_audit_logs_sso_provider ON audit_logs(sso_provider);
CREATE INDEX IF NOT EXISTS idx_audit_logs_request_id ON audit_logs(request_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_outcome ON audit_logs(outcome);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Add comment explaining AU-2 compliance
COMMENT ON TABLE audit_logs IS 'AU-2 compliant audit log table capturing auditable events with required components: event type, date/time, location, source, outcome, subject identity, objects accessed, and correlation identifiers';
COMMENT ON COLUMN audit_logs.session_id IS 'Session identifier for correlating related events within a user session';
COMMENT ON COLUMN audit_logs.authentication_method IS 'Method used for authentication: password, sso, passkey, api_key, service_account';
COMMENT ON COLUMN audit_logs.sso_provider IS 'SSO provider name when authentication_method is sso (e.g., google, microsoft, okta)';
COMMENT ON COLUMN audit_logs.siem_forwarded IS 'Indicates if event was successfully forwarded to configured SIEM systems';
COMMENT ON COLUMN audit_logs.outcome IS 'Event outcome: success, failure, partial';
COMMENT ON COLUMN audit_logs.request_id IS 'Unique request identifier for tracing across services';
COMMENT ON COLUMN audit_logs.actor_name IS 'Human-readable name of the actor (user name, service account name)';
COMMENT ON COLUMN audit_logs.source_system IS 'Source system or service that generated the event';
