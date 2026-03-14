/**
 * Migration: Add Configuration Management tracking tables
 * 
 * Adds tables to support ANSI/EIA-649C, ISO 10007, and NIST SP 800-128 configuration management:
 * - configuration_baselines: Track approved configuration baselines
 * - configuration_items_cm: Enhanced CM tracking for existing CMDB assets
 * - change_control_requests: CCB workflow and change management
 * - configuration_audits: CM audit tracking
 */

exports.up = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Creating configuration management tables...');
    
    // 1. Configuration Baselines table
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuration_baselines (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        baseline_name VARCHAR(255) NOT NULL,
        baseline_version VARCHAR(50) NOT NULL,
        baseline_type VARCHAR(50) NOT NULL CHECK (baseline_type IN ('functional', 'allocated', 'product', 'system')),
        description TEXT,
        approval_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (approval_status IN ('draft', 'pending_approval', 'approved', 'superseded', 'archived')),
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        effective_date DATE,
        baseline_document_url TEXT,
        metadata JSONB DEFAULT '{}',
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, baseline_name, baseline_version)
      );
      
      CREATE INDEX IF NOT EXISTS idx_config_baselines_org ON configuration_baselines(organization_id);
      CREATE INDEX IF NOT EXISTS idx_config_baselines_status ON configuration_baselines(approval_status);
      CREATE INDEX IF NOT EXISTS idx_config_baselines_type ON configuration_baselines(baseline_type);
    `);
    console.log('✓ Created configuration_baselines table');
    
    // 2. Configuration Items CM tracking (extends existing CMDB assets)
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuration_items_cm (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        asset_id INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
        ci_number VARCHAR(100) NOT NULL,
        ci_type VARCHAR(50) NOT NULL CHECK (ci_type IN ('hardware', 'software', 'documentation', 'firmware', 'data', 'interface')),
        baseline_id INTEGER REFERENCES configuration_baselines(id) ON DELETE SET NULL,
        configuration_status VARCHAR(50) NOT NULL DEFAULT 'draft' CHECK (configuration_status IN ('draft', 'under_review', 'approved', 'released', 'obsolete')),
        version_number VARCHAR(50),
        serial_number VARCHAR(100),
        part_number VARCHAR(100),
        interface_dependencies TEXT[],
        cm_owner INTEGER REFERENCES users(id),
        last_audit_date DATE,
        next_audit_date DATE,
        audit_notes TEXT,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, ci_number)
      );
      
      CREATE INDEX IF NOT EXISTS idx_ci_cm_org ON configuration_items_cm(organization_id);
      CREATE INDEX IF NOT EXISTS idx_ci_cm_asset ON configuration_items_cm(asset_id);
      CREATE INDEX IF NOT EXISTS idx_ci_cm_baseline ON configuration_items_cm(baseline_id);
      CREATE INDEX IF NOT EXISTS idx_ci_cm_status ON configuration_items_cm(configuration_status);
    `);
    console.log('✓ Created configuration_items_cm table');
    
    // 3. Change Control Requests (CCB workflow)
    await client.query(`
      CREATE TABLE IF NOT EXISTS change_control_requests (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        ccr_number VARCHAR(100) NOT NULL,
        title VARCHAR(500) NOT NULL,
        description TEXT NOT NULL,
        change_type VARCHAR(50) NOT NULL CHECK (change_type IN ('corrective', 'adaptive', 'perfective', 'preventive', 'emergency')),
        priority VARCHAR(20) NOT NULL CHECK (priority IN ('critical', 'high', 'medium', 'low')),
        status VARCHAR(50) NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'pending_approval', 'approved', 'rejected', 'implemented', 'verified', 'closed', 'cancelled')),
        
        -- Affected items
        affected_baselines INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        affected_ci_ids INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        affected_systems TEXT[],
        
        -- Impact analysis
        impact_analysis TEXT,
        security_impact VARCHAR(20) CHECK (security_impact IN ('none', 'low', 'medium', 'high', 'critical')),
        cost_estimate DECIMAL(12,2),
        implementation_effort_hours INTEGER,
        risk_assessment TEXT,
        
        -- Workflow
        submitted_by INTEGER NOT NULL REFERENCES users(id),
        submitted_at TIMESTAMP NOT NULL DEFAULT NOW(),
        reviewed_by INTEGER REFERENCES users(id),
        reviewed_at TIMESTAMP,
        approved_by INTEGER REFERENCES users(id),
        approved_at TIMESTAMP,
        implemented_by INTEGER REFERENCES users(id),
        implemented_at TIMESTAMP,
        verified_by INTEGER REFERENCES users(id),
        verified_at TIMESTAMP,
        
        -- CCB meeting
        ccb_meeting_date DATE,
        ccb_meeting_notes TEXT,
        ccb_decision TEXT,
        
        -- Implementation
        implementation_plan TEXT,
        rollback_plan TEXT,
        test_plan TEXT,
        documentation_updates TEXT[],
        
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, ccr_number)
      );
      
      CREATE INDEX IF NOT EXISTS idx_ccr_org ON change_control_requests(organization_id);
      CREATE INDEX IF NOT EXISTS idx_ccr_status ON change_control_requests(status);
      CREATE INDEX IF NOT EXISTS idx_ccr_priority ON change_control_requests(priority);
      CREATE INDEX IF NOT EXISTS idx_ccr_type ON change_control_requests(change_type);
      CREATE INDEX IF NOT EXISTS idx_ccr_submitted_by ON change_control_requests(submitted_by);
    `);
    console.log('✓ Created change_control_requests table');
    
    // 4. Configuration Audits
    await client.query(`
      CREATE TABLE IF NOT EXISTS configuration_audits (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        audit_number VARCHAR(100) NOT NULL,
        audit_type VARCHAR(50) NOT NULL CHECK (audit_type IN ('functional', 'physical', 'process', 'compliance')),
        audit_scope TEXT NOT NULL,
        baseline_id INTEGER REFERENCES configuration_baselines(id),
        
        -- Schedule
        scheduled_date DATE NOT NULL,
        actual_start_date DATE,
        actual_end_date DATE,
        
        -- Status and results
        status VARCHAR(50) NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled')),
        audit_result VARCHAR(50) CHECK (audit_result IN ('passed', 'passed_with_findings', 'failed', 'not_applicable')),
        
        -- Team
        lead_auditor INTEGER REFERENCES users(id),
        audit_team INTEGER[] DEFAULT ARRAY[]::INTEGER[],
        
        -- Findings
        findings_count INTEGER DEFAULT 0,
        critical_findings INTEGER DEFAULT 0,
        major_findings INTEGER DEFAULT 0,
        minor_findings INTEGER DEFAULT 0,
        observations INTEGER DEFAULT 0,
        
        -- Documentation
        audit_plan_url TEXT,
        audit_report_url TEXT,
        findings_summary TEXT,
        corrective_actions TEXT,
        
        -- Follow-up
        follow_up_required BOOLEAN DEFAULT false,
        follow_up_date DATE,
        follow_up_status VARCHAR(50) CHECK (follow_up_status IN ('pending', 'in_progress', 'completed', 'overdue')),
        
        metadata JSONB DEFAULT '{}',
        created_by INTEGER NOT NULL REFERENCES users(id),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        UNIQUE(organization_id, audit_number)
      );
      
      CREATE INDEX IF NOT EXISTS idx_config_audits_org ON configuration_audits(organization_id);
      CREATE INDEX IF NOT EXISTS idx_config_audits_status ON configuration_audits(status);
      CREATE INDEX IF NOT EXISTS idx_config_audits_type ON configuration_audits(audit_type);
      CREATE INDEX IF NOT EXISTS idx_config_audits_baseline ON configuration_audits(baseline_id);
      CREATE INDEX IF NOT EXISTS idx_config_audits_scheduled ON configuration_audits(scheduled_date);
    `);
    console.log('✓ Created configuration_audits table');
    
    // 5. CM Activity Log (for status accounting)
    await client.query(`
      CREATE TABLE IF NOT EXISTS cm_activity_log (
        id SERIAL PRIMARY KEY,
        organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        activity_type VARCHAR(50) NOT NULL CHECK (activity_type IN ('baseline_created', 'baseline_updated', 'baseline_approved', 'ci_added', 'ci_updated', 'ci_status_changed', 'ccr_submitted', 'ccr_approved', 'ccr_implemented', 'audit_scheduled', 'audit_completed')),
        entity_type VARCHAR(50) NOT NULL CHECK (entity_type IN ('baseline', 'configuration_item', 'change_control_request', 'audit')),
        entity_id INTEGER NOT NULL,
        description TEXT NOT NULL,
        previous_value JSONB,
        new_value JSONB,
        performed_by INTEGER NOT NULL REFERENCES users(id),
        performed_at TIMESTAMP NOT NULL DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      );
      
      CREATE INDEX IF NOT EXISTS idx_cm_activity_org ON cm_activity_log(organization_id);
      CREATE INDEX IF NOT EXISTS idx_cm_activity_type ON cm_activity_log(activity_type);
      CREATE INDEX IF NOT EXISTS idx_cm_activity_entity ON cm_activity_log(entity_type, entity_id);
      CREATE INDEX IF NOT EXISTS idx_cm_activity_performed ON cm_activity_log(performed_at DESC);
    `);
    console.log('✓ Created cm_activity_log table');
    
    await client.query('COMMIT');
    console.log('\n✅ Configuration Management tables created successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
};

exports.down = async (pool) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    
    console.log('Dropping configuration management tables...');
    
    await client.query('DROP TABLE IF EXISTS cm_activity_log CASCADE');
    await client.query('DROP TABLE IF EXISTS configuration_audits CASCADE');
    await client.query('DROP TABLE IF EXISTS change_control_requests CASCADE');
    await client.query('DROP TABLE IF EXISTS configuration_items_cm CASCADE');
    await client.query('DROP TABLE IF EXISTS configuration_baselines CASCADE');
    
    await client.query('COMMIT');
    console.log('✅ Configuration Management tables dropped successfully');
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
};
