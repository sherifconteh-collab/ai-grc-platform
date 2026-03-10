// @tier: free
const pool = require('../config/database');

/**
 * Framework-Specific POA&M Configurations
 * Different frameworks have different remediation/review processes
 */

const FRAMEWORK_POAM_TYPES = {
  // FISCAM (Federal Information System Controls Audit Manual)
  fiscam: {
    types: [
      {
        code: 'fiscam_cap',
        name: 'Corrective Action Plan (CAP)',
        description: 'Formal corrective action plan required by FISCAM for control deficiencies',
        required_fields: ['root_cause', 'corrective_action', 'responsible_official', 'target_completion_date', 'resources_required'],
        review_levels: ['auditor', 'management', 'independent_verification']
      },
      {
        code: 'fiscam_nfr',
        name: 'Notice of Findings and Recommendations (NFR)',
        description: 'Formal notice of audit findings requiring management response',
        required_fields: ['finding_description', 'recommendation', 'management_response', 'estimated_completion_date'],
        review_levels: ['auditor', 'auditee_management', 'audit_committee']
      }
    ]
  },
  
  // ISO 27001
  iso_27001: {
    types: [
      {
        code: 'iso_car',
        name: 'Corrective Action Request (CAR)',
        description: 'Formal corrective action request for non-conformities',
        required_fields: ['non_conformity_description', 'corrective_action', 'preventive_action', 'verification_method'],
        review_levels: ['auditor', 'management_representative']
      },
      {
        code: 'iso_ofi',
        name: 'Opportunity for Improvement (OFI)',
        description: 'Recommendation for improvement (not mandatory)',
        required_fields: ['improvement_area', 'proposed_action', 'expected_benefit'],
        review_levels: ['auditor']
      }
    ]
  },
  
  // SOC 2
  soc2: {
    types: [
      {
        code: 'soc2_exception',
        name: 'Control Exception',
        description: 'Documented exception to SOC 2 control requirements',
        required_fields: ['exception_rationale', 'compensating_controls', 'risk_assessment', 'remediation_plan'],
        review_levels: ['auditor', 'service_auditor', 'client_notification']
      },
      {
        code: 'soc2_deficiency',
        name: 'Control Deficiency',
        description: 'Identified deficiency in control design or operation',
        required_fields: ['deficiency_type', 'impact_assessment', 'remediation_steps', 'testing_plan'],
        review_levels: ['auditor', 'management']
      }
    ]
  },
  
  // HIPAA
  hipaa: {
    types: [
      {
        code: 'hipaa_cap',
        name: 'HIPAA Corrective Action Plan',
        description: 'Required corrective action for HIPAA violations or gaps',
        required_fields: ['violation_description', 'affected_phi', 'corrective_measures', 'prevention_measures', 'compliance_date'],
        review_levels: ['privacy_officer', 'security_officer', 'compliance_committee']
      }
    ]
  },
  
  // PCI DSS
  pci_dss: {
    types: [
      {
        code: 'pci_rav',
        name: 'Report on Attestation of Compliance (RAV)',
        description: 'Documentation for PCI DSS compliance gaps',
        required_fields: ['requirement_number', 'gap_description', 'remediation_approach', 'validation_method', 'target_date'],
        review_levels: ['qsa', 'issuing_bank']
      }
    ]
  },
  
  // NIST 800-53
  nist_800_53: {
    types: [
      {
        code: 'nist_poam',
        name: 'NIST Plan of Action and Milestones',
        description: 'Standard NIST POA&M format',
        required_fields: ['weakness_description', 'risk_rating', 'remediation_steps', 'milestones', 'resources', 'scheduled_completion'],
        review_levels: ['isso', 'issm', 'authorizing_official']
      }
    ]
  },
  
  // FedRAMP
  fedramp: {
    types: [
      {
        code: 'fedramp_poam',
        name: 'FedRAMP POA&M',
        description: 'FedRAMP-specific Plan of Action and Milestones',
        required_fields: ['weakness_id', 'risk_adjustment', 'vendor_dependency', 'milestone_changes', 'deviation_request'],
        review_levels: ['csp', '3pao', 'agency_ao', 'fedramp_pmo']
      }
    ]
  }
};

/**
 * Get framework-specific POA&M types
 */
function getFrameworkPoamTypes(frameworkCode) {
  const normalized = String(frameworkCode || '').toLowerCase().replace(/-/g, '_');
  return FRAMEWORK_POAM_TYPES[normalized] || null;
}

/**
 * Get all available framework-specific types
 */
function getAllFrameworkTypes() {
  const allTypes = [];
  for (const [frameworkCode, config] of Object.entries(FRAMEWORK_POAM_TYPES)) {
    for (const type of config.types) {
      allTypes.push({
        framework_code: frameworkCode,
        ...type
      });
    }
  }
  return allTypes;
}

/**
 * Validate framework-specific data
 */
function validateFrameworkSpecificData(frameworkCode, typeCode, data) {
  const frameworkConfig = getFrameworkPoamTypes(frameworkCode);
  if (!frameworkConfig) {
    return { valid: true, errors: [] }; // No specific requirements
  }

  const typeConfig = frameworkConfig.types.find(t => t.code === typeCode);
  if (!typeConfig) {
    return { valid: false, errors: [`Invalid type '${typeCode}' for framework '${frameworkCode}'`] };
  }

  const errors = [];
  const missingFields = [];

  for (const field of typeConfig.required_fields) {
    if (!data || !data[field] || String(data[field]).trim().length === 0) {
      missingFields.push(field);
    }
  }

  if (missingFields.length > 0) {
    errors.push(`Missing required fields for ${typeConfig.name}: ${missingFields.join(', ')}`);
  }

  return {
    valid: errors.length === 0,
    errors,
    type_config: typeConfig
  };
}

/**
 * Get framework code from control
 */
async function getFrameworkFromControl(controlId) {
  try {
    const result = await pool.query(
      `SELECT f.id, f.code, f.name
       FROM framework_controls fc
       JOIN frameworks f ON f.id = fc.framework_id
       WHERE fc.id = $1
       LIMIT 1`,
      [controlId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  } catch (error) {
    console.error('Error getting framework from control:', error);
    return null;
  }
}

/**
 * Create framework-specific approval request
 */
async function createFrameworkApprovalRequest(orgId, userId, poamId, controlId, data) {
  const {
    previous_control_status,
    new_control_status,
    justification,
    supporting_evidence_ids = [],
    framework_specific_type,
    framework_specific_data = {}
  } = data;

  // Get framework from control
  const framework = await getFrameworkFromControl(controlId);
  
  // Validate framework-specific data if type is provided
  if (framework && framework_specific_type) {
    const validation = validateFrameworkSpecificData(
      framework.code,
      framework_specific_type,
      framework_specific_data
    );

    if (!validation.valid) {
      throw new Error(validation.errors.join('; '));
    }
  }

  // Create approval request
  const result = await pool.query(
    `INSERT INTO poam_approval_requests (
       organization_id, poam_item_id, control_id, framework_id,
       previous_control_status, new_control_status, justification,
       supporting_evidence_ids, submitted_by, framework_specific_type,
       framework_specific_data
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [
      orgId,
      poamId,
      controlId,
      framework ? framework.id : null,
      previous_control_status || null,
      new_control_status || null,
      justification,
      Array.isArray(supporting_evidence_ids) ? supporting_evidence_ids : [],
      userId,
      framework_specific_type || 'standard',
      framework_specific_data
    ]
  );

  return result.rows[0];
}

/**
 * Get approval request with framework context
 */
async function getApprovalRequestWithContext(approvalRequestId, orgId) {
  const result = await pool.query(
    `SELECT 
       par.*,
       f.code AS framework_code,
       f.name AS framework_name,
       fc.control_id AS control_code,
       fc.title AS control_title,
       submitter.email AS submitted_by_email,
       reviewer.email AS reviewed_by_email
     FROM poam_approval_requests par
     LEFT JOIN frameworks f ON f.id = par.framework_id
     LEFT JOIN framework_controls fc ON fc.id = par.control_id
     LEFT JOIN users submitter ON submitter.id = par.submitted_by
     LEFT JOIN users reviewer ON reviewer.id = par.reviewed_by
     WHERE par.id = $1 AND par.organization_id = $2
     LIMIT 1`,
    [approvalRequestId, orgId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  const request = result.rows[0];

  // Enhance with framework type configuration
  if (request.framework_code && request.framework_specific_type) {
    const frameworkConfig = getFrameworkPoamTypes(request.framework_code);
    if (frameworkConfig) {
      const typeConfig = frameworkConfig.types.find(
        t => t.code === request.framework_specific_type
      );
      if (typeConfig) {
        request.type_configuration = typeConfig;
      }
    }
  }

  return request;
}

/**
 * Get framework-specific guidance for auditors
 */
function getAuditorGuidance(frameworkCode, typeCode) {
  const frameworkConfig = getFrameworkPoamTypes(frameworkCode);
  if (!frameworkConfig) {
    return null;
  }

  const typeConfig = frameworkConfig.types.find(t => t.code === typeCode);
  if (!typeConfig) {
    return null;
  }

  return {
    type_name: typeConfig.name,
    description: typeConfig.description,
    required_fields: typeConfig.required_fields,
    review_levels: typeConfig.review_levels,
    guidance: generateAuditorGuidance(frameworkCode, typeConfig)
  };
}

/**
 * Generate auditor guidance text
 */
function generateAuditorGuidance(frameworkCode, typeConfig) {
  const guidanceMap = {
    fiscam_cap: `
FISCAM CAP Review Guidelines:
1. Verify root cause analysis is comprehensive and accurate
2. Ensure corrective actions directly address the identified weakness
3. Confirm responsible official has authority and resources
4. Validate target completion date is realistic and documented
5. Check that management has committed necessary resources
6. Consider need for independent verification of implementation
    `,
    fiscam_nfr: `
FISCAM NFR Review Guidelines:
1. Confirm finding is clearly described with supporting evidence
2. Verify recommendations are specific and actionable
3. Review management response for adequacy and reasonableness
4. Assess estimated completion date against finding severity
5. Determine if follow-up audit procedures are warranted
6. Consider escalation to audit committee if needed
    `,
    iso_car: `
ISO 27001 CAR Review Guidelines:
1. Verify non-conformity is properly classified (major/minor)
2. Ensure root cause analysis follows ISO methodology
3. Check corrective action addresses the root cause
4. Review preventive action to prevent recurrence
5. Validate verification method is appropriate
6. Confirm timeline aligns with certification requirements
    `,
    nist_poam: `
NIST POA&M Review Guidelines:
1. Verify weakness aligns with NIST control assessment
2. Confirm risk rating follows organizational methodology
3. Review remediation steps for completeness and feasibility
4. Check milestones have specific, measurable outcomes
5. Validate resource allocation is sufficient
6. Ensure scheduled completion aligns with risk level
    `,
    fedramp_poam: `
FedRAMP POA&M Review Guidelines:
1. Verify POA&M follows FedRAMP template requirements
2. Check risk adjustment justification if risk downgraded
3. Review vendor dependency impacts on timeline
4. Validate milestone changes are properly documented
5. Assess any deviation requests for reasonableness
6. Confirm compliance with FedRAMP continuous monitoring
    `
  };

  return guidanceMap[typeConfig.code] || `
Review the ${typeConfig.name} according to ${frameworkCode.toUpperCase()} requirements:
- Verify all required fields are complete and accurate
- Assess the adequacy of proposed actions
- Confirm timeline and resources are realistic
- Follow your organization's ${frameworkCode.toUpperCase()} audit procedures
  `.trim();
}

module.exports = {
  FRAMEWORK_POAM_TYPES,
  getFrameworkPoamTypes,
  getAllFrameworkTypes,
  validateFrameworkSpecificData,
  getFrameworkFromControl,
  createFrameworkApprovalRequest,
  getApprovalRequestWithContext,
  getAuditorGuidance
};
