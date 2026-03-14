-- Migration: Add performance indexes for AI/LLM optimization
-- Description: Add indexes on frequently queried columns to improve query performance
-- Date: 2026-02-13

-- Index on control_implementations for faster org-specific queries with status filters
CREATE INDEX IF NOT EXISTS idx_control_implementations_org_status 
  ON control_implementations(organization_id, status);

-- Index on ai_usage_log for monthly usage count queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_org_created_success 
  ON ai_usage_log(organization_id, created_at DESC, success);

-- Index on organization_settings for faster API key lookups
CREATE INDEX IF NOT EXISTS idx_organization_settings_org_key 
  ON organization_settings(organization_id, setting_key);

-- Index on organization_frameworks for faster org-specific framework queries
CREATE INDEX IF NOT EXISTS idx_organization_frameworks_org_id 
  ON organization_frameworks(organization_id);

-- Index on ai_decision_log for faster org-specific decision review queries
CREATE INDEX IF NOT EXISTS idx_ai_decision_log_org_timestamp 
  ON ai_decision_log(organization_id, processing_timestamp DESC);
