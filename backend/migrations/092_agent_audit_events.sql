-- Migration: Create agent_audit_events table for OpenClaw orchestrator events
-- Provides PostgreSQL persistence for AU-2 compliant agent activity tracking.
-- The orchestrator writes here when DATABASE_URL is set; JSONL files remain as local fallback.
--
-- Separate from audit_logs because agent events are platform-level (not org-scoped).

CREATE TABLE IF NOT EXISTS agent_audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    agent_name VARCHAR(255),
    agent_file VARCHAR(500),
    agent_division VARCHAR(100),
    task_type VARCHAR(50),
    task_name VARCHAR(255),
    schedule VARCHAR(100),
    session_id UUID,
    duration_ms INTEGER,
    outcome VARCHAR(20) NOT NULL DEFAULT 'in_progress',
    error TEXT,
    details JSONB DEFAULT '{}',
    findings JSONB,
    source_system VARCHAR(100) NOT NULL DEFAULT 'openclaw-orchestrator',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_event_type ON agent_audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_agent_name ON agent_audit_events(agent_name);
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_session_id ON agent_audit_events(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_outcome ON agent_audit_events(outcome);
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_created_at ON agent_audit_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_task_name ON agent_audit_events(task_name);

-- Composite index for daily summary queries
CREATE INDEX IF NOT EXISTS idx_agent_audit_events_date_outcome
    ON agent_audit_events(date_trunc('day', created_at), outcome);

-- Comments for documentation
COMMENT ON TABLE agent_audit_events IS 'AU-2 compliant audit log for OpenClaw orchestrator agent activities. Platform-level events (not org-scoped). Written by the Railway orchestrator when DATABASE_URL is configured.';
COMMENT ON COLUMN agent_audit_events.event_type IS 'Event type: agent.task.started, agent.task.completed, agent.task.failed, system.*';
COMMENT ON COLUMN agent_audit_events.agent_name IS 'Human-readable agent name (e.g., ControlWeave Security Engineer)';
COMMENT ON COLUMN agent_audit_events.agent_file IS 'Path to agent persona file within .openclaw/agents/';
COMMENT ON COLUMN agent_audit_events.agent_division IS 'Division: engineering, compliance, testing, support, etc.';
COMMENT ON COLUMN agent_audit_events.task_type IS 'Task classification: monitoring, audit, maintenance, gtm';
COMMENT ON COLUMN agent_audit_events.session_id IS 'Correlation ID linking start/complete/fail events for a single task run';
COMMENT ON COLUMN agent_audit_events.outcome IS 'Event outcome: in_progress, success, failure, partial';
COMMENT ON COLUMN agent_audit_events.source_system IS 'Always openclaw-orchestrator for this table';
