-- Migration 042: SIEM Integration Config
-- Supports Splunk HEC, Elastic (via HTTP/Logstash), and generic webhook/syslog forwarding.
-- Each org can configure multiple SIEM targets.

CREATE TABLE IF NOT EXISTS siem_configurations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            VARCHAR(255) NOT NULL,
  provider        VARCHAR(32) NOT NULL
                    CHECK (provider IN ('splunk', 'elastic', 'webhook', 'syslog')),
  enabled         BOOLEAN NOT NULL DEFAULT true,

  -- Common
  endpoint_url    TEXT,        -- HEC URL, Logstash HTTP input, or generic webhook URL
  api_key         TEXT,        -- Splunk HEC token, Elastic API key, or Bearer token (encrypted)
  is_key_encrypted BOOLEAN NOT NULL DEFAULT false,

  -- Splunk-specific
  splunk_index    VARCHAR(255),
  splunk_sourcetype VARCHAR(255) DEFAULT '_json',

  -- Elastic-specific
  elastic_index_prefix VARCHAR(255) DEFAULT 'controlweave',
  elastic_pipeline      VARCHAR(255),

  -- Syslog-specific
  syslog_host     VARCHAR(255),
  syslog_port     INTEGER DEFAULT 514,
  syslog_protocol VARCHAR(8) DEFAULT 'udp' CHECK (syslog_protocol IN ('udp','tcp','tls')),

  -- Webhook-specific
  webhook_secret  TEXT,        -- for HMAC signature verification (encrypted)
  is_secret_encrypted BOOLEAN NOT NULL DEFAULT false,
  webhook_headers JSONB DEFAULT '{}',

  -- What to forward
  event_filter    TEXT[] DEFAULT ARRAY['*'],  -- event types to forward; ['*'] = all

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_siem_config_org ON siem_configurations(organization_id);
