// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const ExcelJS = require('exceljs');
const multer = require('multer');
const path = require('path');
const { Readable } = require('stream');
const llm = require('../services/llmService');
const { authenticate, requirePermission } = require('../middleware/auth');
const { validateBody, isUuid } = require('../middleware/validate');
const { getFrameworkLimit, normalizeTier, shouldEnforceAiLimitForByok } = require('../config/tierPolicy');
const { getConfigValue } = require('../services/dynamicConfigService');
const { log } = require('../utils/logger');

const STRICT_CROSSWALK_MAPPING_TYPES = ['equivalent', 'exact'];

// Escape special characters in ILIKE patterns to prevent wildcard injection
function escapeIlike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}

router.use(authenticate);

const VALID_CIA_LEVELS = new Set(['low', 'moderate', 'high']);
const VALID_RMF_STAGES = new Set(['prepare', 'categorize', 'select', 'implement', 'assess', 'authorize', 'monitor']);
const VALID_COMPLIANCE_PROFILES = new Set(['private', 'federal', 'hybrid']);
const VALID_NIST_ADOPTION_MODES = new Set(['best_practice', 'mandatory']);
const VALID_ENVIRONMENT_TYPES = new Set([
  'on_prem',
  'cloud',
  'hybrid',
  'saas',
  'ot',
  'development',
  'test',
  'staging',
  'production'
]);
const VALID_DEPLOYMENT_MODELS = new Set(['on_prem', 'single_cloud', 'multi_cloud', 'hybrid', 'saas_only']);
const VALID_DATA_SENSITIVITY_TYPES = new Set([
  'pii',
  'phi',
  'pci',
  'cui',
  'fci',
  'financial',
  'operational',
  'ip',
  'public',
  'internal',
  'confidential',
  'restricted'
]);
const VALID_COTS_PRODUCT_TYPES = new Set(['cots', 'saas', 'managed_service', 'platform', 'other']);
const VALID_COTS_DEPLOYMENT_MODELS = new Set([
  'on_prem',
  'single_cloud',
  'multi_cloud',
  'hybrid',
  'saas_only',
  'managed_service',
  'other'
]);
const VALID_COTS_DATA_ACCESS_LEVELS = new Set(['none', 'metadata', 'limited', 'full']);
const VALID_COTS_LIFECYCLE_STATUSES = new Set(['planned', 'active', 'deprecated', 'retired']);
const VALID_CRITICALITY_LEVELS = new Set(['low', 'medium', 'high', 'critical']);
const VALID_CONTRACT_TYPES = new Set(['msa', 'sow', 'license', 'dpa', 'baa', 'sla', 'other']);
const VALID_CONTRACT_STATUSES = new Set(['draft', 'active', 'renewal_pending', 'expired', 'terminated']);
const RMF_FRAMEWORK_CODES = new Set(['nist_800_53', 'nist_800_171', 'cmmc_2.0']);
const NIST_800_53_REQUIRED_INFORMATION_TYPE_CODES = new Set(['nist_800_53']);
const VALID_CONTROL_IMPLEMENTATION_STATUSES = new Set([
  'not_started',
  'in_progress',
  'implemented',
  'needs_review',
  'satisfied_via_crosswalk',
  'verified',
  'not_applicable'
]);

const controlsImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

function toNullableString(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeArray(value, allowedSet) {
  if (!Array.isArray(value)) return [];
  const normalized = value
    .map((item) => String(item || '').trim().toLowerCase())
    .filter((item) => item.length > 0);

  if (allowedSet) {
    return Array.from(new Set(normalized.filter((item) => allowedSet.has(item))));
  }

  return Array.from(new Set(normalized));
}

function toLowerNullableString(value) {
  return toNullableString(value)?.toLowerCase() || null;
}

function toNullableDateString(value) {
  const normalized = toNullableString(value);
  if (!normalized) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  return normalized;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'y', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n', 'off'].includes(normalized)) return false;
  }
  return fallback;
}

function sanitizeFlexibleArray(value, allowedSet) {
  if (Array.isArray(value)) {
    return sanitizeArray(value, allowedSet);
  }
  if (typeof value === 'string') {
    return sanitizeArray(value.split(','), allowedSet);
  }
  return [];
}

async function logOrganizationEvent({
  organizationId,
  userId,
  eventType,
  resourceType,
  resourceId = null,
  details = null
}) {
  try {
    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details, success)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, true)`,
      [
        organizationId,
        userId || null,
        eventType,
        resourceType,
        resourceId,
        details ? JSON.stringify(details) : null
      ]
    );
  } catch (error) {
    // Non-blocking audit insert.
  }
}

async function rehydrateImplementationsForFrameworkSelection({
  client,
  organizationId,
  userId,
  addedFrameworkIds,
  propagateEvidence = false
}) {
  if (!Array.isArray(addedFrameworkIds) || addedFrameworkIds.length === 0) {
    return { rehydratedCount: 0, propagatedEvidenceLinks: 0 };
  }

  const candidateMappings = await client.query(
    `SELECT DISTINCT ON (target_fc.id)
       target_fc.id AS target_control_id,
       source_fc.id AS source_control_id,
       cm.similarity_score,
       cm.mapping_type,
       source_ci.status AS source_status
     FROM framework_controls target_fc
     JOIN control_mappings cm
       ON (cm.source_control_id = target_fc.id OR cm.target_control_id = target_fc.id)
     JOIN framework_controls source_fc
       ON source_fc.id = CASE
         WHEN cm.source_control_id = target_fc.id THEN cm.target_control_id
         ELSE cm.source_control_id
       END
     JOIN control_implementations source_ci
       ON source_ci.control_id = source_fc.id
      AND source_ci.organization_id = $1
      AND source_ci.status IN ('implemented', 'verified')
     LEFT JOIN control_implementations target_ci
       ON target_ci.control_id = target_fc.id
      AND target_ci.organization_id = $1
     WHERE target_fc.framework_id::text = ANY($2::text[])
       AND target_ci.control_id IS NULL
       AND source_fc.id != target_fc.id
       AND (
         COALESCE(LOWER(cm.mapping_type), '') = ANY($3::text[])
         OR cm.similarity_score = 100
       )
     ORDER BY target_fc.id, cm.similarity_score DESC`,
    [organizationId, addedFrameworkIds, STRICT_CROSSWALK_MAPPING_TYPES]
  );

  let rehydratedCount = 0;
  let propagatedEvidenceLinks = 0;

  for (const mapRow of candidateMappings.rows) {
    const insertedImplementation = await client.query(
      `INSERT INTO control_implementations (control_id, organization_id, status, notes)
       VALUES ($1, $2, 'satisfied_via_crosswalk', $3)
       ON CONFLICT (control_id, organization_id) DO NOTHING`,
      [
        mapRow.target_control_id,
        organizationId,
        `Rehydrated from mapped control ${mapRow.source_control_id} (${mapRow.similarity_score}% ${mapRow.mapping_type || 'mapped'} match) after framework selection.`
      ]
    );

    if ((insertedImplementation.rowCount || 0) === 0) {
      continue;
    }

    await client.query(
      `INSERT INTO control_inheritance_events (
         organization_id, source_control_id, target_control_id, source_status, inherited_status,
         similarity_score, event_notes, triggered_by
       )
       VALUES ($1, $2, $3, $4, 'satisfied_via_crosswalk', $5, $6, $7)`,
      [
        organizationId,
        mapRow.source_control_id,
        mapRow.target_control_id,
        mapRow.source_status || 'implemented',
        mapRow.similarity_score,
        'Framework selection rehydration',
        userId || null
      ]
    );

    rehydratedCount += 1;

    if (propagateEvidence) {
      const propagated = await client.query(
        `INSERT INTO evidence_control_links (evidence_id, control_id, notes)
         SELECT DISTINCT ecl.evidence_id, $2::uuid, $3
         FROM evidence_control_links ecl
         JOIN evidence e ON e.id = ecl.evidence_id
         WHERE ecl.control_id = $4::uuid
           AND e.organization_id = $1
         ON CONFLICT (evidence_id, control_id) DO NOTHING`,
        [
          organizationId,
          mapRow.target_control_id,
          `Rehydrated evidence via strict crosswalk from control ${mapRow.source_control_id}`,
          mapRow.source_control_id
        ]
      );
      propagatedEvidenceLinks += propagated.rowCount || 0;
    }
  }

  return { rehydratedCount, propagatedEvidenceLinks };
}

async function ensureSystemBelongsToOrganization(organizationId, systemId) {
  if (!systemId) return null;
  const result = await pool.query(
    `SELECT *
     FROM organization_systems
     WHERE id = $1 AND organization_id = $2
     LIMIT 1`,
    [systemId, organizationId]
  );
  return result.rows[0] || null;
}

function normalizeSystemInput(input, existing = null) {
  const confidentialityImpact = input.confidentiality_impact !== undefined
    ? toLowerNullableString(input.confidentiality_impact)
    : existing?.confidentiality_impact || null;
  const integrityImpact = input.integrity_impact !== undefined
    ? toLowerNullableString(input.integrity_impact)
    : existing?.integrity_impact || null;
  const availabilityImpact = input.availability_impact !== undefined
    ? toLowerNullableString(input.availability_impact)
    : existing?.availability_impact || null;
  const deploymentModel = input.deployment_model !== undefined
    ? toLowerNullableString(input.deployment_model)
    : existing?.deployment_model || null;

  const payload = {
    system_name: input.system_name !== undefined
      ? toNullableString(input.system_name)
      : existing?.system_name || null,
    system_code: input.system_code !== undefined
      ? toNullableString(input.system_code)
      : existing?.system_code || null,
    system_description: input.system_description !== undefined
      ? toNullableString(input.system_description)
      : existing?.system_description || null,
    authorization_boundary_override: input.authorization_boundary_override !== undefined
      ? toNullableString(input.authorization_boundary_override)
      : existing?.authorization_boundary_override || null,
    operating_environment_summary_override: input.operating_environment_summary_override !== undefined
      ? toNullableString(input.operating_environment_summary_override)
      : existing?.operating_environment_summary_override || null,
    confidentiality_impact: confidentialityImpact,
    integrity_impact: integrityImpact,
    availability_impact: availabilityImpact,
    impact_rationale: input.impact_rationale !== undefined
      ? toNullableString(input.impact_rationale)
      : existing?.impact_rationale || null,
    environment_types: input.environment_types !== undefined
      ? sanitizeFlexibleArray(input.environment_types, VALID_ENVIRONMENT_TYPES)
      : existing?.environment_types || [],
    deployment_model: deploymentModel,
    cloud_providers: input.cloud_providers !== undefined
      ? sanitizeFlexibleArray(input.cloud_providers)
      : existing?.cloud_providers || [],
    data_sensitivity_types: input.data_sensitivity_types !== undefined
      ? sanitizeFlexibleArray(input.data_sensitivity_types, VALID_DATA_SENSITIVITY_TYPES)
      : existing?.data_sensitivity_types || [],
    is_primary: input.is_primary !== undefined
      ? toBoolean(input.is_primary, false)
      : Boolean(existing?.is_primary),
    is_active: input.is_active !== undefined
      ? toBoolean(input.is_active, true)
      : (existing ? Boolean(existing.is_active) : true)
  };

  const errors = [];
  if (!payload.system_name) {
    errors.push('system_name is required');
  }
  if (payload.confidentiality_impact && !VALID_CIA_LEVELS.has(payload.confidentiality_impact)) {
    errors.push('confidentiality_impact must be one of: low, moderate, high');
  }
  if (payload.integrity_impact && !VALID_CIA_LEVELS.has(payload.integrity_impact)) {
    errors.push('integrity_impact must be one of: low, moderate, high');
  }
  if (payload.availability_impact && !VALID_CIA_LEVELS.has(payload.availability_impact)) {
    errors.push('availability_impact must be one of: low, moderate, high');
  }
  if (payload.deployment_model && !VALID_DEPLOYMENT_MODELS.has(payload.deployment_model)) {
    errors.push('deployment_model must be one of: on_prem, single_cloud, multi_cloud, hybrid, saas_only');
  }

  return { payload, errors };
}

function normalizeCotsProductInput(input, existing = null) {
  const productType = input.product_type !== undefined
    ? toLowerNullableString(input.product_type)
    : existing?.product_type || null;
  const deploymentModel = input.deployment_model !== undefined
    ? toLowerNullableString(input.deployment_model)
    : existing?.deployment_model || null;
  const dataAccessLevel = input.data_access_level !== undefined
    ? toLowerNullableString(input.data_access_level)
    : existing?.data_access_level || null;
  const lifecycleStatus = input.lifecycle_status !== undefined
    ? toLowerNullableString(input.lifecycle_status)
    : existing?.lifecycle_status || 'active';
  const criticality = input.criticality !== undefined
    ? toLowerNullableString(input.criticality)
    : existing?.criticality || null;
  const supportEndDate = input.support_end_date !== undefined
    ? toNullableDateString(input.support_end_date)
    : existing?.support_end_date || null;

  const payload = {
    system_id: input.system_id !== undefined
      ? toNullableString(input.system_id)
      : existing?.system_id || null,
    product_name: input.product_name !== undefined
      ? toNullableString(input.product_name)
      : existing?.product_name || null,
    vendor_name: input.vendor_name !== undefined
      ? toNullableString(input.vendor_name)
      : existing?.vendor_name || null,
    product_version: input.product_version !== undefined
      ? toNullableString(input.product_version)
      : existing?.product_version || null,
    product_type: productType,
    deployment_model: deploymentModel,
    data_access_level: dataAccessLevel,
    lifecycle_status: lifecycleStatus,
    criticality,
    support_end_date: supportEndDate,
    notes: input.notes !== undefined
      ? toNullableString(input.notes)
      : existing?.notes || null
  };

  const errors = [];
  if (!payload.product_name) {
    errors.push('product_name is required');
  }
  if (!payload.vendor_name) {
    errors.push('vendor_name is required');
  }
  if (payload.product_type && !VALID_COTS_PRODUCT_TYPES.has(payload.product_type)) {
    errors.push('product_type must be one of: cots, saas, managed_service, platform, other');
  }
  if (payload.deployment_model && !VALID_COTS_DEPLOYMENT_MODELS.has(payload.deployment_model)) {
    errors.push('deployment_model must be one of: on_prem, single_cloud, multi_cloud, hybrid, saas_only, managed_service, other');
  }
  if (payload.data_access_level && !VALID_COTS_DATA_ACCESS_LEVELS.has(payload.data_access_level)) {
    errors.push('data_access_level must be one of: none, metadata, limited, full');
  }
  if (payload.lifecycle_status && !VALID_COTS_LIFECYCLE_STATUSES.has(payload.lifecycle_status)) {
    errors.push('lifecycle_status must be one of: planned, active, deprecated, retired');
  }
  if (payload.criticality && !VALID_CRITICALITY_LEVELS.has(payload.criticality)) {
    errors.push('criticality must be one of: low, medium, high, critical');
  }
  if (input.support_end_date !== undefined && supportEndDate === undefined) {
    errors.push('support_end_date must be formatted as YYYY-MM-DD');
  }

  return { payload, errors };
}

function normalizeContractInput(input, existing = null) {
  const contractType = input.contract_type !== undefined
    ? toLowerNullableString(input.contract_type)
    : existing?.contract_type || null;
  const status = input.status !== undefined
    ? toLowerNullableString(input.status)
    : existing?.status || 'active';
  const startDate = input.start_date !== undefined
    ? toNullableDateString(input.start_date)
    : existing?.start_date || null;
  const endDate = input.end_date !== undefined
    ? toNullableDateString(input.end_date)
    : existing?.end_date || null;
  const renewalDate = input.renewal_date !== undefined
    ? toNullableDateString(input.renewal_date)
    : existing?.renewal_date || null;

  let noticePeriodDays = existing?.notice_period_days ?? null;
  if (input.notice_period_days !== undefined && input.notice_period_days !== null && String(input.notice_period_days).trim() !== '') {
    const parsed = Number.parseInt(String(input.notice_period_days), 10);
    noticePeriodDays = Number.isFinite(parsed) ? parsed : undefined;
  } else if (input.notice_period_days !== undefined) {
    noticePeriodDays = null;
  }

  const payload = {
    system_id: input.system_id !== undefined
      ? toNullableString(input.system_id)
      : existing?.system_id || null,
    cots_product_id: input.cots_product_id !== undefined
      ? toNullableString(input.cots_product_id)
      : existing?.cots_product_id || null,
    contract_name: input.contract_name !== undefined
      ? toNullableString(input.contract_name)
      : existing?.contract_name || null,
    vendor_name: input.vendor_name !== undefined
      ? toNullableString(input.vendor_name)
      : existing?.vendor_name || null,
    contract_number: input.contract_number !== undefined
      ? toNullableString(input.contract_number)
      : existing?.contract_number || null,
    contract_type: contractType,
    status,
    start_date: startDate,
    end_date: endDate,
    renewal_date: renewalDate,
    notice_period_days: noticePeriodDays,
    security_requirements: input.security_requirements !== undefined
      ? toNullableString(input.security_requirements)
      : existing?.security_requirements || null,
    data_processing_terms: input.data_processing_terms !== undefined
      ? toNullableString(input.data_processing_terms)
      : existing?.data_processing_terms || null,
    sla_summary: input.sla_summary !== undefined
      ? toNullableString(input.sla_summary)
      : existing?.sla_summary || null,
    notes: input.notes !== undefined
      ? toNullableString(input.notes)
      : existing?.notes || null
  };

  const errors = [];
  if (!payload.contract_name) {
    errors.push('contract_name is required');
  }
  if (!payload.vendor_name) {
    errors.push('vendor_name is required');
  }
  if (payload.contract_type && !VALID_CONTRACT_TYPES.has(payload.contract_type)) {
    errors.push('contract_type must be one of: msa, sow, license, dpa, baa, sla, other');
  }
  if (payload.status && !VALID_CONTRACT_STATUSES.has(payload.status)) {
    errors.push('status must be one of: draft, active, renewal_pending, expired, terminated');
  }
  if (input.start_date !== undefined && startDate === undefined) {
    errors.push('start_date must be formatted as YYYY-MM-DD');
  }
  if (input.end_date !== undefined && endDate === undefined) {
    errors.push('end_date must be formatted as YYYY-MM-DD');
  }
  if (input.renewal_date !== undefined && renewalDate === undefined) {
    errors.push('renewal_date must be formatted as YYYY-MM-DD');
  }
  if (noticePeriodDays === undefined) {
    errors.push('notice_period_days must be an integer');
  } else if (noticePeriodDays !== null && noticePeriodDays < 0) {
    errors.push('notice_period_days must be 0 or greater');
  }

  return { payload, errors };
}

function getDefaultOrganizationProfile(organizationId) {
  return {
    organization_id: organizationId,
    company_legal_name: null,
    company_description: null,
    industry: null,
    website: null,
    headquarters_location: null,
    employee_count_range: null,
    system_name: null,
    system_description: null,
    authorization_boundary: null,
    operating_environment_summary: null,
    confidentiality_impact: null,
    integrity_impact: null,
    availability_impact: null,
    impact_rationale: null,
    environment_types: [],
    deployment_model: null,
    cloud_providers: [],
    data_sensitivity_types: [],
    rmf_stage: null,
    rmf_notes: null,
    compliance_profile: 'private',
    nist_adoption_mode: 'best_practice',
    nist_notes: null,
    onboarding_completed: false,
    onboarding_completed_at: null
  };
}

// Verify the user belongs to the requested org
function verifyOrgAccess(req, res) {
  const orgId = req.params.orgId;
  if (orgId !== req.user.organization_id) {
    res.status(403).json({ success: false, error: 'Access denied: you do not belong to this organization' });
    return null;
  }
  return orgId;
}

// GET /organizations/me/profile
router.get('/me/profile', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const profileResult = await pool.query(
      `SELECT *
       FROM organization_profiles
       WHERE organization_id = $1
       LIMIT 1`,
      [orgId]
    );

    const frameworkResult = await pool.query(
      `SELECT f.code
       FROM organization_frameworks ofw
       JOIN frameworks f ON f.id = ofw.framework_id
       WHERE ofw.organization_id = $1`,
      [orgId]
    );

    const selectedFrameworkCodes = frameworkResult.rows
      .map((row) => String(row.code || '').toLowerCase())
      .filter((code) => code.length > 0);
    const rmfRelevant = selectedFrameworkCodes.some((code) => RMF_FRAMEWORK_CODES.has(code));
    const profile = profileResult.rows[0] || getDefaultOrganizationProfile(orgId);

    res.json({
      success: true,
      data: {
        profile,
        selected_framework_codes: selectedFrameworkCodes,
        guidance: {
          onboarding_mode: 'Private-sector baseline by default. Additional federal/NIST guidance appears when selected frameworks require it.',
          baseline_focus: [
            'Organization and system description',
            'Authorization boundary and operating environment',
            'Confidentiality, Integrity, Availability impact baseline',
            'Evidence-ready governance notes'
          ]
        },
        framework_guidance: {
          rmf_relevant: rmfRelevant,
          rmf_trigger_framework_codes: Array.from(RMF_FRAMEWORK_CODES)
        }
      }
    });
  } catch (error) {
    log('error', 'organizations.profile.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load organization profile' });
  }
});

// PUT /organizations/me/profile
router.put('/me/profile', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    const existingResult = await pool.query(
      `SELECT *
       FROM organization_profiles
       WHERE organization_id = $1
       LIMIT 1`,
      [orgId]
    );
    const existing = existingResult.rows[0] || getDefaultOrganizationProfile(orgId);
    const frameworkResult = await pool.query(
      `SELECT f.code
       FROM organization_frameworks ofw
       JOIN frameworks f ON f.id = ofw.framework_id
       WHERE ofw.organization_id = $1`,
      [orgId]
    );
    const selectedFrameworkCodes = frameworkResult.rows
      .map((row) => String(row.code || '').toLowerCase())
      .filter((code) => code.length > 0);
    const rmfRelevant = selectedFrameworkCodes.some((code) => RMF_FRAMEWORK_CODES.has(code));

    const confidentiality = toNullableString(req.body.confidentiality_impact)?.toLowerCase() || null;
    const integrity = toNullableString(req.body.integrity_impact)?.toLowerCase() || null;
    const availability = toNullableString(req.body.availability_impact)?.toLowerCase() || null;
    const rmfStage = toNullableString(req.body.rmf_stage)?.toLowerCase() || null;
    const deploymentModel = toNullableString(req.body.deployment_model)?.toLowerCase() || null;
    const complianceProfileInput = toNullableString(req.body.compliance_profile)?.toLowerCase() || null;
    const nistAdoptionInput = toNullableString(req.body.nist_adoption_mode)?.toLowerCase() || null;

    const complianceProfile = req.body.compliance_profile !== undefined
      ? (complianceProfileInput || 'private')
      : (existing.compliance_profile || 'private');
    const nistAdoptionMode = req.body.nist_adoption_mode !== undefined
      ? (nistAdoptionInput || 'best_practice')
      : (existing.nist_adoption_mode || 'best_practice');

    if (confidentiality && !VALID_CIA_LEVELS.has(confidentiality)) {
      return res.status(400).json({ success: false, error: 'confidentiality_impact must be one of: low, moderate, high' });
    }
    if (integrity && !VALID_CIA_LEVELS.has(integrity)) {
      return res.status(400).json({ success: false, error: 'integrity_impact must be one of: low, moderate, high' });
    }
    if (availability && !VALID_CIA_LEVELS.has(availability)) {
      return res.status(400).json({ success: false, error: 'availability_impact must be one of: low, moderate, high' });
    }
    if (rmfStage && !VALID_RMF_STAGES.has(rmfStage)) {
      return res.status(400).json({
        success: false,
        error: 'rmf_stage must be one of: prepare, categorize, select, implement, assess, authorize, monitor'
      });
    }
    if (deploymentModel && !VALID_DEPLOYMENT_MODELS.has(deploymentModel)) {
      return res.status(400).json({
        success: false,
        error: 'deployment_model must be one of: on_prem, single_cloud, multi_cloud, hybrid, saas_only'
      });
    }
    if (!VALID_COMPLIANCE_PROFILES.has(complianceProfile)) {
      return res.status(400).json({
        success: false,
        error: 'compliance_profile must be one of: private, federal, hybrid'
      });
    }
    if (!VALID_NIST_ADOPTION_MODES.has(nistAdoptionMode)) {
      return res.status(400).json({
        success: false,
        error: 'nist_adoption_mode must be one of: best_practice, mandatory'
      });
    }

    const environmentTypes = req.body.environment_types !== undefined
      ? sanitizeArray(req.body.environment_types, VALID_ENVIRONMENT_TYPES)
      : existing.environment_types || [];
    const cloudProviders = req.body.cloud_providers !== undefined
      ? sanitizeArray(req.body.cloud_providers)
      : existing.cloud_providers || [];
    const dataSensitivityTypes = req.body.data_sensitivity_types !== undefined
      ? sanitizeArray(req.body.data_sensitivity_types, VALID_DATA_SENSITIVITY_TYPES)
      : existing.data_sensitivity_types || [];

    const onboardingCompletedRequested = req.body.onboarding_completed === true;
    const onboardingCompleted = onboardingCompletedRequested || Boolean(existing.onboarding_completed);

    const nextProfile = {
      company_legal_name: req.body.company_legal_name !== undefined ? toNullableString(req.body.company_legal_name) : existing.company_legal_name,
      company_description: req.body.company_description !== undefined ? toNullableString(req.body.company_description) : existing.company_description,
      industry: req.body.industry !== undefined ? toNullableString(req.body.industry) : existing.industry,
      website: req.body.website !== undefined ? toNullableString(req.body.website) : existing.website,
      headquarters_location: req.body.headquarters_location !== undefined ? toNullableString(req.body.headquarters_location) : existing.headquarters_location,
      employee_count_range: req.body.employee_count_range !== undefined ? toNullableString(req.body.employee_count_range) : existing.employee_count_range,
      system_name: req.body.system_name !== undefined ? toNullableString(req.body.system_name) : existing.system_name,
      system_description: req.body.system_description !== undefined ? toNullableString(req.body.system_description) : existing.system_description,
      authorization_boundary: req.body.authorization_boundary !== undefined ? toNullableString(req.body.authorization_boundary) : existing.authorization_boundary,
      operating_environment_summary: req.body.operating_environment_summary !== undefined ? toNullableString(req.body.operating_environment_summary) : existing.operating_environment_summary,
      confidentiality_impact: confidentiality !== null || req.body.confidentiality_impact !== undefined ? confidentiality : existing.confidentiality_impact,
      integrity_impact: integrity !== null || req.body.integrity_impact !== undefined ? integrity : existing.integrity_impact,
      availability_impact: availability !== null || req.body.availability_impact !== undefined ? availability : existing.availability_impact,
      impact_rationale: req.body.impact_rationale !== undefined ? toNullableString(req.body.impact_rationale) : existing.impact_rationale,
      environment_types: environmentTypes,
      deployment_model: deploymentModel !== null || req.body.deployment_model !== undefined ? deploymentModel : existing.deployment_model,
      cloud_providers: cloudProviders,
      data_sensitivity_types: dataSensitivityTypes,
      rmf_stage: rmfStage !== null || req.body.rmf_stage !== undefined ? rmfStage : existing.rmf_stage,
      rmf_notes: req.body.rmf_notes !== undefined ? toNullableString(req.body.rmf_notes) : existing.rmf_notes,
      compliance_profile: complianceProfile,
      nist_adoption_mode: nistAdoptionMode,
      nist_notes: req.body.nist_notes !== undefined ? toNullableString(req.body.nist_notes) : existing.nist_notes,
      onboarding_completed: onboardingCompleted
    };

    if (onboardingCompletedRequested) {
      const requiredFields = [
        ['company_legal_name', nextProfile.company_legal_name],
        ['company_description', nextProfile.company_description],
        ['system_name', nextProfile.system_name],
        ['system_description', nextProfile.system_description],
        ['confidentiality_impact', nextProfile.confidentiality_impact],
        ['integrity_impact', nextProfile.integrity_impact],
        ['availability_impact', nextProfile.availability_impact]
      ];
      const missing = requiredFields.filter(([, value]) => !value).map(([name]) => name);

      if (nextProfile.environment_types.length === 0) {
        missing.push('environment_types');
      }

      const requiresInformationTypes = selectedFrameworkCodes.some((code) =>
        NIST_800_53_REQUIRED_INFORMATION_TYPE_CODES.has(code)
      );
      if (requiresInformationTypes && nextProfile.data_sensitivity_types.length === 0) {
        missing.push('data_sensitivity_types');
      }

      if (missing.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields for onboarding completion',
          missing_fields: missing
        });
      }
    }

    const onboardingCompletedAt = onboardingCompleted
      ? (existing.onboarding_completed_at || new Date().toISOString())
      : null;

    const upsertResult = await pool.query(
      `INSERT INTO organization_profiles (
         organization_id,
         company_legal_name, company_description, industry, website, headquarters_location, employee_count_range,
         system_name, system_description, authorization_boundary, operating_environment_summary,
         confidentiality_impact, integrity_impact, availability_impact, impact_rationale,
         environment_types, deployment_model, cloud_providers, data_sensitivity_types,
         rmf_stage, rmf_notes, compliance_profile, nist_adoption_mode, nist_notes,
         onboarding_completed, onboarding_completed_at, created_by, updated_by, created_at, updated_at
       )
       VALUES (
         $1, $2, $3, $4, $5, $6, $7,
         $8, $9, $10, $11,
         $12, $13, $14, $15,
         $16::text[], $17, $18::text[], $19::text[],
         $20, $21, $22, $23, $24,
         $25, $26, $27, $28, NOW(), NOW()
       )
       ON CONFLICT (organization_id) DO UPDATE SET
         company_legal_name = EXCLUDED.company_legal_name,
         company_description = EXCLUDED.company_description,
         industry = EXCLUDED.industry,
         website = EXCLUDED.website,
         headquarters_location = EXCLUDED.headquarters_location,
         employee_count_range = EXCLUDED.employee_count_range,
         system_name = EXCLUDED.system_name,
         system_description = EXCLUDED.system_description,
         authorization_boundary = EXCLUDED.authorization_boundary,
         operating_environment_summary = EXCLUDED.operating_environment_summary,
         confidentiality_impact = EXCLUDED.confidentiality_impact,
         integrity_impact = EXCLUDED.integrity_impact,
         availability_impact = EXCLUDED.availability_impact,
         impact_rationale = EXCLUDED.impact_rationale,
         environment_types = EXCLUDED.environment_types,
         deployment_model = EXCLUDED.deployment_model,
         cloud_providers = EXCLUDED.cloud_providers,
         data_sensitivity_types = EXCLUDED.data_sensitivity_types,
         rmf_stage = EXCLUDED.rmf_stage,
         rmf_notes = EXCLUDED.rmf_notes,
         compliance_profile = EXCLUDED.compliance_profile,
         nist_adoption_mode = EXCLUDED.nist_adoption_mode,
         nist_notes = EXCLUDED.nist_notes,
         onboarding_completed = EXCLUDED.onboarding_completed,
         onboarding_completed_at = EXCLUDED.onboarding_completed_at,
         updated_by = EXCLUDED.updated_by,
         updated_at = NOW()
       RETURNING *`,
      [
        orgId,
        nextProfile.company_legal_name,
        nextProfile.company_description,
        nextProfile.industry,
        nextProfile.website,
        nextProfile.headquarters_location,
        nextProfile.employee_count_range,
        nextProfile.system_name,
        nextProfile.system_description,
        nextProfile.authorization_boundary,
        nextProfile.operating_environment_summary,
        nextProfile.confidentiality_impact,
        nextProfile.integrity_impact,
        nextProfile.availability_impact,
        nextProfile.impact_rationale,
        nextProfile.environment_types,
        nextProfile.deployment_model,
        nextProfile.cloud_providers,
        nextProfile.data_sensitivity_types,
        nextProfile.rmf_stage,
        nextProfile.rmf_notes,
        nextProfile.compliance_profile,
        nextProfile.nist_adoption_mode,
        nextProfile.nist_notes,
        nextProfile.onboarding_completed,
        onboardingCompletedAt,
        existing.created_by || req.user.id,
        req.user.id
      ]
    );

    await pool.query(
      `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, details, success)
       VALUES ($1, $2, $3, $4, $5::jsonb, true)`,
      [
        orgId,
        req.user.id,
        onboardingCompletedRequested ? 'organization_onboarding_completed' : 'organization_profile_updated',
        'organization_profile',
        JSON.stringify({
          onboarding_completed: nextProfile.onboarding_completed,
          rmf_stage: nextProfile.rmf_stage,
          compliance_profile: nextProfile.compliance_profile,
          nist_adoption_mode: nextProfile.nist_adoption_mode,
          cia: {
            confidentiality: nextProfile.confidentiality_impact,
            integrity: nextProfile.integrity_impact,
            availability: nextProfile.availability_impact
          }
        })
      ]
    );

    res.json({
      success: true,
      data: {
        profile: upsertResult.rows[0]
      }
    });
  } catch (error) {
    log('error', 'organizations.profile.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update organization profile' });
  }
});

// GET /organizations/me/systems
router.get('/me/systems', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const includeInactive = toBoolean(req.query.include_inactive, false);

    const result = await pool.query(
      `SELECT os.*,
              creator.first_name || ' ' || creator.last_name AS created_by_name,
              updater.first_name || ' ' || updater.last_name AS updated_by_name
       FROM organization_systems os
       LEFT JOIN users creator ON creator.id = os.created_by
       LEFT JOIN users updater ON updater.id = os.updated_by
       WHERE os.organization_id = $1
         AND ($2::boolean = true OR os.is_active = true)
       ORDER BY os.is_primary DESC, os.system_name ASC`,
      [orgId, includeInactive]
    );

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.systems.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load systems' });
  }
});

// POST /organizations/me/systems
router.post('/me/systems', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeSystemInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    await client.query('BEGIN');

    const countResult = await client.query(
      `SELECT COUNT(*)::int AS active_count
       FROM organization_systems
       WHERE organization_id = $1 AND is_active = true`,
      [orgId]
    );
    const shouldForcePrimary = Number(countResult.rows[0]?.active_count || 0) === 0;
    const shouldBePrimary = shouldForcePrimary || payload.is_primary;

    if (shouldBePrimary) {
      await client.query(
        `UPDATE organization_systems
         SET is_primary = false, updated_at = NOW(), updated_by = $2
         WHERE organization_id = $1`,
        [orgId, req.user.id]
      );
    }

    const insertResult = await client.query(
      `INSERT INTO organization_systems (
         organization_id,
         system_name, system_code, system_description,
         authorization_boundary_override, operating_environment_summary_override,
         confidentiality_impact, integrity_impact, availability_impact, impact_rationale,
         environment_types, deployment_model, cloud_providers, data_sensitivity_types,
         is_primary, is_active, created_by, updated_by
       )
       VALUES (
         $1,
         $2, $3, $4,
         $5, $6,
         $7, $8, $9, $10,
         $11::text[], $12, $13::text[], $14::text[],
         $15, $16, $17, $18
       )
       RETURNING *`,
      [
        orgId,
        payload.system_name,
        payload.system_code,
        payload.system_description,
        payload.authorization_boundary_override,
        payload.operating_environment_summary_override,
        payload.confidentiality_impact,
        payload.integrity_impact,
        payload.availability_impact,
        payload.impact_rationale,
        payload.environment_types,
        payload.deployment_model,
        payload.cloud_providers,
        payload.data_sensitivity_types,
        shouldBePrimary,
        payload.is_active,
        req.user.id,
        req.user.id
      ]
    );

    await client.query('COMMIT');

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_created',
      resourceType: 'organization_system',
      resourceId: insertResult.rows[0].id,
      details: {
        system_name: insertResult.rows[0].system_name,
        is_primary: insertResult.rows[0].is_primary
      }
    });

    res.status(201).json({ success: true, data: insertResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create system' });
  } finally {
    client.release();
  }
});

// PUT /organizations/me/systems/:systemId
router.put('/me/systems/:systemId', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const systemId = req.params.systemId;
    const existing = await ensureSystemBelongsToOrganization(orgId, systemId);
    if (!existing) {
      return res.status(404).json({ success: false, error: 'System not found' });
    }

    const { payload, errors } = normalizeSystemInput(req.body || {}, existing);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    await client.query('BEGIN');

    if (payload.is_primary) {
      await client.query(
        `UPDATE organization_systems
         SET is_primary = false, updated_at = NOW(), updated_by = $2
         WHERE organization_id = $1 AND id <> $3`,
        [orgId, req.user.id, systemId]
      );
    }

    const updateResult = await client.query(
      `UPDATE organization_systems
       SET system_name = $3,
           system_code = $4,
           system_description = $5,
           authorization_boundary_override = $6,
           operating_environment_summary_override = $7,
           confidentiality_impact = $8,
           integrity_impact = $9,
           availability_impact = $10,
           impact_rationale = $11,
           environment_types = $12::text[],
           deployment_model = $13,
           cloud_providers = $14::text[],
           data_sensitivity_types = $15::text[],
           is_primary = $16,
           is_active = $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        systemId,
        orgId,
        payload.system_name,
        payload.system_code,
        payload.system_description,
        payload.authorization_boundary_override,
        payload.operating_environment_summary_override,
        payload.confidentiality_impact,
        payload.integrity_impact,
        payload.availability_impact,
        payload.impact_rationale,
        payload.environment_types,
        payload.deployment_model,
        payload.cloud_providers,
        payload.data_sensitivity_types,
        payload.is_primary,
        payload.is_active,
        req.user.id
      ]
    );

    const activePrimaryCountResult = await client.query(
      `SELECT COUNT(*)::int AS active_primary_count
       FROM organization_systems
       WHERE organization_id = $1
         AND is_active = true
         AND is_primary = true`,
      [orgId]
    );
    const activePrimaryCount = Number(activePrimaryCountResult.rows[0]?.active_primary_count || 0);
    if (activePrimaryCount === 0) {
      const fallbackResult = await client.query(
        `SELECT id
         FROM organization_systems
         WHERE organization_id = $1
           AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [orgId]
      );
      if (fallbackResult.rows.length > 0) {
        await client.query(
          `UPDATE organization_systems
           SET is_primary = true, updated_at = NOW(), updated_by = $2
           WHERE id = $1 AND organization_id = $3`,
          [fallbackResult.rows[0].id, req.user.id, orgId]
        );
      }
    }

    await client.query('COMMIT');

    const refreshed = await pool.query(
      `SELECT *
       FROM organization_systems
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [systemId, orgId]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_updated',
      resourceType: 'organization_system',
      resourceId: systemId,
      details: {
        system_name: refreshed.rows[0]?.system_name || payload.system_name,
        is_primary: refreshed.rows[0]?.is_primary || false
      }
    });

    res.json({ success: true, data: refreshed.rows[0] || updateResult.rows[0] });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update system' });
  } finally {
    client.release();
  }
});

// DELETE /organizations/me/systems/:systemId
router.delete('/me/systems/:systemId', requirePermission('organizations.write'), async (req, res) => {
  const client = await pool.connect();
  try {
    const orgId = req.user.organization_id;
    const systemId = req.params.systemId;

    await client.query('BEGIN');

    const existing = await client.query(
      `SELECT id, system_name, is_primary
       FROM organization_systems
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [systemId, orgId]
    );
    if (existing.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'System not found' });
    }

    await client.query(
      `DELETE FROM organization_systems
       WHERE id = $1 AND organization_id = $2`,
      [systemId, orgId]
    );

    const activePrimaryCountResult = await client.query(
      `SELECT COUNT(*)::int AS active_primary_count
       FROM organization_systems
       WHERE organization_id = $1
         AND is_active = true
         AND is_primary = true`,
      [orgId]
    );
    const activePrimaryCount = Number(activePrimaryCountResult.rows[0]?.active_primary_count || 0);
    if (activePrimaryCount === 0) {
      const fallbackResult = await client.query(
        `SELECT id
         FROM organization_systems
         WHERE organization_id = $1
           AND is_active = true
         ORDER BY updated_at DESC
         LIMIT 1`,
        [orgId]
      );
      if (fallbackResult.rows.length > 0) {
        await client.query(
          `UPDATE organization_systems
           SET is_primary = true, updated_at = NOW(), updated_by = $2
           WHERE id = $1 AND organization_id = $3`,
          [fallbackResult.rows[0].id, req.user.id, orgId]
        );
      }
    }

    await client.query('COMMIT');

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization_system_deleted',
      resourceType: 'organization_system',
      resourceId: systemId,
      details: {
        system_name: existing.rows[0].system_name,
        was_primary: existing.rows[0].is_primary
      }
    });

    res.json({ success: true, message: 'System removed' });
  } catch (error) {
    await client.query('ROLLBACK');
    log('error', 'organizations.systems.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete system' });
  } finally {
    client.release();
  }
});

// GET /organizations/me/cots-products
router.get('/me/cots-products', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { system_id: systemId, lifecycle_status: lifecycleStatus, search } = req.query;

    let query = `
      SELECT cp.*,
             os.system_name,
             owner.first_name || ' ' || owner.last_name AS owner_name
      FROM cots_products cp
      LEFT JOIN organization_systems os ON os.id = cp.system_id
      LEFT JOIN users owner ON owner.id = cp.business_owner_id
      WHERE cp.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (systemId) {
      query += ` AND cp.system_id = $${paramIndex}`;
      params.push(systemId);
      paramIndex += 1;
    }
    if (lifecycleStatus) {
      query += ` AND cp.lifecycle_status = $${paramIndex}`;
      params.push(String(lifecycleStatus).toLowerCase());
      paramIndex += 1;
    }
    if (search) {
      query += ` AND (cp.product_name ILIKE $${paramIndex} OR cp.vendor_name ILIKE $${paramIndex})`;
      params.push(`%${escapeIlike(String(search).trim())}%`);
      paramIndex += 1;
    }

    query += ` ORDER BY cp.product_name ASC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.cots.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load COTS products' });
  }
});

// POST /organizations/me/cots-products
router.post('/me/cots-products', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeCotsProductInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `INSERT INTO cots_products (
         organization_id, system_id,
         product_name, vendor_name, product_version, product_type,
         deployment_model, data_access_level, lifecycle_status, criticality,
         support_end_date, notes, created_by, updated_by
       )
       VALUES (
         $1, $2,
         $3, $4, $5, $6,
         $7, $8, $9, $10,
         $11, $12, $13, $14
       )
       RETURNING *`,
      [
        orgId,
        payload.system_id,
        payload.product_name,
        payload.vendor_name,
        payload.product_version,
        payload.product_type,
        payload.deployment_model,
        payload.data_access_level,
        payload.lifecycle_status,
        payload.criticality,
        payload.support_end_date,
        payload.notes,
        req.user.id,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_created',
      resourceType: 'cots_product',
      resourceId: result.rows[0].id,
      details: {
        product_name: result.rows[0].product_name,
        vendor_name: result.rows[0].vendor_name
      }
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.cots.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create COTS product' });
  }
});

// PUT /organizations/me/cots-products/:productId
router.put('/me/cots-products/:productId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const productId = req.params.productId;

    const existingResult = await pool.query(
      `SELECT *
       FROM cots_products
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [productId, orgId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'COTS product not found' });
    }

    const { payload, errors } = normalizeCotsProductInput(req.body || {}, existingResult.rows[0]);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `UPDATE cots_products
       SET system_id = $3,
           product_name = $4,
           vendor_name = $5,
           product_version = $6,
           product_type = $7,
           deployment_model = $8,
           data_access_level = $9,
           lifecycle_status = $10,
           criticality = $11,
           support_end_date = $12,
           notes = $13,
           updated_by = $14,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        productId,
        orgId,
        payload.system_id,
        payload.product_name,
        payload.vendor_name,
        payload.product_version,
        payload.product_type,
        payload.deployment_model,
        payload.data_access_level,
        payload.lifecycle_status,
        payload.criticality,
        payload.support_end_date,
        payload.notes,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_updated',
      resourceType: 'cots_product',
      resourceId: productId,
      details: {
        product_name: result.rows[0]?.product_name || payload.product_name
      }
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.cots.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update COTS product' });
  }
});

// DELETE /organizations/me/cots-products/:productId
router.delete('/me/cots-products/:productId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const productId = req.params.productId;

    const result = await pool.query(
      `DELETE FROM cots_products
       WHERE id = $1 AND organization_id = $2
       RETURNING id, product_name`,
      [productId, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'COTS product not found' });
    }

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'cots_product_deleted',
      resourceType: 'cots_product',
      resourceId: productId,
      details: {
        product_name: result.rows[0].product_name
      }
    });

    res.json({ success: true, message: 'COTS product removed' });
  } catch (error) {
    log('error', 'organizations.cots.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete COTS product' });
  }
});

// GET /organizations/me/contracts
router.get('/me/contracts', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { system_id: systemId, status, search } = req.query;

    let query = `
      SELECT vc.*,
             os.system_name,
             cp.product_name
      FROM vendor_contracts vc
      LEFT JOIN organization_systems os ON os.id = vc.system_id
      LEFT JOIN cots_products cp ON cp.id = vc.cots_product_id
      WHERE vc.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (systemId) {
      query += ` AND vc.system_id = $${paramIndex}`;
      params.push(systemId);
      paramIndex += 1;
    }
    if (status) {
      query += ` AND vc.status = $${paramIndex}`;
      params.push(String(status).toLowerCase());
      paramIndex += 1;
    }
    if (search) {
      query += ` AND (vc.contract_name ILIKE $${paramIndex} OR vc.vendor_name ILIKE $${paramIndex} OR COALESCE(vc.contract_number, '') ILIKE $${paramIndex})`;
      params.push(`%${escapeIlike(String(search).trim())}%`);
      paramIndex += 1;
    }

    query += ` ORDER BY vc.contract_name ASC`;

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.contracts.read_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load contracts' });
  }
});

// POST /organizations/me/contracts
router.post('/me/contracts', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const { payload, errors } = normalizeContractInput(req.body || {});
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }
    if (payload.cots_product_id) {
      const productResult = await pool.query(
        `SELECT id
         FROM cots_products
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [payload.cots_product_id, orgId]
      );
      if (productResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'cots_product_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `INSERT INTO vendor_contracts (
         organization_id, system_id, cots_product_id,
         contract_name, vendor_name, contract_number,
         contract_type, status, start_date, end_date, renewal_date,
         notice_period_days, security_requirements, data_processing_terms, sla_summary, notes,
         created_by, updated_by
       )
       VALUES (
         $1, $2, $3,
         $4, $5, $6,
         $7, $8, $9, $10, $11,
         $12, $13, $14, $15, $16,
         $17, $18
       )
       RETURNING *`,
      [
        orgId,
        payload.system_id,
        payload.cots_product_id,
        payload.contract_name,
        payload.vendor_name,
        payload.contract_number,
        payload.contract_type,
        payload.status,
        payload.start_date,
        payload.end_date,
        payload.renewal_date,
        payload.notice_period_days,
        payload.security_requirements,
        payload.data_processing_terms,
        payload.sla_summary,
        payload.notes,
        req.user.id,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_created',
      resourceType: 'vendor_contract',
      resourceId: result.rows[0].id,
      details: {
        contract_name: result.rows[0].contract_name,
        vendor_name: result.rows[0].vendor_name
      }
    });

    res.status(201).json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.contracts.create_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to create contract' });
  }
});

// PUT /organizations/me/contracts/:contractId
router.put('/me/contracts/:contractId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const contractId = req.params.contractId;

    const existingResult = await pool.query(
      `SELECT *
       FROM vendor_contracts
       WHERE id = $1 AND organization_id = $2
       LIMIT 1`,
      [contractId, orgId]
    );
    if (existingResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    const { payload, errors } = normalizeContractInput(req.body || {}, existingResult.rows[0]);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, error: errors[0], details: errors });
    }

    if (payload.system_id) {
      const system = await ensureSystemBelongsToOrganization(orgId, payload.system_id);
      if (!system) {
        return res.status(400).json({ success: false, error: 'system_id is invalid for this organization' });
      }
    }
    if (payload.cots_product_id) {
      const productResult = await pool.query(
        `SELECT id
         FROM cots_products
         WHERE id = $1 AND organization_id = $2
         LIMIT 1`,
        [payload.cots_product_id, orgId]
      );
      if (productResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'cots_product_id is invalid for this organization' });
      }
    }

    const result = await pool.query(
      `UPDATE vendor_contracts
       SET system_id = $3,
           cots_product_id = $4,
           contract_name = $5,
           vendor_name = $6,
           contract_number = $7,
           contract_type = $8,
           status = $9,
           start_date = $10,
           end_date = $11,
           renewal_date = $12,
           notice_period_days = $13,
           security_requirements = $14,
           data_processing_terms = $15,
           sla_summary = $16,
           notes = $17,
           updated_by = $18,
           updated_at = NOW()
       WHERE id = $1 AND organization_id = $2
       RETURNING *`,
      [
        contractId,
        orgId,
        payload.system_id,
        payload.cots_product_id,
        payload.contract_name,
        payload.vendor_name,
        payload.contract_number,
        payload.contract_type,
        payload.status,
        payload.start_date,
        payload.end_date,
        payload.renewal_date,
        payload.notice_period_days,
        payload.security_requirements,
        payload.data_processing_terms,
        payload.sla_summary,
        payload.notes,
        req.user.id
      ]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_updated',
      resourceType: 'vendor_contract',
      resourceId: contractId,
      details: {
        contract_name: result.rows[0]?.contract_name || payload.contract_name
      }
    });

    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    log('error', 'organizations.contracts.update_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to update contract' });
  }
});

// DELETE /organizations/me/contracts/:contractId
router.delete('/me/contracts/:contractId', requirePermission('organizations.write'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;
    const contractId = req.params.contractId;

    const result = await pool.query(
      `DELETE FROM vendor_contracts
       WHERE id = $1 AND organization_id = $2
       RETURNING id, contract_name`,
      [contractId, orgId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Contract not found' });
    }

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'vendor_contract_deleted',
      resourceType: 'vendor_contract',
      resourceId: contractId,
      details: {
        contract_name: result.rows[0].contract_name
      }
    });

    res.json({ success: true, message: 'Contract removed' });
  } catch (error) {
    log('error', 'organizations.contracts.delete_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to delete contract' });
  }
});

// GET /organizations/:orgId/frameworks
router.get('/:orgId/frameworks', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;

    const result = await pool.query(`
      SELECT f.id, f.name, f.code, f.version, f.description, f.category, f.tier_required,
             of2.created_at as added_at,
             COUNT(fc.id) as control_count
      FROM organization_frameworks of2
      JOIN frameworks f ON f.id = of2.framework_id
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      WHERE of2.organization_id = $1
      GROUP BY f.id, of2.created_at
      ORDER BY f.name
    `, [orgId]);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    log('error', 'organizations.frameworks.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load organization frameworks' });
  }
});

// POST /organizations/:orgId/frameworks
router.post('/:orgId/frameworks', requirePermission('frameworks.manage'), validateBody((body) => {
  const errors = [];
  if (!Array.isArray(body.frameworkIds)) {
    errors.push('frameworkIds array is required');
  } else if (body.frameworkIds.some((id) => typeof id !== 'string' || !isUuid(id))) {
    errors.push('frameworkIds must contain valid UUID values');
  }
  if (body.propagateEvidence !== undefined && typeof body.propagateEvidence !== 'boolean') {
    errors.push('propagateEvidence must be a boolean when provided');
  }
  return errors;
}), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkIds, propagateEvidence } = req.body;
    const desiredFrameworkIds = Array.from(
      new Set((frameworkIds || []).filter((id) => typeof id === 'string' && id.trim().length > 0))
    );

    const evidencePropagationConfig = await getConfigValue(orgId, 'crosswalk', 'auto_propagate_evidence_exact', { value: false });
    const shouldPropagateEvidence = typeof propagateEvidence === 'boolean'
      ? propagateEvidence
      : Boolean(
        evidencePropagationConfig && typeof evidencePropagationConfig === 'object'
          ? evidencePropagationConfig.value
          : evidencePropagationConfig
      );

    // Tier-based framework limits (grouped frameworks count as 1)
    const tier = normalizeTier(req.user.organization_tier);
    const maxFrameworks = getFrameworkLimit(tier);

    if (maxFrameworks !== -1 && desiredFrameworkIds.length > 0) {
      // Count effective frameworks: each framework_group counts as 1, ungrouped count individually
      const groupCountResult = await pool.query(
        `SELECT COUNT(*) AS effective_count FROM (
          SELECT COALESCE(framework_group, id::text) AS group_key
          FROM frameworks
          WHERE id::text = ANY($1::text[]) AND is_active = true
          GROUP BY group_key
        ) grouped`,
        [desiredFrameworkIds]
      );
      const effectiveCount = parseInt(groupCountResult.rows[0]?.effective_count || '0', 10);

      if (effectiveCount > maxFrameworks) {
        return res.status(403).json({
          success: false,
          error: `Framework limit reached`,
          message: `Your ${tier} tier allows up to ${maxFrameworks} framework selections. You selected ${effectiveCount} (bundled ISO standards count as 1). Please upgrade to select more.`,
          currentTier: tier,
          maxFrameworks,
          requestedCount: effectiveCount,
          upgradeRequired: true
        });
      }
    }

    if (desiredFrameworkIds.length > 0) {
      const availableFrameworks = await pool.query(
        `SELECT id::text AS id
         FROM frameworks
         WHERE id::text = ANY($1::text[]) AND is_active = true`,
        [desiredFrameworkIds]
      );

      if (availableFrameworks.rows.length !== desiredFrameworkIds.length) {
        return res.status(400).json({
          success: false,
          error: 'One or more framework IDs are invalid or inactive'
        });
      }
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const existingFrameworks = await client.query(
        `SELECT framework_id::text AS framework_id
         FROM organization_frameworks
         WHERE organization_id = $1`,
        [orgId]
      );
      const existingFrameworkIds = existingFrameworks.rows.map((row) => row.framework_id);
      const existingSet = new Set(existingFrameworkIds);
      const desiredSet = new Set(desiredFrameworkIds);
      const addedFrameworkIds = desiredFrameworkIds.filter((id) => !existingSet.has(id));
      const removedFrameworkIds = existingFrameworkIds.filter((id) => !desiredSet.has(id));

      if (desiredFrameworkIds.length === 0) {
        await client.query(
          'DELETE FROM organization_frameworks WHERE organization_id = $1',
          [orgId]
        );
      } else {
        await client.query(
          `DELETE FROM organization_frameworks
           WHERE organization_id = $1
             AND NOT (framework_id::text = ANY($2::text[]))`,
          [orgId, desiredFrameworkIds]
        );

        for (const fwId of desiredFrameworkIds) {
          await client.query(
            'INSERT INTO organization_frameworks (organization_id, framework_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [orgId, fwId]
          );
        }
      }

      const { rehydratedCount, propagatedEvidenceLinks } = await rehydrateImplementationsForFrameworkSelection({
        client,
        organizationId: orgId,
        userId: req.user.id,
        addedFrameworkIds,
        propagateEvidence: shouldPropagateEvidence
      });

      await client.query('COMMIT');

      await logOrganizationEvent({
        organizationId: orgId,
        userId: req.user.id,
        eventType: 'organization.frameworks.updated',
        resourceType: 'organization',
        resourceId: orgId,
        details: {
          added_framework_ids: addedFrameworkIds,
          removed_framework_ids: removedFrameworkIds,
          rehydrated_controls: rehydratedCount,
          propagated_evidence_links: propagatedEvidenceLinks,
          history_preserved: true,
          strict_crosswalk_only: true
        }
      });

      // Return updated list
      const result = await client.query(`
        SELECT f.id, f.name, f.code, f.version, f.description,
               COUNT(fc.id) as control_count
        FROM organization_frameworks of2
        JOIN frameworks f ON f.id = of2.framework_id
        LEFT JOIN framework_controls fc ON fc.framework_id = f.id
        WHERE of2.organization_id = $1
        GROUP BY f.id
        ORDER BY f.name
      `, [orgId]);

      res.json({
        success: true,
        data: result.rows,
        metadata: {
          rehydrated_controls: rehydratedCount,
          propagated_evidence_links: propagatedEvidenceLinks,
          strict_crosswalk_only: true,
          history_preserved: true
        }
      });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (error) {
    log('error', 'organizations.frameworks.add_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to add frameworks' });
  }
});

// DELETE /organizations/:orgId/frameworks/:frameworkId
router.delete('/:orgId/frameworks/:frameworkId', requirePermission('frameworks.manage'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkId } = req.params;

    await pool.query(
      'DELETE FROM organization_frameworks WHERE organization_id = $1 AND framework_id = $2',
      [orgId, frameworkId]
    );

    await logOrganizationEvent({
      organizationId: orgId,
      userId: req.user.id,
      eventType: 'organization.framework.removed',
      resourceType: 'organization',
      resourceId: orgId,
      details: {
        removed_framework_id: frameworkId,
        history_preserved: true
      }
    });

    res.json({
      success: true,
      message: 'Framework removed',
      metadata: {
        history_preserved: true
      }
    });
  } catch (error) {
    log('error', 'organizations.frameworks.remove_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to remove framework' });
  }
});

// GET /organizations/:orgId/controls
router.get('/:orgId/controls', requirePermission('organizations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;
    const { frameworkId, status } = req.query;

    let query = `
      SELECT fc.id, fc.control_id,
             COALESCE(occ.title, fc.title) as title,
             COALESCE(occ.description, fc.description) as description,
             fc.control_type, fc.priority,
             f.name as framework_name, f.code as framework_code,
             COALESCE(ci.status, 'not_started') as status,
             ci.assigned_to, ci.notes,
             u.first_name || ' ' || u.last_name as assigned_to_name
      FROM organization_frameworks of2
      JOIN framework_controls fc ON fc.framework_id = of2.framework_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $1
       AND occ.framework_control_id = fc.id
      LEFT JOIN control_implementations ci ON ci.control_id = fc.id AND ci.organization_id = $1
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE of2.organization_id = $1
    `;
    const params = [orgId];
    let paramIndex = 2;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex}`;
      params.push(frameworkId);
      paramIndex++;
    }

    if (status) {
      if (status === 'not_started') {
        query += ` AND (ci.status IS NULL OR ci.status = 'not_started')`;
      } else {
        query += ` AND ci.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    query += ' ORDER BY f.name, fc.control_id';

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows, controls: result.rows });
  } catch (error) {
    log('error', 'organizations.controls.failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to load controls' });
  }
});

function normalizeHeaderKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s\-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_');
}

const CONTROL_ANSWER_IMPORT_HEADER_ALIASES = (() => {
  const aliases = {
    framework_control_id: [
      'framework_control_id',
      'framework_control_uuid',
      'framework_controlid',
      'framework_control',
      'control_uuid',
      'control_id_uuid',
      'framework_control_guid'
    ],
    framework_code: ['framework_code', 'framework', 'frameworkcode', 'framework_id', 'framework_key'],
    control_id: ['control_id', 'control', 'control_code', 'controlcode', 'control_number', 'control_identifier'],
    status: ['status', 'implementation_status', 'control_status'],
    implementation_notes: [
      'implementation_notes',
      'implementation_details',
      'implementation_detail',
      'implementation',
      'implementation_notesdetails'
    ],
    evidence_location: ['evidence_location', 'evidence', 'evidence_url', 'evidence_link', 'evidence_location_url'],
    notes: ['notes', 'note', 'comments', 'comment'],
    assigned_to_email: [
      'assigned_to_email',
      'assignee_email',
      'assigned_email',
      'owner_email',
      'assigned_to',
      'assignee'
    ],
    assigned_to_id: ['assigned_to_id', 'assignee_id', 'assigned_user_id', 'owner_id'],
    due_date: ['due_date', 'implementation_date', 'target_date', 'deadline', 'due']
  };

  const aliasToKey = new Map();
  Object.entries(aliases).forEach(([key, list]) => {
    list.forEach((entry) => {
      aliasToKey.set(normalizeHeaderKey(entry), key);
    });
    aliasToKey.set(normalizeHeaderKey(key), key);
  });

  return aliasToKey;
})();

function buildImportHeaderMap(worksheet) {
  const headerRow = worksheet.getRow(1);
  const headerMap = {};
  const present = new Set();

  for (let col = 1; col <= headerRow.cellCount; col++) {
    const rawHeader = String(headerRow.getCell(col)?.text || '').trim();
    if (!rawHeader) continue;

    const normalized = normalizeHeaderKey(rawHeader);
    const key = CONTROL_ANSWER_IMPORT_HEADER_ALIASES.get(normalized);
    if (!key) continue;
    if (headerMap[key]) continue;
    headerMap[key] = col;
    present.add(key);
  }

  return { headerMap, present };
}

function normalizeImplementationStatus(rawValue) {
  const normalized = String(rawValue || '').trim().toLowerCase();
  if (!normalized) return null;

  const mapping = new Map([
    ['not started', 'not_started'],
    ['not_started', 'not_started'],
    ['notstarted', 'not_started'],
    ['todo', 'not_started'],
    ['in progress', 'in_progress'],
    ['in_progress', 'in_progress'],
    ['inprogress', 'in_progress'],
    ['started', 'in_progress'],
    ['implemented', 'implemented'],
    ['complete', 'implemented'],
    ['completed', 'implemented'],
    ['done', 'implemented'],
    ['needs review', 'needs_review'],
    ['needs_review', 'needs_review'],
    ['review', 'needs_review'],
    ['auto-crosswalked', 'satisfied_via_crosswalk'],
    ['auto_crosswalked', 'satisfied_via_crosswalk'],
    ['satisfied via crosswalk', 'satisfied_via_crosswalk'],
    ['satisfied_via_crosswalk', 'satisfied_via_crosswalk'],
    ['crosswalked', 'satisfied_via_crosswalk'],
    ['verified', 'verified'],
    ['not applicable', 'not_applicable'],
    ['not_applicable', 'not_applicable'],
    ['n/a', 'not_applicable'],
    ['na', 'not_applicable']
  ]);

  const value = mapping.get(normalized) || normalized;
  return VALID_CONTROL_IMPLEMENTATION_STATUSES.has(value) ? value : null;
}

function parseDateCellToISO(cell) {
  if (!cell) return null;
  const value = cell.value;

  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }

  const rawText = String(cell.text || '').trim();
  if (!rawText) return null;

  // ISO date
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawText)) {
    return rawText;
  }

  // US date (MM/DD/YYYY)
  const usMatch = rawText.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (usMatch) {
    const mm = usMatch[1].padStart(2, '0');
    const dd = usMatch[2].padStart(2, '0');
    const yyyy = usMatch[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(rawText);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  if (/[\",\\r\\n]/.test(text) || /^\s|\s$/.test(text)) {
    return `"${text.replace(/\"/g, '""')}"`;
  }
  return text;
}

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function safeJsonParse(raw, fallback = null) {
  if (!nonEmptyString(raw)) return fallback;
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function extractFirstJsonObject(text) {
  const source = String(text || '');
  const start = source.indexOf('{');
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escapeNext = false;
  for (let i = start; i < source.length; i++) {
    const ch = source[i];
    if (inString) {
      if (escapeNext) {
        escapeNext = false;
      } else if (ch === '\\') {
        escapeNext = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) {
        return source.slice(start, i + 1);
      }
    }
  }

  return null;
}

function normalizeFrameworkToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

async function getOrgDefaultLlmConfig(organizationId) {
  const result = await pool.query(
    `SELECT setting_key, setting_value
     FROM organization_settings
     WHERE organization_id = $1 AND setting_key IN ('default_model')`,
    [organizationId]
  );

  const values = {};
  result.rows.forEach((row) => {
    values[row.setting_key] = row.setting_value;
  });

  const provider = await llm.getOrgDefaultProvider(organizationId);

  return {
    provider,
    model: nonEmptyString(values.default_model) ? String(values.default_model) : null
  };
}

async function enforceImportAiLimit({ organizationId, organizationTier, provider }) {
  const tier = normalizeTier(organizationTier);
  const limit = llm.getUsageLimit(tier);
  const enforceByokLimits = shouldEnforceAiLimitForByok(tier);

  if (!enforceByokLimits) {
    const resolvedKey = await llm.resolveApiKey(provider, organizationId);
    if (resolvedKey.source === 'organization' || resolvedKey.source === 'platform') {
      return { bypassed: true, tier, limit: 'unlimited', remaining: 'unlimited' };
    }
  }

  if (limit === -1) {
    return { bypassed: false, tier, limit: 'unlimited', remaining: 'unlimited' };
  }

  const used = await llm.getUsageCount(organizationId);
  if (used >= limit) {
    const err = new Error(`AI usage limit reached for ${tier} tier (${used}/${limit})`);
    err.status = 429;
    err.payload = {
      upgradeRequired: true,
      currentTier: tier,
      used,
      limit
    };
    throw err;
  }

  return {
    bypassed: false,
    tier,
    limit,
    remaining: Math.max(0, limit - used)
  };
}

function collectHeaderExamples(worksheet, headerCells, opts = {}) {
  const maxSampleRows = Number.isFinite(opts.maxSampleRows) ? opts.maxSampleRows : 10;
  const maxExamplesPerHeader = Number.isFinite(opts.maxExamplesPerHeader) ? opts.maxExamplesPerHeader : 3;
  const maxChars = Number.isFinite(opts.maxChars) ? opts.maxChars : 96;

  const examples = {};
  headerCells.forEach(({ header }) => {
    examples[header] = [];
  });

  const rowLimit = Math.min(worksheet.rowCount || 0, 1 + maxSampleRows);
  for (let rowNumber = 2; rowNumber <= rowLimit; rowNumber++) {
    const row = worksheet.getRow(rowNumber);
    if (!row || !row.hasValues) continue;

    headerCells.forEach(({ col, header }) => {
      const list = examples[header];
      if (!Array.isArray(list) || list.length >= maxExamplesPerHeader) return;

      const raw = String(row.getCell(col)?.text || '').trim();
      if (!raw) return;

      const clipped = raw.length > maxChars ? `${raw.slice(0, maxChars)}…` : raw;
      if (!list.includes(clipped)) {
        list.push(clipped);
      }
    });
  }

  return examples;
}

function scoreHeaderForImportAi(header) {
  const normalized = normalizeHeaderKey(header);
  let score = 0;
  const weighted = [
    ['framework', 8],
    ['control', 8],
    ['uuid', 6],
    ['guid', 6],
    ['id', 5],
    ['code', 5],
    ['status', 7],
    ['implementation', 7],
    ['evidence', 7],
    ['url', 4],
    ['link', 4],
    ['note', 4],
    ['comment', 4],
    ['assign', 4],
    ['assignee', 4],
    ['owner', 3],
    ['due', 3],
    ['deadline', 3],
    ['date', 3]
  ];

  weighted.forEach(([token, weight]) => {
    if (normalized.includes(token)) score += weight;
  });

  if (normalized.length <= 2) score -= 2;
  if (normalized.length <= 4) score -= 1;
  return score;
}

function selectHeaderCellsForImportAi(headerCells, maxHeaders = 160) {
  if (!Array.isArray(headerCells) || headerCells.length <= maxHeaders) return headerCells;

  const scored = headerCells
    .map((entry, idx) => ({
      ...entry,
      _idx: idx,
      _score: scoreHeaderForImportAi(entry.header)
    }))
    .sort((a, b) => {
      if (b._score !== a._score) return b._score - a._score;
      return a._idx - b._idx;
    })
    .slice(0, maxHeaders);

  return scored
    .sort((a, b) => a._idx - b._idx)
    .map(({ _idx, _score, ...rest }) => rest);
}

async function inferControlAnswerImportHeaderMapWithAI({
  organizationId,
  provider,
  model,
  headers,
  examples
}) {
  const headerPayload = headers.map((header) => ({
    header,
    examples: Array.isArray(examples?.[header]) ? examples[header].slice(0, 3) : []
  }));

  const aiRaw = await llm.chat({
    organizationId,
    provider,
    model,
    maxTokens: 900,
    systemPrompt: [
      'You map spreadsheet columns to a canonical schema for importing control implementation answers into a GRC platform.',
      'Return JSON only (no markdown, no code fences, no prose outside JSON).',
      'Use exact header names from the provided list. If a field is missing, set it to null.',
      'Prefer stable identifiers: framework_control_id (UUID) if present, otherwise framework + control identifier.'
    ].join(' '),
    messages: [{
      role: 'user',
      content: `Map spreadsheet columns to this required JSON shape:
{
  "mapping": {
    "framework_control_id": string|null,
    "framework_code": string|null,
    "control_id": string|null,
    "status": string|null,
    "implementation_notes": string|null,
    "evidence_location": string|null,
    "notes": string|null,
    "assigned_to_email": string|null,
    "assigned_to_id": string|null,
    "due_date": string|null
  },
  "confidence": {
    "framework_control_id": number,
    "framework_code": number,
    "control_id": number,
    "status": number,
    "implementation_notes": number,
    "evidence_location": number,
    "notes": number,
    "assigned_to_email": number,
    "assigned_to_id": number,
    "due_date": number
  }
}

Constraints:
- Use only header values that appear in the list below.
- Output a single JSON object only.
- Do not invent headers.

Headers with examples:
${JSON.stringify(headerPayload, null, 2)}`
    }]
  });

  const candidateJson = extractFirstJsonObject(aiRaw) || aiRaw;
  const parsed = safeJsonParse(candidateJson, null);
  if (!parsed) {
    const err = new Error('AI column mapping returned invalid JSON.');
    err.ai_raw = aiRaw;
    throw err;
  }

  const mapping = parsed.mapping && typeof parsed.mapping === 'object' ? parsed.mapping : parsed;
  return { mapping, raw: aiRaw, parsed };
}

// GET /organizations/:orgId/controls/export
router.get('/:orgId/controls/export', requirePermission('implementations.read'), async (req, res) => {
  try {
    const orgId = verifyOrgAccess(req, res);
    if (!orgId) return;

    const format = String(req.query.format || 'xlsx').trim().toLowerCase();
    if (!['xlsx', 'csv'].includes(format)) {
      return res.status(400).json({ success: false, error: "format must be one of: xlsx, csv" });
    }

    const { frameworkId, status } = req.query;

    let query = `
      SELECT
        fc.id as framework_control_id,
        f.name as framework_name,
        f.code as framework_code,
        fc.control_id,
        COALESCE(occ.title, fc.title) as title,
        COALESCE(occ.description, fc.description) as description,
        fc.control_type,
        fc.priority,
        COALESCE(ci.status, 'not_started') as status,
        ci.implementation_notes,
        ci.evidence_location,
        ci.notes,
        ci.implementation_date as due_date,
        u.email as assigned_to_email,
        NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), '') as assigned_to_name
      FROM organization_frameworks of2
      JOIN framework_controls fc ON fc.framework_id = of2.framework_id
      JOIN frameworks f ON f.id = fc.framework_id
      LEFT JOIN organization_control_content_overrides occ
        ON occ.organization_id = $1
       AND occ.framework_control_id = fc.id
      LEFT JOIN control_implementations ci
        ON ci.control_id = fc.id
       AND ci.organization_id = $1
      LEFT JOIN users u ON u.id = ci.assigned_to
      WHERE of2.organization_id = $1
    `;

    const params = [orgId];
    let paramIndex = 2;

    if (frameworkId) {
      query += ` AND f.id = $${paramIndex}`;
      params.push(frameworkId);
      paramIndex++;
    }

    if (status) {
      if (status === 'not_started') {
        query += ` AND (ci.status IS NULL OR ci.status = 'not_started')`;
      } else {
        query += ` AND ci.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    query += ' ORDER BY f.name, fc.control_id';

    const result = await pool.query(query, params);
    const rows = result.rows || [];

    const exportColumns = [
      'framework_control_id',
      'framework_code',
      'framework_name',
      'control_id',
      'title',
      'description',
      'control_type',
      'priority',
      'status',
      'implementation_notes',
      'evidence_location',
      'notes',
      'assigned_to_email',
      'assigned_to_name',
      'due_date'
    ];

    const stamp = new Date().toISOString().slice(0, 10);
    const filename = `controlweave-control-answers-${orgId}-${stamp}.${format}`;

    res.setHeader('Content-Disposition', `attachment; filename=\"${filename}\"`);
    res.setHeader('Cache-Control', 'no-store');

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      const lines = [];
      lines.push(exportColumns.join(','));
      rows.forEach((row) => {
        const values = exportColumns.map((key) => csvEscape(row[key]));
        lines.push(values.join(','));
      });
      // Include UTF-8 BOM so Excel opens it cleanly.
      const csvText = `\uFEFF${lines.join('\r\n')}\r\n`;
      return res.status(200).send(csvText);
    }

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Control Answers');

    sheet.columns = exportColumns.map((key) => ({
      header: key,
      key,
      width: key === 'description' || key === 'implementation_notes' || key === 'notes' ? 50 : 24
    }));

    rows.forEach((row) => {
      sheet.addRow({
        ...row,
        due_date: row.due_date ? String(row.due_date).slice(0, 10) : null
      });
    });

    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: 'frozen', ySplit: 1 }];

    const buffer = await workbook.xlsx.writeBuffer();
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    log('error', 'organizations.controls.export_failed', { error: error.message });
    res.status(500).json({ success: false, error: 'Failed to export controls' });
  }
});

// POST /organizations/:orgId/controls/import?mode=merge|replace
router.post(
  '/:orgId/controls/import',
  requirePermission('implementations.write'),
  controlsImportUpload.single('file'),
  async (req, res) => {
    try {
      const orgId = verifyOrgAccess(req, res);
      if (!orgId) return;

      const mode = String(req.query.mode || 'merge').trim().toLowerCase();
      if (!['merge', 'replace'].includes(mode)) {
        return res.status(400).json({ success: false, error: "mode must be one of: merge, replace" });
      }

      const file = req.file;
      if (!file) {
        return res.status(400).json({ success: false, error: "No file uploaded. Expected multipart/form-data with field 'file'." });
      }

      const ext = path.extname(file.originalname || '').toLowerCase();
      if (!['.xlsx', '.csv'].includes(ext)) {
        return res.status(400).json({ success: false, error: 'Unsupported file type. Please upload .xlsx or .csv.' });
      }

      const workbook = new ExcelJS.Workbook();
      if (ext === '.xlsx') {
        await workbook.xlsx.load(file.buffer);
      } else {
        const csvText = file.buffer.toString('utf8').replace(/^\uFEFF/, '');
        await workbook.csv.read(Readable.from([csvText]));
      }

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        return res.status(400).json({ success: false, error: 'No worksheet found in uploaded file.' });
      }

      const headerRow = worksheet.getRow(1);
      const headerCells = [];
      for (let col = 1; col <= headerRow.cellCount; col++) {
        const header = String(headerRow.getCell(col)?.text || '').trim();
        if (!header) continue;
        headerCells.push({ col, header });
      }

      const colByNormalizedHeader = new Map(
        headerCells.map((entry) => [normalizeHeaderKey(entry.header), entry.col])
      );

      const { headerMap, present } = buildImportHeaderMap(worksheet);
      const aiColumnMapping = {
        attempted: false,
        used: false,
        provider: null,
        model: null,
        mapping: null,
        note: null,
        error: null
      };

      const aiEnabled = String(req.query.ai ?? '1').trim() !== '0';
      const hasAiPermission = Array.isArray(req.user?.permissions)
        ? (req.user.permissions.includes('*') || req.user.permissions.includes('ai.use'))
        : req.user?.role === 'admin';

      const canonicalFields = [
        'framework_control_id',
        'framework_code',
        'control_id',
        'status',
        'implementation_notes',
        'evidence_location',
        'notes',
        'assigned_to_email',
        'assigned_to_id',
        'due_date'
      ];

      const missingFields = canonicalFields.filter((field) => !headerMap[field]);
      if (aiEnabled && hasAiPermission && missingFields.length > 0 && headerCells.length > 0) {
        aiColumnMapping.attempted = true;
        try {
          const defaults = await getOrgDefaultLlmConfig(orgId);
          const provider = ['claude', 'openai', 'gemini', 'grok', 'groq', 'ollama'].includes(String(req.query.provider || ''))
            ? String(req.query.provider)
            : defaults.provider;
          const model = nonEmptyString(req.query.model) ? String(req.query.model) : defaults.model;

          aiColumnMapping.provider = provider;
          aiColumnMapping.model = model;

          await enforceImportAiLimit({
            organizationId: orgId,
            organizationTier: req.user.organization_tier,
            provider
          });

          const aiHeaderCells = selectHeaderCellsForImportAi(headerCells);
          if (aiHeaderCells.length !== headerCells.length) {
            aiColumnMapping.note = `AI column mapping inspected ${aiHeaderCells.length}/${headerCells.length} headers due to size limits.`;
          }

          const examples = collectHeaderExamples(worksheet, aiHeaderCells, {
            maxSampleRows: 12,
            maxExamplesPerHeader: 3,
            maxChars: 90
          });

          const aiResult = await inferControlAnswerImportHeaderMapWithAI({
            organizationId: orgId,
            provider,
            model,
            headers: aiHeaderCells.map((entry) => entry.header),
            examples
          });

          const mapping = aiResult?.mapping && typeof aiResult.mapping === 'object' ? aiResult.mapping : null;
          if (mapping) {
            aiColumnMapping.mapping = mapping;

            canonicalFields.forEach((field) => {
              if (headerMap[field]) return;
              const proposedHeader = mapping[field];
              if (!nonEmptyString(proposedHeader)) return;

              const normalizedProposed = normalizeHeaderKey(proposedHeader);
              const col = colByNormalizedHeader.get(normalizedProposed) || null;
              if (!col) return;

              headerMap[field] = col;
              present.add(field);
              aiColumnMapping.used = true;
            });
          }

          await llm.logAIUsage(orgId, req.user.id, 'control_answer_import_column_mapping', provider, model).catch(() => {});
        } catch (err) {
          aiColumnMapping.error = err?.message || String(err);
        }
      }

      const hasFrameworkControlIdColumn = Boolean(headerMap.framework_control_id);
      const hasControlIdColumn = Boolean(headerMap.control_id);
      if (!hasFrameworkControlIdColumn && !hasControlIdColumn) {
        return res.status(400).json({
          success: false,
          error: 'Missing control identifiers. Provide framework_control_id (UUID) OR control_id (control code) column.',
          ai_column_mapping: aiColumnMapping,
          headers_seen: headerCells.map((entry) => entry.header)
        });
      }

      const controlResult = await pool.query(
        `SELECT
           fc.id as framework_control_id,
           LOWER(f.code) as framework_code,
           fc.control_id
         FROM organization_frameworks of2
         JOIN framework_controls fc ON fc.framework_id = of2.framework_id
         JOIN frameworks f ON f.id = fc.framework_id
         WHERE of2.organization_id = $1`,
        [orgId]
      );

      const controlIdByFrameworkControlId = new Map();
      const controlIdByComposite = new Map();
      controlResult.rows.forEach((row) => {
        const fcId = String(row.framework_control_id);
        const code = String(row.framework_code || '').trim().toLowerCase();
        const controlCode = String(row.control_id || '').trim();
        if (fcId) {
          controlIdByFrameworkControlId.set(fcId, fcId);
        }
        if (code && controlCode) {
          controlIdByComposite.set(`${code}::${controlCode.toLowerCase()}`, fcId);
        }
      });

      const orgFrameworkResult = await pool.query(
        `SELECT LOWER(f.code) as framework_code, f.name as framework_name
         FROM organization_frameworks of2
         JOIN frameworks f ON f.id = of2.framework_id
         WHERE of2.organization_id = $1`,
        [orgId]
      );
      const frameworkCodeByToken = new Map();
      orgFrameworkResult.rows.forEach((row) => {
        const code = String(row.framework_code || '').trim().toLowerCase();
        const name = String(row.framework_name || '').trim();
        if (code) frameworkCodeByToken.set(normalizeFrameworkToken(code), code);
        if (name) frameworkCodeByToken.set(normalizeFrameworkToken(name), code);
      });
      const defaultFrameworkCode = orgFrameworkResult.rows.length === 1
        ? String(orgFrameworkResult.rows[0].framework_code || '').trim().toLowerCase()
        : null;

      const existingResult = await pool.query(
        `SELECT control_id FROM control_implementations WHERE organization_id = $1`,
        [orgId]
      );
      const hasExistingImplementation = new Set(existingResult.rows.map((row) => String(row.control_id)));

      const userResult = await pool.query(
        `SELECT id, LOWER(email) as email
         FROM users
         WHERE organization_id = $1 AND is_active = true`,
        [orgId]
      );
      const userIdByEmail = new Map(userResult.rows.map((row) => [String(row.email || ''), String(row.id)]));
      const userIds = new Set(userResult.rows.map((row) => String(row.id)));

      const summary = {
        import_mode: mode,
        filename: file.originalname,
        total_rows: 0,
        processed_rows: 0,
        inserted: 0,
        updated: 0,
        skipped: 0,
        ai_column_mapping: aiColumnMapping,
        warnings: [],
        errors: []
      };

      const fileProvidesField = (field) => present.has(field);
      const maxRows = 20000;
      const rowLimit = Math.min(worksheet.rowCount || 0, maxRows);

      const upsertSql = `
        INSERT INTO control_implementations
          (control_id, organization_id, status, implementation_notes, evidence_location, assigned_to, notes, implementation_date)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (control_id, organization_id) DO UPDATE SET
          status = CASE WHEN $9 THEN EXCLUDED.status ELSE control_implementations.status END,
          implementation_notes = CASE WHEN $10 THEN EXCLUDED.implementation_notes ELSE control_implementations.implementation_notes END,
          evidence_location = CASE WHEN $11 THEN EXCLUDED.evidence_location ELSE control_implementations.evidence_location END,
          assigned_to = CASE WHEN $12 THEN EXCLUDED.assigned_to ELSE control_implementations.assigned_to END,
          notes = CASE WHEN $13 THEN EXCLUDED.notes ELSE control_implementations.notes END,
          implementation_date = CASE WHEN $14 THEN EXCLUDED.implementation_date ELSE control_implementations.implementation_date END
        RETURNING (xmax = 0) AS inserted
      `;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (let rowNumber = 2; rowNumber <= rowLimit; rowNumber++) {
          const row = worksheet.getRow(rowNumber);
          if (!row || !row.hasValues) continue;

          const getCellText = (field) => {
            const col = headerMap[field];
            if (!col) return '';
            return String(row.getCell(col)?.text || '').trim();
          };

          const getCell = (field) => {
            const col = headerMap[field];
            if (!col) return null;
            return row.getCell(col);
          };

          const rawFrameworkControlId = getCellText('framework_control_id');
          const rawFrameworkIdentifier = getCellText('framework_code');
          const rawControlCode = getCellText('control_id');

          // Skip completely empty identifier rows.
          if (!rawFrameworkControlId && !rawControlCode) {
            continue;
          }

          summary.total_rows += 1;

          let frameworkControlId = null;
          if (rawFrameworkControlId) {
            frameworkControlId = controlIdByFrameworkControlId.get(rawFrameworkControlId) || null;
          }
          if (!frameworkControlId && rawControlCode) {
            let resolvedFrameworkCode = defaultFrameworkCode;
            if (nonEmptyString(rawFrameworkIdentifier)) {
              const token = normalizeFrameworkToken(rawFrameworkIdentifier);
              const mapped = frameworkCodeByToken.get(token) || null;
              if (mapped) {
                resolvedFrameworkCode = mapped;
              } else if (!defaultFrameworkCode) {
                summary.errors.push({
                  row: rowNumber,
                  error: `Framework not recognized for this organization: "${rawFrameworkIdentifier}".`
                });
                continue;
              }
            }

            if (!resolvedFrameworkCode) {
              summary.errors.push({
                row: rowNumber,
                error: 'Missing framework identifier. Include a framework_code column (or import into an org with exactly one selected framework).'
              });
              continue;
            }

            const candidates = [];
            const raw = String(rawControlCode || '').trim();
            if (raw) {
              candidates.push(raw);
              const firstToken = raw.split(/\s+/)[0];
              if (firstToken && firstToken !== raw) candidates.push(firstToken);
              const cleaned = firstToken.replace(/[,:;]+$/g, '');
              if (cleaned && cleaned !== firstToken) candidates.push(cleaned);
            }

            for (const candidate of candidates) {
              const found = controlIdByComposite.get(`${resolvedFrameworkCode}::${candidate.toLowerCase()}`) || null;
              if (found) {
                frameworkControlId = found;
                break;
              }
            }
          }

          if (!frameworkControlId) {
            summary.errors.push({
              row: rowNumber,
              error: 'Control not found for this organization (check framework_control_id, or control_id + framework_code when multiple frameworks are selected).'
            });
            continue;
          }

          const statusRaw = getCellText('status');
          const statusNormalized = normalizeImplementationStatus(statusRaw);
          let statusProvided = false;
          if (fileProvidesField('status') && statusNormalized) {
            statusProvided = true;
          }
          if (statusRaw && !statusNormalized) {
            statusProvided = false;
            summary.warnings.push({ row: rowNumber, warning: `Invalid status '${statusRaw}'. Allowed: ${Array.from(VALID_CONTROL_IMPLEMENTATION_STATUSES).join(', ')}` });
          }
          const statusValue = statusNormalized || 'not_started';

          const implementationNotesRaw = getCellText('implementation_notes');
          const implementationNotesValue = implementationNotesRaw ? implementationNotesRaw : null;
          let implementationNotesProvided = false;
          if (fileProvidesField('implementation_notes')) {
            implementationNotesProvided = mode === 'replace' ? true : Boolean(implementationNotesRaw);
          }

          const evidenceLocationRaw = getCellText('evidence_location');
          const evidenceLocationValue = evidenceLocationRaw ? evidenceLocationRaw : null;
          let evidenceLocationProvided = false;
          if (fileProvidesField('evidence_location')) {
            evidenceLocationProvided = mode === 'replace' ? true : Boolean(evidenceLocationRaw);
          }

          const notesRaw = getCellText('notes');
          const notesValue = notesRaw ? notesRaw : null;
          let notesProvided = false;
          if (fileProvidesField('notes')) {
            notesProvided = mode === 'replace' ? true : Boolean(notesRaw);
          }

          const dueDateCell = getCell('due_date');
          const dueDateValue = parseDateCellToISO(dueDateCell);
          let dueDateProvided = false;
          if (fileProvidesField('due_date')) {
            const dueDateText = String(dueDateCell?.text || '').trim();
            dueDateProvided = mode === 'replace' ? true : Boolean(dueDateValue);
            if (dueDateText && !dueDateValue) {
              dueDateProvided = false;
              summary.warnings.push({ row: rowNumber, warning: `Invalid due_date '${dueDateText}'. Expected YYYY-MM-DD or MM/DD/YYYY.` });
            }
          }

          const assignedToEmailRaw = getCellText('assigned_to_email').toLowerCase();
          const assignedToIdRaw = getCellText('assigned_to_id');
          let assignedToIdValue = null;
          let assignedToProvided = false;

          if (assignedToEmailRaw) {
            const mapped = userIdByEmail.get(assignedToEmailRaw) || null;
            if (!mapped) {
              summary.warnings.push({ row: rowNumber, warning: `assigned_to_email '${assignedToEmailRaw}' not found in organization users. Assignment unchanged.` });
            } else {
              assignedToIdValue = mapped;
              assignedToProvided = true;
            }
          } else if (assignedToIdRaw && isUuid(assignedToIdRaw)) {
            if (userIds.has(assignedToIdRaw)) {
              assignedToIdValue = assignedToIdRaw;
              assignedToProvided = true;
            } else {
              summary.warnings.push({ row: rowNumber, warning: `assigned_to_id '${assignedToIdRaw}' not found in organization users. Assignment unchanged.` });
            }
          } else if (fileProvidesField('assigned_to_email') || fileProvidesField('assigned_to_id')) {
            // Empty assignment cell in replace mode means "clear".
            if (mode === 'replace') {
              assignedToIdValue = null;
              assignedToProvided = true;
            }
          }

          const hasOtherData = Boolean(
            implementationNotesValue ||
              evidenceLocationValue ||
              notesValue ||
              dueDateValue ||
              assignedToEmailRaw ||
              assignedToIdRaw
          );
          const effectiveStatusForEmptyCheck = statusNormalized || 'not_started';
          const isEmptyRow = effectiveStatusForEmptyCheck === 'not_started' && !hasOtherData;
          const hasExisting = hasExistingImplementation.has(frameworkControlId);

          // Avoid creating thousands of empty "not_started" rows from templates/exports.
          if (!hasExisting && isEmptyRow) {
            summary.skipped += 1;
            continue;
          }

          const result = await client.query(upsertSql, [
            frameworkControlId,
            orgId,
            statusValue,
            implementationNotesValue,
            evidenceLocationValue,
            assignedToIdValue,
            notesValue,
            dueDateValue,
            statusProvided,
            implementationNotesProvided,
            evidenceLocationProvided,
            assignedToProvided,
            notesProvided,
            dueDateProvided
          ]);

          summary.processed_rows += 1;
          if (result.rows[0]?.inserted) {
            summary.inserted += 1;
            hasExistingImplementation.add(frameworkControlId);
          } else {
            summary.updated += 1;
          }
        }

        await client.query(
          `INSERT INTO audit_logs (organization_id, user_id, event_type, resource_type, resource_id, details)
           VALUES ($1, $2, 'control_answers_imported', 'organization', $1, $3)`,
          [
            orgId,
            req.user.id,
            JSON.stringify({
              filename: file.originalname,
              mode,
              inserted: summary.inserted,
              updated: summary.updated,
              skipped: summary.skipped,
              warnings: summary.warnings.length,
              errors: summary.errors.length
            })
          ]
        );

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }

      if (worksheet.rowCount > maxRows) {
        summary.warnings.push({ row: null, warning: `Row limit exceeded. Processed first ${maxRows} rows only.` });
      }

      res.json({ success: true, data: summary });
    } catch (error) {
      log('error', 'organizations.controls.import_failed', { error: error.message });
      res.status(500).json({ success: false, error: 'Failed to import controls' });
    }
  }
);

module.exports = router;
