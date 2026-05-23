// @tier: enterprise
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');
const { auditLog } = require('../middleware/auditLog');
const { createRateLimiter } = require('../middleware/rateLimit');

const dataSovereigntyRateLimiter = createRateLimiter({
  label: 'data-sovereignty',
  windowMs: 15 * 60 * 1000,
  max: 200,
  keyGenerator: (req) => `org:${req.user?.organization_id || req.ip}`
});

router.use(authenticate);
router.use(dataSovereigntyRateLimiter);

// Get organization's data sovereignty configuration
router.get('/config', requirePermission('organizations.read'), async (req, res) => {
  try {
    const { organization_id } = req.user;

    const result = await pool.query(
      `SELECT 
        primary_data_region,
        data_residency_requirements,
        cross_border_transfer_allowed,
        approved_transfer_regions,
        data_localization_policy,
        sovereignty_attestation_date
      FROM organizations
      WHERE id = $1`,
      [organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error fetching sovereignty config:', error);
    res.status(500).json({ error: 'Failed to fetch sovereignty configuration' });
  }
});

// Update organization's data sovereignty configuration
router.put('/config', requirePermission('organizations.write'), auditLog('data_sovereignty_config_update'), async (req, res) => {
  try {
    const { id: userId, organization_id } = req.user;
    const {
      primary_data_region,
      data_residency_requirements,
      cross_border_transfer_allowed,
      approved_transfer_regions,
      data_localization_policy
    } = req.body;

    const result = await pool.query(
      `UPDATE organizations
      SET 
        primary_data_region = COALESCE($1, primary_data_region),
        data_residency_requirements = COALESCE($2, data_residency_requirements),
        cross_border_transfer_allowed = COALESCE($3, cross_border_transfer_allowed),
        approved_transfer_regions = COALESCE($4, approved_transfer_regions),
        data_localization_policy = COALESCE($5, data_localization_policy),
        sovereignty_attestation_date = NOW(),
        sovereignty_attestation_by = $6,
        updated_at = NOW()
      WHERE id = $7
      RETURNING 
        primary_data_region,
        data_residency_requirements,
        cross_border_transfer_allowed,
        approved_transfer_regions,
        data_localization_policy,
        sovereignty_attestation_date`,
      [
        primary_data_region,
        data_residency_requirements ? JSON.stringify(data_residency_requirements) : null,
        cross_border_transfer_allowed,
        approved_transfer_regions ? JSON.stringify(approved_transfer_regions) : null,
        data_localization_policy,
        userId,
        organization_id
      ]
    );

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating sovereignty config:', error);
    res.status(500).json({ error: 'Failed to update sovereignty configuration' });
  }
});

// Get all regulatory jurisdictions
router.get('/jurisdictions', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { has_ai_regulations, has_data_residency } = req.query;

    let query = 'SELECT * FROM regulatory_jurisdictions WHERE is_active = true';
    const params = [];
    let paramCount = 0;

    if (has_ai_regulations === 'true') {
      paramCount++;
      query += ` AND has_ai_regulations = $${paramCount}`;
      params.push(true);
    }

    if (has_data_residency === 'true') {
      paramCount++;
      query += ` AND has_data_residency = $${paramCount}`;
      params.push(true);
    }

    query += ' ORDER BY jurisdiction_name';

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching jurisdictions:', error);
    res.status(500).json({ error: 'Failed to fetch jurisdictions' });
  }
});

// Get recommended frameworks for a jurisdiction
router.get('/jurisdictions/:jurisdictionCode/recommended-frameworks', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { jurisdictionCode } = req.params;

    // Get jurisdiction with recommended frameworks
    const jurisdictionResult = await pool.query(
      `SELECT 
        jurisdiction_code,
        jurisdiction_name,
        recommended_frameworks
      FROM regulatory_jurisdictions
      WHERE jurisdiction_code = $1 AND is_active = true`,
      [jurisdictionCode.toUpperCase()]
    );

    if (jurisdictionResult.rows.length === 0) {
      return res.status(404).json({ error: 'Jurisdiction not found' });
    }

    const jurisdiction = jurisdictionResult.rows[0];
    const frameworkCodes = jurisdiction.recommended_frameworks || [];

    if (frameworkCodes.length === 0) {
      return res.json({
        success: true,
        data: {
          jurisdiction_code: jurisdiction.jurisdiction_code,
          jurisdiction_name: jurisdiction.jurisdiction_name,
          recommended_frameworks: []
        }
      });
    }

    // Get framework details
    const frameworksResult = await pool.query(
      `SELECT 
        id,
        code,
        name,
        version,
        description,
        category,
        tier_required
      FROM frameworks
      WHERE code = ANY($1::text[])
      ORDER BY 
        CASE 
          WHEN tier_required = 'community' THEN 1
          WHEN tier_required = 'pro' THEN 2
          WHEN tier_required = 'enterprise' THEN 3
          WHEN tier_required = 'govcloud' THEN 4
          ELSE 5
        END,
        name`,
      [frameworkCodes]
    );

    res.json({
      success: true,
      data: {
        jurisdiction_code: jurisdiction.jurisdiction_code,
        jurisdiction_name: jurisdiction.jurisdiction_name,
        recommended_frameworks: frameworksResult.rows
      }
    });
  } catch (error) {
    console.error('Error fetching recommended frameworks:', error);
    res.status(500).json({ error: 'Failed to fetch recommended frameworks' });
  }
});

// Get organization's jurisdictions
router.get('/organization-jurisdictions', requirePermission('organizations.read'), async (req, res) => {
  try {
    const { organization_id } = req.user;

    const result = await pool.query(
      `SELECT 
        oj.*,
        rj.jurisdiction_name,
        rj.jurisdiction_type,
        rj.has_ai_regulations,
        rj.has_data_residency,
        rj.primary_ai_law,
        rj.primary_privacy_law
      FROM organization_jurisdictions oj
      JOIN regulatory_jurisdictions rj ON oj.jurisdiction_id = rj.id
      WHERE oj.organization_id = $1
      ORDER BY oj.compliance_required DESC, rj.jurisdiction_name`,
      [organization_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching organization jurisdictions:', error);
    res.status(500).json({ error: 'Failed to fetch organization jurisdictions' });
  }
});

// Add a jurisdiction to organization
router.post('/organization-jurisdictions', requirePermission('organizations.write'), auditLog('organization_jurisdiction_add'), async (req, res) => {
  try {
    const { organization_id } = req.user;
    const {
      jurisdiction_id,
      presence_type,
      operational_since,
      compliance_required,
      applicable_frameworks,
      notes
    } = req.body;

    if (!jurisdiction_id || !presence_type) {
      return res.status(400).json({ error: 'jurisdiction_id and presence_type are required' });
    }

    const validPresenceTypes = ['headquarters', 'office', 'data_center', 'customers', 'vendors'];
    if (!validPresenceTypes.includes(presence_type)) {
      return res.status(400).json({ error: `presence_type must be one of: ${validPresenceTypes.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO organization_jurisdictions (
        organization_id, jurisdiction_id, presence_type, operational_since,
        compliance_required, applicable_frameworks, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        organization_id, jurisdiction_id, presence_type, operational_since,
        compliance_required || false,
        JSON.stringify(applicable_frameworks || []),
        notes
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error adding organization jurisdiction:', error);
    if (error.code === '23505') { // Unique constraint violation
      return res.status(409).json({ error: 'Jurisdiction already added to organization' });
    }
    res.status(500).json({ error: 'Failed to add organization jurisdiction' });
  }
});

// Update organization jurisdiction
router.put('/organization-jurisdictions/:id', requirePermission('organizations.write'), auditLog('organization_jurisdiction_update'), async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { id } = req.params;
    const {
      compliance_status,
      last_assessment_date,
      next_assessment_date,
      applicable_frameworks,
      notes
    } = req.body;

    const result = await pool.query(
      `UPDATE organization_jurisdictions
      SET 
        compliance_status = COALESCE($1, compliance_status),
        last_assessment_date = COALESCE($2, last_assessment_date),
        next_assessment_date = COALESCE($3, next_assessment_date),
        applicable_frameworks = COALESCE($4, applicable_frameworks),
        notes = COALESCE($5, notes),
        updated_at = NOW()
      WHERE id = $6 AND organization_id = $7
      RETURNING *`,
      [
        compliance_status,
        last_assessment_date,
        next_assessment_date,
        applicable_frameworks ? JSON.stringify(applicable_frameworks) : null,
        notes,
        id,
        organization_id
      ]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization jurisdiction not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating organization jurisdiction:', error);
    res.status(500).json({ error: 'Failed to update organization jurisdiction' });
  }
});

// Remove jurisdiction from organization
router.delete('/organization-jurisdictions/:id', requirePermission('organizations.write'), auditLog('organization_jurisdiction_remove'), async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM organization_jurisdictions WHERE id = $1 AND organization_id = $2 RETURNING id',
      [id, organization_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Organization jurisdiction not found' });
    }

    res.json({ success: true, message: 'Jurisdiction removed from organization' });
  } catch (error) {
    console.error('Error removing organization jurisdiction:', error);
    res.status(500).json({ error: 'Failed to remove organization jurisdiction' });
  }
});

// Get regulatory changes
router.get('/regulatory-changes', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { organization_id } = req.user;
    const { jurisdiction_id, impact_level, status, requires_action } = req.query;

    // Get organization's jurisdictions first
    const orgJurisdictionsResult = await pool.query(
      'SELECT jurisdiction_id FROM organization_jurisdictions WHERE organization_id = $1',
      [organization_id]
    );

    const orgJurisdictionIds = orgJurisdictionsResult.rows.map(row => row.jurisdiction_id);

    if (orgJurisdictionIds.length === 0) {
      return res.json({ success: true, data: [] });
    }

    let query = `
      SELECT 
        rc.*,
        rj.jurisdiction_name,
        rj.jurisdiction_code
      FROM regulatory_changes rc
      JOIN regulatory_jurisdictions rj ON rc.jurisdiction_id = rj.id
      WHERE rc.jurisdiction_id = ANY($1::uuid[])
    `;
    const params = [orgJurisdictionIds];
    let paramCount = 1;

    if (jurisdiction_id) {
      paramCount++;
      query += ` AND rc.jurisdiction_id = $${paramCount}`;
      params.push(jurisdiction_id);
    }

    if (impact_level) {
      paramCount++;
      query += ` AND rc.impact_level = $${paramCount}`;
      params.push(impact_level);
    }

    if (status) {
      paramCount++;
      query += ` AND rc.status = $${paramCount}`;
      params.push(status);
    }

    if (requires_action === 'true') {
      paramCount++;
      query += ` AND rc.requires_action = $${paramCount}`;
      params.push(true);
    }

    query += ' ORDER BY rc.effective_date DESC, rc.impact_level DESC';

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching regulatory changes:', error);
    res.status(500).json({ error: 'Failed to fetch regulatory changes' });
  }
});

// Create a regulatory change entry (admin only)
router.post('/regulatory-changes', requirePermission('frameworks.manage'), auditLog('regulatory_change_create'), async (req, res) => {
  try {
    const {
      jurisdiction_id,
      change_title,
      change_type,
      change_source,
      announced_date,
      effective_date,
      compliance_deadline,
      impact_level,
      affected_frameworks,
      affected_controls,
      summary,
      full_details,
      source_url,
      requires_action
    } = req.body;

    if (!jurisdiction_id || !change_title || !change_type || !summary) {
      return res.status(400).json({ error: 'jurisdiction_id, change_title, change_type, and summary are required' });
    }

    const validChangeTypes = ['new_law', 'amendment', 'repeal', 'guidance', 'enforcement_action'];
    if (!validChangeTypes.includes(change_type)) {
      return res.status(400).json({ error: `change_type must be one of: ${validChangeTypes.join(', ')}` });
    }

    const result = await pool.query(
      `INSERT INTO regulatory_changes (
        jurisdiction_id, change_title, change_type, change_source,
        announced_date, effective_date, compliance_deadline,
        impact_level, affected_frameworks, affected_controls,
        summary, full_details, source_url, requires_action
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING *`,
      [
        jurisdiction_id, change_title, change_type, change_source,
        announced_date, effective_date, compliance_deadline,
        impact_level || 'unknown',
        JSON.stringify(affected_frameworks || []),
        JSON.stringify(affected_controls || []),
        summary, full_details, source_url, requires_action || false
      ]
    );

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error creating regulatory change:', error);
    res.status(500).json({ error: 'Failed to create regulatory change' });
  }
});

// Update regulatory change status
router.put('/regulatory-changes/:id/status', requirePermission('frameworks.manage'), auditLog('regulatory_change_status_update'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, action_plan_created, action_plan_id } = req.body;

    const validStatuses = ['monitoring', 'assessing', 'implementing', 'compliant'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
    }

    const result = await pool.query(
      `UPDATE regulatory_changes
      SET 
        status = COALESCE($1, status),
        action_plan_created = COALESCE($2, action_plan_created),
        action_plan_id = COALESCE($3, action_plan_id),
        updated_at = NOW()
      WHERE id = $4
      RETURNING *`,
      [status, action_plan_created, action_plan_id, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Regulatory change not found' });
    }

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    console.error('Error updating regulatory change status:', error);
    res.status(500).json({ error: 'Failed to update regulatory change status' });
  }
});

// Get AI provider regions
router.get('/ai-provider-regions', requirePermission('organizations.read'), async (req, res) => {
  try {
    const { provider_name, jurisdiction_code, is_available } = req.query;

    let query = 'SELECT * FROM ai_provider_regions WHERE 1=1';
    const params = [];
    let paramCount = 0;

    if (provider_name) {
      paramCount++;
      query += ` AND provider_name = $${paramCount}`;
      params.push(provider_name);
    }

    if (jurisdiction_code) {
      paramCount++;
      query += ` AND jurisdiction_code = $${paramCount}`;
      params.push(jurisdiction_code);
    }

    if (is_available === 'true') {
      paramCount++;
      query += ` AND is_available = $${paramCount}`;
      params.push(true);
    }

    query += ' ORDER BY provider_name, region_code';

    const result = await pool.query(query, params);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error fetching AI provider regions:', error);
    res.status(500).json({ error: 'Failed to fetch AI provider regions' });
  }
});

// Compliance gap analysis by jurisdiction
router.get('/compliance-gap-analysis', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const { organization_id } = req.user;

    const result = await pool.query(
      `SELECT 
        oj.id,
        rj.jurisdiction_name,
        rj.jurisdiction_code,
        rj.primary_ai_law,
        rj.primary_privacy_law,
        oj.presence_type,
        oj.compliance_status,
        oj.compliance_required,
        oj.last_assessment_date,
        oj.next_assessment_date,
        oj.applicable_frameworks,
        COUNT(rc.id) FILTER (WHERE rc.requires_action = true) as pending_regulatory_changes,
        COUNT(rc.id) FILTER (WHERE rc.impact_level = 'critical') as critical_changes
      FROM organization_jurisdictions oj
      JOIN regulatory_jurisdictions rj ON oj.jurisdiction_id = rj.id
      LEFT JOIN regulatory_changes rc ON rc.jurisdiction_id = rj.id
      WHERE oj.organization_id = $1
      GROUP BY 
        oj.id, rj.jurisdiction_name, rj.jurisdiction_code,
        rj.primary_ai_law, rj.primary_privacy_law,
        oj.presence_type, oj.compliance_status, oj.compliance_required,
        oj.last_assessment_date, oj.next_assessment_date, oj.applicable_frameworks
      ORDER BY 
        oj.compliance_required DESC,
        critical_changes DESC,
        pending_regulatory_changes DESC`,
      [organization_id]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error performing compliance gap analysis:', error);
    res.status(500).json({ error: 'Failed to perform compliance gap analysis' });
  }
});

module.exports = router;
