-- AI Bill of Materials (AIBOM) tables
-- Tracks AI model inventories linked to assets, including training data,
-- vulnerabilities, licensing, and deployment metadata.

DO $$
BEGIN

  -- -----------------------------------------------------------------------
  -- ai_boms: Primary AIBOM record per asset / AI model deployment
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_boms') THEN
    CREATE TABLE ai_boms (
      id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id           UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      asset_id                  UUID REFERENCES assets(id) ON DELETE SET NULL,

      -- AIBOM metadata
      aibom_format              VARCHAR(50)  NOT NULL DEFAULT 'custom',
      aibom_version             VARCHAR(20)  DEFAULT '1.0',
      generated_at              TIMESTAMPTZ  DEFAULT NOW(),
      generated_by              UUID         REFERENCES users(id) ON DELETE SET NULL,

      -- Model identity
      model_name                VARCHAR(255) NOT NULL,
      model_version             VARCHAR(100),
      model_provider            VARCHAR(255),
      model_family              VARCHAR(255),
      model_type                VARCHAR(100),
      model_architecture        VARCHAR(255),
      parameter_count           BIGINT,
      context_window_tokens     INTEGER,
      quantization              VARCHAR(100),

      -- Provenance and licensing
      model_source_url          TEXT,
      model_license             VARCHAR(255),
      model_hash_sha256         VARCHAR(64),
      huggingface_repo          VARCHAR(500),

      -- Training data
      training_data_sources     JSONB DEFAULT '[]',
      training_cutoff_date      DATE,
      fine_tuned                BOOLEAN DEFAULT false,
      fine_tuning_dataset       TEXT,
      fine_tuning_method        VARCHAR(100),

      -- Deployment context
      deployment_environment    VARCHAR(100),
      serving_framework         VARCHAR(255),
      serving_endpoint          TEXT,
      inference_hardware        VARCHAR(255),
      average_latency_ms        INTEGER,
      max_throughput_rps        INTEGER,

      -- Risk and governance
      risk_classification       VARCHAR(50)  DEFAULT 'unknown',
      intended_use              TEXT,
      prohibited_uses           TEXT,
      bias_testing_completed    BOOLEAN DEFAULT false,
      bias_testing_date         DATE,
      bias_testing_notes        TEXT,
      human_oversight_required  BOOLEAN DEFAULT false,
      explainability_available  BOOLEAN DEFAULT false,

      -- Vulnerabilities (denormalized cache)
      vulnerabilities           JSONB DEFAULT '[]',
      vulnerability_count       INTEGER GENERATED ALWAYS AS (
                                  jsonb_array_length(COALESCE(vulnerabilities, '[]'::jsonb))
                                ) STORED,

      -- Dependencies
      dependencies              JSONB DEFAULT '[]',

      -- Compliance mappings
      applicable_frameworks     JSONB DEFAULT '[]',
      compliance_notes          TEXT,

      -- Evaluation / benchmarks
      evaluation_results        JSONB DEFAULT '{}',

      -- Audit
      notes                     TEXT,
      metadata                  JSONB DEFAULT '{}',
      is_active                 BOOLEAN DEFAULT true,
      created_at                TIMESTAMPTZ DEFAULT NOW(),
      updated_at                TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX idx_ai_boms_org_id      ON ai_boms (organization_id);
    CREATE INDEX idx_ai_boms_asset_id    ON ai_boms (asset_id);
    CREATE INDEX idx_ai_boms_model_name  ON ai_boms (model_name);
    CREATE INDEX idx_ai_boms_risk_class  ON ai_boms (risk_classification);
    CREATE INDEX idx_ai_boms_org_active  ON ai_boms (organization_id, is_active);
  END IF;

  -- -----------------------------------------------------------------------
  -- ai_bom_control_mappings: Links AIBOM records to framework controls
  -- -----------------------------------------------------------------------
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_bom_control_mappings') THEN
    CREATE TABLE ai_bom_control_mappings (
      id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id       UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      aibom_id              UUID NOT NULL REFERENCES ai_boms(id) ON DELETE CASCADE,
      framework_control_id  UUID NOT NULL REFERENCES framework_controls(id) ON DELETE CASCADE,
      mapping_status        VARCHAR(50) DEFAULT 'identified',
      notes                 TEXT,
      created_at            TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE (aibom_id, framework_control_id)
    );

    CREATE INDEX idx_ai_bom_ctrl_map_aibom ON ai_bom_control_mappings (aibom_id);
    CREATE INDEX idx_ai_bom_ctrl_map_ctrl  ON ai_bom_control_mappings (framework_control_id);
  END IF;

END $$;

SELECT 'Migration 034 completed.' AS result;
