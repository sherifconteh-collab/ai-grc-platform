/**
 * Shared constants and helper functions for the organizations route tree.
 *
 * Extracted from routes/organizations.js as part of monolith split (4.1).
 * All logic is identical to the original inline definitions. The thin
 * orchestrator in routes/organizations.js destructures what it needs from
 * the exported object.
 */

'use strict';

const multer = require('multer');
const pool = require('../../config/database');
const { log } = require('../../utils/logger');

const STRICT_CROSSWALK_MAPPING_TYPES = ['equivalent', 'exact'];

// Escape special characters in ILIKE patterns to prevent wildcard injection
function escapeIlike(str) {
  return String(str).replace(/[%_\\]/g, '\\$&');
}
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
const VALID_COTS_AUTHZ_STATUSES = new Set([
  'none', 'fedramp_ready', 'fedramp_in_process', 'fedramp_authorized', 'agency_ato', 'dod_il_authorized', 'other'
]);
const VALID_COTS_AUTHZ_LEVELS = new Set(['li_saas', 'low', 'moderate', 'high']);
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
  const authorizationStatus = input.authorization_status !== undefined
    ? toLowerNullableString(input.authorization_status)
    : existing?.authorization_status || null;
  const authorizationImpactLevel = input.authorization_impact_level !== undefined
    ? toLowerNullableString(input.authorization_impact_level)
    : existing?.authorization_impact_level || null;

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
    authorization_status: authorizationStatus,
    authorization_impact_level: authorizationImpactLevel,
    external_authorization_id: input.external_authorization_id !== undefined
      ? toNullableString(input.external_authorization_id)
      : existing?.external_authorization_id || null,
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
  if (payload.authorization_status && !VALID_COTS_AUTHZ_STATUSES.has(payload.authorization_status)) {
    errors.push('authorization_status must be one of: none, fedramp_ready, fedramp_in_process, fedramp_authorized, agency_ato, dod_il_authorized, other');
  }
  if (payload.authorization_impact_level && !VALID_COTS_AUTHZ_LEVELS.has(payload.authorization_impact_level)) {
    errors.push('authorization_impact_level must be one of: li_saas, low, moderate, high');
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

module.exports = {
  // Constants
  STRICT_CROSSWALK_MAPPING_TYPES,
  VALID_CIA_LEVELS,
  VALID_RMF_STAGES,
  VALID_COMPLIANCE_PROFILES,
  VALID_NIST_ADOPTION_MODES,
  VALID_ENVIRONMENT_TYPES,
  VALID_DEPLOYMENT_MODELS,
  VALID_DATA_SENSITIVITY_TYPES,
  VALID_CRITICALITY_LEVELS,
  VALID_COTS_PRODUCT_TYPES,
  VALID_COTS_LIFECYCLE_STATUSES,
  VALID_COTS_DEPLOYMENT_MODELS,
  VALID_COTS_DATA_ACCESS_LEVELS,
  VALID_CONTRACT_TYPES,
  VALID_CONTRACT_STATUSES,
  RMF_FRAMEWORK_CODES,
  NIST_800_53_REQUIRED_INFORMATION_TYPE_CODES,
  VALID_CONTROL_IMPLEMENTATION_STATUSES,
  controlsImportUpload,
  // Helpers
  escapeIlike,
  toNullableString,
  sanitizeArray,
  toLowerNullableString,
  toNullableDateString,
  toBoolean,
  sanitizeFlexibleArray,
  logOrganizationEvent,
  rehydrateImplementationsForFrameworkSelection,
  ensureSystemBelongsToOrganization,
  normalizeSystemInput,
  normalizeCotsProductInput,
  normalizeContractInput,
  getDefaultOrganizationProfile,
  verifyOrgAccess,
};
