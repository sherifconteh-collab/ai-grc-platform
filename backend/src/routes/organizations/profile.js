// @tier: community
/**
 * Organization profile routes: GET/PUT /me/profile (onboarding profile,
 * CIA impact baseline, RMF stage, compliance profile).
 *
 * Extracted verbatim from routes/organizations.js (monolith split). Paths,
 * middleware chains, SQL, and response shapes are unchanged. Mounted by the
 * aggregator in routes/organizations.js, which applies `authenticate` first.
 */

const express = require('express');
const router = express.Router();
const pool = require('../../config/database');
const { requirePermission } = require('../../middleware/auth');
const { log } = require('../../utils/logger');
const {
  RMF_FRAMEWORK_CODES,
  VALID_CIA_LEVELS,
  VALID_RMF_STAGES,
  VALID_COMPLIANCE_PROFILES,
  VALID_NIST_ADOPTION_MODES,
  VALID_ENVIRONMENT_TYPES,
  VALID_DEPLOYMENT_MODELS,
  VALID_DATA_SENSITIVITY_TYPES,
  NIST_800_53_REQUIRED_INFORMATION_TYPE_CODES,
  toNullableString,
  sanitizeArray,
  getDefaultOrganizationProfile,
} = require('./_helpers');

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

module.exports = router;
