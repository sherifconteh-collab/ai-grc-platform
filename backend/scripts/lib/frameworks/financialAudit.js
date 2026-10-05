'use strict';

/**
 * Financial audit readiness content: an expanded FISCAM-aligned control set,
 * COSO 2013 internal control principles, a SOX IT general controls library and
 * an OMB Circular A-123 Appendix A readiness checklist.
 *
 * Everything here is written by ControlWeave. Titles and descriptions paraphrase
 * the published frameworks; none of it reproduces their text, and control
 * identifiers are ControlWeave's own (the CWF-, ITGC- and A123- prefixes are not
 * official numbering). Treat it as a starting library that an organization tailors
 * in its risk-control matrix.
 *
 * Consumed by scripts/seed-frameworks.js (fresh installs) and by
 * scripts/generate-financial-audit-migration.js, which writes the idempotent
 * migration that installs the same content on existing databases.
 */

function c(controlId, title, description, controlType, extra = {}) {
  return { control_id: controlId, title, description, priority: extra.priority || '1', control_type: controlType, ...extra };
}

function child(parent, controlId, title, description, controlType) {
  return c(controlId, title, description, controlType, { parent_control_id: parent });
}

// ---------------------------------------------------------------------------
// FISCAM: new family roots plus ControlWeave control activities under both the
// existing families (SM-1..4, AC-FM-1..4, CC-1..2, SC-1, CP-FM-1) and the new ones.
// ---------------------------------------------------------------------------

const FISCAM_NEW_FAMILIES = [
  c('BP-1', 'Business Process Application Controls', 'Controls within financial applications that ensure transactions are authorized, complete, accurate and valid when entered, processed and reported.', 'technical'),
  c('IN-1', 'Interface Controls', 'Controls over data moving between financial systems so that transfers are complete, accurate and timely.', 'technical'),
  c('DM-1', 'Data Management System Controls', 'Controls over databases and data stores supporting financial applications, including direct data access and changes made outside the application.', 'technical')
];

const FISCAM_ACTIVITIES = [
  child('SM-1', 'CWF-SM-01', 'Security program documented and approved', 'An entity-wide security program covering financially significant systems is documented, approved by management and assigned an accountable owner.', 'strategic'),
  child('SM-1', 'CWF-SM-02', 'Security roles for financial systems assigned', 'Security responsibilities for each financially significant system (system owner, security officer, data owner) are assigned in writing.', 'organizational'),
  child('SM-1', 'CWF-SM-03', 'Security awareness for financial system users', 'Users of financial systems complete security awareness training on hire and at least annually, and completion is tracked.', 'organizational'),
  child('SM-2', 'CWF-SM-04', 'Periodic risk assessment of financial systems', 'Risks to financially significant systems are assessed at least annually and when significant changes occur, and results feed control selection.', 'strategic'),
  child('SM-2', 'CWF-SM-05', 'Inventory of financially significant systems', 'An inventory identifies each system, interface and data store that supports financial reporting, with its owner and hosting arrangement.', 'organizational'),
  child('SM-3', 'CWF-SM-06', 'Security policies reviewed', 'Security policies and procedures that apply to financial systems are reviewed and re-approved on a defined cycle.', 'policy'),
  child('SM-4', 'CWF-SM-07', 'Control weaknesses tracked to remediation', 'Identified control weaknesses are recorded with an owner, milestones and due dates, and are tracked until validated as closed.', 'organizational'),
  child('SM-4', 'CWF-SM-08', 'Service organization reports reviewed', 'Service organization control reports for hosted or outsourced financial processing are obtained, reviewed for exceptions, and complementary user entity controls are mapped to owners.', 'organizational'),
  child('AC-FM-1', 'CWF-AC-01', 'Access provisioning approved', 'New or changed access to financial systems is requested and approved by the business owner before it is granted, and the approval is retained.', 'technical'),
  child('AC-FM-1', 'CWF-AC-02', 'Timely removal of access', 'Access for separated or transferred personnel is removed within a defined period, confirmed against HR records.', 'technical'),
  child('AC-FM-1', 'CWF-AC-03', 'Periodic user access recertification', 'Owners recertify user access and role assignments to financial systems at a defined frequency, and inappropriate access is removed.', 'technical'),
  child('AC-FM-1', 'CWF-AC-04', 'Shared and generic accounts controlled', 'Shared, generic and service accounts are prohibited or individually approved, assigned an owner and monitored.', 'technical'),
  child('AC-FM-2', 'CWF-AC-05', 'Least privilege role design', 'Roles and responsibilities in financial applications grant only the functions needed for each job and are documented.', 'technical'),
  child('AC-FM-2', 'CWF-AC-06', 'Privileged access restricted and monitored', 'Administrator and superuser access is limited to named individuals, and activity performed with it is logged and reviewed.', 'technical'),
  child('AC-FM-2', 'CWF-AC-07', 'Emergency access reviewed', 'Emergency or firefighter access is granted for a defined purpose and time, logged, and reviewed after use by someone independent of the user.', 'technical'),
  child('AC-FM-3', 'CWF-AC-08', 'Strong authentication for privileged and remote access', 'Privileged and remote access to financial systems requires multifactor authentication.', 'technical'),
  child('AC-FM-3', 'CWF-AC-09', 'Authentication settings configured', 'Password, lockout and session timeout settings in financial systems meet the organization policy and are checked periodically.', 'technical'),
  child('AC-FM-4', 'CWF-AC-10', 'Network protection of financial systems', 'Financial systems are segmented from untrusted networks and inbound access is limited to approved paths.', 'technical'),
  child('AC-FM-4', 'CWF-AC-11', 'Physical access to computing facilities', 'Physical access to facilities housing financial systems is restricted to authorized personnel and reviewed periodically.', 'technical'),
  child('AC-FM-4', 'CWF-AC-12', 'Security event logging and review', 'Security-relevant events in financial systems are logged, protected from alteration and reviewed.', 'technical'),
  child('CC-1', 'CWF-CM-01', 'Changes authorized, tested and approved', 'Changes to financial applications and their configuration are authorized, tested and approved before they move to production.', 'technical'),
  child('CC-1', 'CWF-CM-02', 'Separation of development and production', 'Developers cannot move their own changes into production; migration is performed by a separate function or an automated pipeline with approvals.', 'technical'),
  child('CC-1', 'CWF-CM-03', 'Emergency changes documented', 'Emergency changes are documented and approved after the fact within a defined period.', 'technical'),
  child('CC-1', 'CWF-CM-04', 'Production changes reconciled to approvals', 'Changes detected in production are periodically reconciled to approved change records, and unmatched changes are investigated.', 'technical'),
  child('CC-2', 'CWF-CM-05', 'Baseline configurations maintained', 'Approved baseline configurations exist for financial system components and deviations are detected and resolved.', 'technical'),
  child('CC-2', 'CWF-CM-06', 'Vulnerabilities remediated', 'Financial system components are scanned for vulnerabilities and patched within defined timeframes based on severity.', 'technical'),
  child('SC-1', 'CWF-SD-01', 'Incompatible duties defined', 'A segregation of duties matrix identifies incompatible business functions for each financial process.', 'organizational'),
  child('SC-1', 'CWF-SD-02', 'Segregation enforced and monitored in applications', 'Application roles are designed so incompatible functions are not combined, and user assignments are analyzed for conflicts on a defined schedule.', 'technical'),
  child('SC-1', 'CWF-SD-03', 'Mitigating controls for accepted conflicts', 'Where a conflict is accepted, a documented mitigating control with an owner and frequency is performed and evidenced.', 'organizational'),
  child('CP-FM-1', 'CWF-CP-01', 'Backups and restores tested', 'Financial data is backed up on a defined schedule and restoration is tested periodically.', 'technical'),
  child('CP-FM-1', 'CWF-CP-02', 'Contingency plan tested', 'The contingency plan for financial systems is tested at least annually and lessons learned are incorporated.', 'organizational'),
  child('CP-FM-1', 'CWF-CP-03', 'Batch jobs monitored', 'Scheduled jobs that process financial data are monitored, and failures are resolved and documented.', 'technical'),
  child('BP-1', 'CWF-BP-01', 'Input validation', 'Application edit checks reject or flag incomplete, invalid or out-of-range financial data at entry.', 'technical'),
  child('BP-1', 'CWF-BP-02', 'Approval workflows and limits configured', 'Approval hierarchies and dollar limits for purchasing, payments and journal entries are configured as approved and changes are reviewed.', 'technical'),
  child('BP-1', 'CWF-BP-03', 'Master data changes reviewed', 'Changes to vendor, customer, employee and bank master data are approved and independently reviewed.', 'technical'),
  child('BP-1', 'CWF-BP-04', 'Three-way match enforced', 'Invoices are matched to purchase orders and receipts within configured tolerances before payment.', 'technical'),
  child('BP-1', 'CWF-BP-05', 'Duplicate invoice prevention', 'The application blocks or flags invoices that duplicate an existing vendor invoice number, amount or date.', 'technical'),
  child('BP-1', 'CWF-BP-06', 'Reports used in controls are reliable', 'System reports used to perform controls are validated for completeness and accuracy.', 'technical'),
  child('IN-1', 'CWF-IN-01', 'Interface completeness reconciled', 'Record counts and control totals are reconciled between sending and receiving systems for each financially significant interface.', 'technical'),
  child('IN-1', 'CWF-IN-02', 'Interface errors resolved', 'Interface errors and rejected records are monitored, corrected and resubmitted timely.', 'technical'),
  child('DM-1', 'CWF-DM-01', 'Direct data access restricted', 'Direct access to financial databases that bypasses the application is restricted to authorized administrators.', 'technical'),
  child('DM-1', 'CWF-DM-02', 'Direct data changes logged and reviewed', 'Changes made to financial data outside the application are logged, approved and reviewed.', 'technical')
];

// ---------------------------------------------------------------------------
// COSO 2013: five components with their seventeen principles.
// ---------------------------------------------------------------------------

const COSO_2013 = {
  code: 'coso_2013',
  name: 'COSO Internal Control - Integrated Framework (2013)',
  version: '2013',
  category: 'Financial Audit',
  tier_required: 'community',
  coverage_status: 'core_controls',
  description: 'The five components and seventeen principles of effective internal control, paraphrased by ControlWeave. Used for entity-level control assessments under SOX 404 and OMB A-123. Points of focus are not included.',
  controls: [
    c('COSO-CE', 'Control Environment', 'The standards, processes and structures that provide the basis for carrying out internal control.', 'organizational'),
    child('COSO-CE', 'COSO-P1', 'Principle 1: Commitment to integrity and ethical values', 'The organization shows a commitment to integrity and ethics, sets expectations through a code of conduct and addresses deviations.', 'organizational'),
    child('COSO-CE', 'COSO-P2', 'Principle 2: Independent board oversight', 'The board is independent of management and oversees the development and performance of internal control.', 'organizational'),
    child('COSO-CE', 'COSO-P3', 'Principle 3: Structures, reporting lines and authority', 'Management, with board oversight, sets structures, reporting lines and authorities to pursue objectives.', 'organizational'),
    child('COSO-CE', 'COSO-P4', 'Principle 4: Commitment to competence', 'The organization attracts, develops and retains competent people aligned with its objectives.', 'organizational'),
    child('COSO-CE', 'COSO-P5', 'Principle 5: Accountability', 'Individuals are held accountable for their internal control responsibilities.', 'organizational'),
    c('COSO-RA', 'Risk Assessment', 'The process for identifying and analyzing risks to achieving objectives.', 'strategic'),
    child('COSO-RA', 'COSO-P6', 'Principle 6: Suitable objectives', 'Objectives are specified clearly enough to identify and assess the risks to them.', 'strategic'),
    child('COSO-RA', 'COSO-P7', 'Principle 7: Risk identification and analysis', 'Risks to objectives are identified across the organization and analyzed to decide how they should be managed.', 'strategic'),
    child('COSO-RA', 'COSO-P8', 'Principle 8: Fraud risk', 'The potential for fraud is considered when assessing risks.', 'strategic'),
    child('COSO-RA', 'COSO-P9', 'Principle 9: Significant change', 'Changes that could significantly affect internal control are identified and assessed.', 'strategic'),
    c('COSO-CA', 'Control Activities', 'The actions set by policies and procedures that help ensure management directives to mitigate risks are carried out.', 'technical'),
    child('COSO-CA', 'COSO-P10', 'Principle 10: Control activities selected and developed', 'Control activities are selected and developed to reduce risks to acceptable levels.', 'technical'),
    child('COSO-CA', 'COSO-P11', 'Principle 11: General controls over technology', 'General control activities over technology are selected and developed to support objectives.', 'technical'),
    child('COSO-CA', 'COSO-P12', 'Principle 12: Policies and procedures', 'Control activities are deployed through policies that set expectations and procedures that put them into action.', 'policy'),
    c('COSO-IC', 'Information and Communication', 'Obtaining, generating and sharing the information needed to carry out internal control.', 'organizational'),
    child('COSO-IC', 'COSO-P13', 'Principle 13: Relevant, quality information', 'Relevant, quality information is obtained or generated and used to support internal control.', 'organizational'),
    child('COSO-IC', 'COSO-P14', 'Principle 14: Internal communication', 'Information about internal control objectives and responsibilities is communicated internally.', 'organizational'),
    child('COSO-IC', 'COSO-P15', 'Principle 15: External communication', 'Matters affecting internal control are communicated with external parties.', 'organizational'),
    c('COSO-MA', 'Monitoring Activities', 'Ongoing and separate evaluations to confirm that each component of internal control is present and functioning.', 'organizational'),
    child('COSO-MA', 'COSO-P16', 'Principle 16: Ongoing and separate evaluations', 'Ongoing and separate evaluations confirm whether the components of internal control are present and functioning.', 'organizational'),
    child('COSO-MA', 'COSO-P17', 'Principle 17: Deficiencies communicated', 'Internal control deficiencies are evaluated and communicated timely to those responsible for corrective action, including senior management and the board.', 'organizational')
  ]
};

// ---------------------------------------------------------------------------
// SOX IT general controls library (ControlWeave-authored).
// ---------------------------------------------------------------------------

const SOX_ITGC = {
  code: 'sox_itgc',
  name: 'SOX IT General Controls (ControlWeave library)',
  version: '2026',
  category: 'Financial Audit',
  tier_required: 'community',
  coverage_status: 'representative',
  description: 'A starter library of IT general controls commonly relied on in SOX 404 audits, grouped into access to programs and data, program change, program development and computer operations. Written by ControlWeave; tailor it in the risk-control matrix.',
  controls: [
    c('ITGC-APD', 'Access to Programs and Data', 'Only authorized users can access financially significant applications, databases and operating systems.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-01', 'New user access approved', 'New access to in-scope systems is approved by an appropriate manager before provisioning.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-02', 'Terminated user access removed', 'Access for terminated users is removed timely, validated against an HR termination listing.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-03', 'User access reviewed', 'Application, database and operating system access is reviewed by owners at least quarterly for key systems.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-04', 'Privileged access restricted', 'Privileged access is limited to appropriate IT personnel and reviewed periodically.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-05', 'Password and authentication settings', 'Authentication settings for in-scope systems meet policy.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-06', 'Segregation of duties in applications', 'Conflicting application functions are identified and either removed or mitigated.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-07', 'Generic and service accounts', 'Generic and service accounts have an assigned owner and cannot be used interactively without approval.', 'technical'),
    child('ITGC-APD', 'ITGC-APD-08', 'Emergency access monitored', 'Use of emergency access IDs is logged and reviewed after each use.', 'technical'),
    c('ITGC-PC', 'Program Change', 'Changes to in-scope systems are authorized, tested and approved.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-01', 'Change requests approved', 'Changes are requested and approved by the business before development begins.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-02', 'Changes tested', 'Changes are tested and user acceptance is documented before deployment.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-03', 'Deployment approved', 'Deployment to production is approved and performed by someone other than the developer.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-04', 'Emergency changes', 'Emergency changes are approved after deployment within a defined period.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-05', 'Configuration changes', 'Changes to financially significant configuration (approval limits, tolerances, posting rules) follow the change process.', 'technical'),
    child('ITGC-PC', 'ITGC-PC-06', 'Change monitoring', 'System-generated change logs are compared to approved changes.', 'technical'),
    c('ITGC-PD', 'Program Development', 'New systems and major upgrades are acquired and implemented with appropriate controls.', 'technical'),
    child('ITGC-PD', 'ITGC-PD-01', 'Implementation approved', 'System implementations and major upgrades are approved and managed under a documented methodology.', 'technical'),
    child('ITGC-PD', 'ITGC-PD-02', 'Data conversion validated', 'Data converted into new systems is reconciled for completeness and accuracy.', 'technical'),
    child('ITGC-PD', 'ITGC-PD-03', 'Go-live approved', 'Go-live is approved by business and IT owners after testing.', 'technical'),
    c('ITGC-CO', 'Computer Operations', 'Processing, backups and incidents for in-scope systems are managed.', 'technical'),
    child('ITGC-CO', 'ITGC-CO-01', 'Job scheduling changes controlled', 'Changes to scheduled jobs are authorized.', 'technical'),
    child('ITGC-CO', 'ITGC-CO-02', 'Job failures resolved', 'Failed jobs are identified, resolved and documented.', 'technical'),
    child('ITGC-CO', 'ITGC-CO-03', 'Backups performed', 'Backups are performed and failures are resolved.', 'technical'),
    child('ITGC-CO', 'ITGC-CO-04', 'Restores tested', 'Restoration from backup is tested periodically.', 'technical'),
    child('ITGC-CO', 'ITGC-CO-05', 'Incidents managed', 'Incidents affecting in-scope systems are logged, prioritized and resolved.', 'technical')
  ]
};

// ---------------------------------------------------------------------------
// OMB Circular A-123 Appendix A readiness (ControlWeave-authored checklist).
// ---------------------------------------------------------------------------

const OMB_A123 = {
  code: 'omb_a123_appa',
  name: 'OMB A-123 Appendix A Readiness (ControlWeave checklist)',
  version: '2018',
  category: 'Financial Audit',
  tier_required: 'community',
  coverage_status: 'representative',
  description: 'Readiness activities a federal agency performs to assess internal control over reporting and support its annual Statement of Assurance. A ControlWeave checklist, not the circular text.',
  controls: [
    c('A123-01', 'Governance and senior assessment team', 'A senior assessment team or equivalent governs the assessment, approves scope and reviews results.', 'organizational'),
    c('A123-02', 'Scope and materiality', 'Materiality is set and significant financial reports, line items and disclosures are identified.', 'strategic'),
    c('A123-03', 'Assessable units defined', 'Significant processes and the components that execute them are defined as assessable units with owners.', 'organizational'),
    c('A123-04', 'Entity-level controls assessed', 'Entity-level controls are evaluated against the five components and seventeen principles.', 'organizational'),
    c('A123-05', 'Processes documented', 'Each significant process is documented with narratives or flowcharts showing key controls and systems.', 'organizational'),
    c('A123-06', 'Risks assessed by assertion', 'Risks of material misstatement are identified for each significant process and mapped to financial statement assertions.', 'strategic'),
    c('A123-07', 'Key controls identified', 'Key controls addressing each risk are identified in a risk-control matrix, including IT general and application controls.', 'organizational'),
    c('A123-08', 'Test of design', 'The design of each key control is evaluated, typically by walkthrough.', 'organizational'),
    c('A123-09', 'Test of operating effectiveness', 'Key controls are tested using documented sample sizes and results are retained.', 'organizational'),
    c('A123-10', 'Service organizations', 'Controls performed by service organizations are covered by service auditor reports or direct testing.', 'organizational'),
    c('A123-11', 'Deficiencies evaluated and aggregated', 'Exceptions are evaluated individually and in aggregate and classified as control deficiencies, significant deficiencies or material weaknesses.', 'organizational'),
    c('A123-12', 'Corrective action plans', 'Corrective action plans with milestones and owners are tracked for each deficiency and validated when complete.', 'organizational'),
    c('A123-13', 'Statement of Assurance support', 'Assessment results are summarized to support the annual Statement of Assurance, with material weaknesses reported.', 'organizational')
  ]
};

const NEW_FRAMEWORKS = [COSO_2013, SOX_ITGC, OMB_A123];

module.exports = {
  FISCAM_NEW_FAMILIES,
  FISCAM_ACTIVITIES,
  FISCAM_ADDITIONS: [...FISCAM_NEW_FAMILIES, ...FISCAM_ACTIVITIES],
  COSO_2013,
  SOX_ITGC,
  OMB_A123,
  NEW_FRAMEWORKS
};
