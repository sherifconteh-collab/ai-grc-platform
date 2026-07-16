// @tier: exclude
/**
 * Shared AIUC-1 Agentic AI Certification framework data.
 *
 * Single source of truth for AIUC-1 framework metadata, controls, and crosswalk
 * mappings. Consumed by both seed-frameworks.js (main seed) and
 * seed-aiuc1-framework.js (standalone seed).
 */

const AIUC1_FRAMEWORK = Object.freeze({
  code:            'aiuc_1',
  name:            'AIUC-1 Agentic AI Certification',
  version:         '1.0',
  description:     'The first independently-audited certification standard purpose-built for agentic AI systems. Developed by the Artificial Intelligence Underwriting Company (AIUC) and audited by Schellman. Covers Data & Privacy, Security, Safety, Reliability, Accountability, and Societal Impact.',
  category:        'AI Governance',
  tier_required:   'enterprise',
  framework_group: 'aiuc',
});

const AIUC1_CONTROLS = Object.freeze([
  // ── Domain 1: Data & Privacy ─────────────────────────────────────────────
  { control_id: 'DP-1',  title: 'AI Data Classification and Inventory',             description: 'Classify and maintain an inventory of all data assets processed by AI agents, including training data, inference inputs, and outputs. Apply appropriate sensitivity labels and access controls based on data classification.',                                    priority: '1', control_type: 'strategic' },
  { control_id: 'DP-2',  title: 'Confidentiality and Access Controls for Agent Data', description: 'Implement strong access controls to ensure AI agents can only access the minimum data required for their intended function. Enforce role-based and attribute-based access policies for all data accessed by autonomous agents.',                                  priority: '1', control_type: 'technical' },
  { control_id: 'DP-3',  title: 'Data Minimization and Purpose Limitation',          description: 'Ensure AI agents collect, retain, and process only data that is strictly necessary for the defined purpose. Prevent agents from accumulating or sharing data beyond their authorized scope.',                                                                    priority: '1', control_type: 'policy' },
  { control_id: 'DP-4',  title: 'Encryption of Agent Data at Rest and in Transit',   description: 'Apply encryption to all data processed, stored, or transmitted by AI agents. Use industry-standard encryption algorithms and key management practices to protect against unauthorized disclosure.',                                                               priority: '1', control_type: 'technical' },
  { control_id: 'DP-5',  title: 'PII and Sensitive Data Protection in AI Pipelines', description: 'Detect, redact, or anonymize personally identifiable information and other sensitive data within AI agent pipelines. Establish controls to prevent inadvertent exposure of sensitive information in agent outputs.',                                                priority: '1', control_type: 'technical' },
  { control_id: 'DP-6',  title: 'Agent Data Retention and Deletion Controls',        description: 'Define and enforce retention schedules for data processed by AI agents. Ensure secure deletion of agent-generated data, conversation history, and intermediate outputs in accordance with organizational and regulatory requirements.',                            priority: '2', control_type: 'organizational' },

  // ── Domain 2: Security ────────────────────────────────────────────────────
  { control_id: 'SEC-1', title: 'Adversarial Testing and Red-Teaming for AI Agents', description: 'Conduct regular adversarial testing and red-team exercises targeting AI agents to identify exploitable vulnerabilities, including prompt injection, jailbreaking, and tool misuse. Results must be documented and drive remediation.',                              priority: '1', control_type: 'technical' },
  { control_id: 'SEC-2', title: 'Least Privilege for AI Agent Permissions',          description: 'Grant AI agents only the minimum permissions, API access, and tool capabilities required for their designated tasks. Review and re-certify agent privilege grants at least quarterly and revoke excess permissions promptly.',                                     priority: '1', control_type: 'technical' },
  { control_id: 'SEC-3', title: 'Attack Resilience and Defense-in-Depth',            description: 'Implement layered security controls to protect AI agents from known attack vectors including adversarial inputs, data poisoning, model extraction, and supply chain compromise. Test resilience under simulated attack conditions.',                                priority: '1', control_type: 'technical' },
  { control_id: 'SEC-4', title: 'Secure Development Practices for AI Agent Systems', description: 'Apply security best practices throughout the AI agent development lifecycle, including secure coding standards, dependency scanning, container security, and pre-deployment vulnerability assessments.',                                                           priority: '1', control_type: 'technical' },
  { control_id: 'SEC-5', title: 'Vulnerability Management for AI Systems',           description: 'Establish a vulnerability management program covering AI agents, underlying models, supporting infrastructure, and third-party components. Critical and high-severity (P0/P1) vulnerabilities must be remediated and retested before certification is issued or renewed.', priority: '1', control_type: 'organizational' },
  { control_id: 'SEC-6', title: 'Prompt Injection and Input Validation Controls',    description: 'Implement input validation, sanitization, and context isolation to prevent prompt injection attacks that could manipulate agent behavior, exfiltrate data, or cause agents to perform unauthorized actions.',                                                     priority: '1', control_type: 'technical' },

  // ── Domain 3: Safety ──────────────────────────────────────────────────────
  { control_id: 'SAF-1', title: 'Scenario-Based Safety Validation',                  description: 'Design and execute scenario-based safety tests that simulate real-world and adversarial conditions to validate that AI agents behave safely across a broad range of operational contexts. Test results must be reviewed and signed off prior to production deployment.', priority: '1', control_type: 'technical' },
  { control_id: 'SAF-2', title: 'Fail-Safe Mechanisms and Circuit Breakers',         description: 'Implement fail-safe mechanisms including circuit breakers, rate limiters, and automatic shutoffs that halt or constrain agent actions when anomalies, threshold violations, or safety conditions are detected.',                                                   priority: '1', control_type: 'technical' },
  { control_id: 'SAF-3', title: 'Policy Enforcement and Agent Action Boundaries',    description: 'Define and enforce explicit action boundary policies that specify what AI agents are permitted and prohibited from doing. Policy violations must trigger alerts and be logged for review.',                                                                        priority: '1', control_type: 'policy' },
  { control_id: 'SAF-4', title: 'Unintended Outcome Prevention and Monitoring',      description: 'Implement controls to detect and prevent unintended or harmful agent outcomes. Monitor agent outputs and downstream effects in production, with automated alerting for deviations from expected behavior.',                                                       priority: '1', control_type: 'technical' },
  { control_id: 'SAF-5', title: 'Continuous Safety Testing and Re-Validation',       description: 'Conduct safety testing at least quarterly and after any material change to the AI agent, its tools, or its operating environment. Maintain a documented safety testing schedule and track remediation of identified issues.',                                        priority: '2', control_type: 'organizational' },

  // ── Domain 4: Reliability ─────────────────────────────────────────────────
  { control_id: 'REL-1', title: 'Agent Consistency and Predictability',               description: 'Validate that AI agents produce consistent and predictable outputs for equivalent inputs under normal operating conditions. Define and measure acceptable variance thresholds and investigate significant deviations.',                                           priority: '1', control_type: 'technical' },
  { control_id: 'REL-2', title: 'Error Handling and Graceful Recovery',               description: 'Implement robust error handling that enables AI agents to detect failures, escalate appropriately to human operators, and recover to a known safe state without causing downstream harm or data loss.',                                                             priority: '1', control_type: 'technical' },
  { control_id: 'REL-3', title: 'Agent Self-Monitoring and Anomaly Detection',        description: 'Instrument AI agents with self-monitoring capabilities to detect and report performance degradation, unexpected behavior, or resource exhaustion in real time. Integrate monitoring with organizational alerting systems.',                                          priority: '1', control_type: 'technical' },
  { control_id: 'REL-4', title: 'Uptime, Availability, and SLA Controls',             description: 'Define uptime and availability targets for AI agent services and implement the infrastructure, redundancy, and operational controls needed to meet them. Track SLA compliance and report deviations.',                                                              priority: '2', control_type: 'organizational' },
  { control_id: 'REL-5', title: 'Performance Baseline and Drift Detection',           description: 'Establish performance baselines for AI agents and implement automated drift detection that triggers review when agent performance degrades below defined thresholds. Maintain historical performance records to support trend analysis.',                             priority: '2', control_type: 'technical' },

  // ── Domain 5: Accountability ──────────────────────────────────────────────
  { control_id: 'ACC-1', title: 'Tamper-Evident Audit Trails for Agent Actions',      description: 'Capture comprehensive, tamper-evident logs of all AI agent decisions, tool invocations, API calls, and state changes. Audit trails must be irrefutable and sufficient to reconstruct the complete sequence of agent actions after the fact.',                      priority: '1', control_type: 'technical' },
  { control_id: 'ACC-2', title: 'Visual Documentation and Action Replay',             description: 'Maintain visual documentation of high-impact or irreversible agent actions, such as screenshots, session recordings, or replay artifacts, to support post-incident forensics and regulatory review.',                                                               priority: '1', control_type: 'organizational' },
  { control_id: 'ACC-3', title: 'Human Oversight and Intervention Mechanisms',        description: 'Provide mechanisms for authorized human operators to monitor, pause, modify, or terminate AI agent operations in real time. Human oversight controls must be functional at all times and tested regularly.',                                                        priority: '1', control_type: 'organizational' },
  { control_id: 'ACC-4', title: 'Incident Investigation and Root Cause Analysis',     description: 'Establish a formal process for investigating AI agent incidents and near-misses. Document root causes, contributing factors, and corrective actions. Share learnings to improve agent safety and governance.',                                                       priority: '1', control_type: 'organizational' },
  { control_id: 'ACC-5', title: 'Remediation Verification for Critical Vulnerabilities', description: 'Require formal remediation and independent retest of all critical (P0) and high-severity (P1) vulnerabilities before AIUC-1 certification is issued or renewed. Maintain evidence of remediation and retest results.',                                          priority: '1', control_type: 'organizational' },

  // ── Domain 6: Societal Impact ─────────────────────────────────────────────
  { control_id: 'SOC-1', title: 'Legal and Regulatory Compliance for AI Agents',     description: 'Confirm that AI agent deployments satisfy applicable laws and AI governance frameworks (EU AI Act, NIST AI RMF, ISO 42001). Conduct legal compliance reviews before deployment and maintain an up-to-date regulatory mapping.', priority: '1', control_type: 'policy' }, // ip-hygiene:ignore
  { control_id: 'SOC-2', title: 'Ethical Guidelines and Code of Conduct for AI',     description: 'Establish and enforce a documented code of conduct governing AI agent behavior that aligns with organizational values, applicable ethical frameworks, and human rights principles. Review and update the code of conduct annually.',                                priority: '1', control_type: 'policy' },
  { control_id: 'SOC-3', title: 'Bias and Fairness Assessment for AI Agents',        description: 'Conduct bias and fairness assessments for AI agents that interact with or make decisions affecting people. Document assessment methodology, results, and mitigations. Reassess after material model changes.',                                                     priority: '1', control_type: 'strategic' },
  { control_id: 'SOC-4', title: 'Transparency and Public Disclosure',                description: 'Disclose to affected users and the public that AI agents are in use, including the nature and scope of autonomous decision-making. Provide mechanisms for individuals to seek human review of AI-driven decisions.',                                                priority: '1', control_type: 'policy' },
  { control_id: 'SOC-5', title: 'Societal and Environmental Impact Assessment',      description: 'Evaluate the broader societal and environmental impacts of AI agent deployments, including effects on employment, equity, and sustainability. Document assessments and integrate findings into governance decision-making.',                                        priority: '2', control_type: 'strategic' },
]);

/**
 * Full crosswalk mappings for seed-aiuc1-framework.js (85+ pairs).
 * Maps AIUC-1 controls → NIST AI RMF, EU AI Act, ISO 42001, and OWASP Agentic AI Top 10.
 */
const AIUC1_CROSSWALKS = Object.freeze([
  // Data & Privacy
  { source: 'DP-1', target_framework: 'nist_ai_rmf',        target_id: 'MAP-1',      score: 82, type: 'related' },
  { source: 'DP-1', target_framework: 'eu_ai_act',           target_id: 'AIA-Art10',  score: 88, type: 'related' },
  { source: 'DP-1', target_framework: 'iso_42001',           target_id: 'ISO42-8.4',  score: 80, type: 'related' },
  { source: 'DP-2', target_framework: 'nist_ai_rmf',        target_id: 'GOVERN-2',   score: 85, type: 'related' },
  { source: 'DP-2', target_framework: 'eu_ai_act',           target_id: 'AIA-Art10',  score: 85, type: 'related' },
  { source: 'DP-2', target_framework: 'owasp_agentic_top10', target_id: 'AGENT01',    score: 88, type: 'related' },
  { source: 'DP-3', target_framework: 'eu_ai_act',           target_id: 'AIA-Art10',  score: 90, type: 'equivalent' },
  { source: 'DP-3', target_framework: 'iso_42001',           target_id: 'ISO42-8.4',  score: 82, type: 'related' },
  { source: 'DP-4', target_framework: 'eu_ai_act',           target_id: 'AIA-Art15',  score: 85, type: 'related' },
  { source: 'DP-4', target_framework: 'nist_ai_rmf',        target_id: 'MEASURE-2',  score: 80, type: 'related' },
  { source: 'DP-5', target_framework: 'eu_ai_act',           target_id: 'AIA-Art10',  score: 88, type: 'related' },
  { source: 'DP-5', target_framework: 'iso_42001',           target_id: 'ISO42-8.2',  score: 78, type: 'related' },
  { source: 'DP-6', target_framework: 'eu_ai_act',           target_id: 'AIA-Art12',  score: 80, type: 'related' },
  { source: 'DP-6', target_framework: 'iso_42001',           target_id: 'ISO42-8.1',  score: 75, type: 'related' },

  // Security
  { source: 'SEC-1', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-2',  score: 92, type: 'equivalent' },
  { source: 'SEC-1', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 88, type: 'related' },
  { source: 'SEC-1', target_framework: 'iso_42001',          target_id: 'ISO42-8.2',  score: 85, type: 'related' },
  { source: 'SEC-2', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-2',   score: 88, type: 'related' },
  { source: 'SEC-2', target_framework: 'eu_ai_act',          target_id: 'AIA-Art14',  score: 82, type: 'related' },
  { source: 'SEC-2', target_framework: 'owasp_agentic_top10', target_id: 'AGENT01',   score: 95, type: 'equivalent' },
  { source: 'SEC-2', target_framework: 'owasp_agentic_top10', target_id: 'AGENT02',   score: 90, type: 'equivalent' },
  { source: 'SEC-3', target_framework: 'eu_ai_act',          target_id: 'AIA-Art15',  score: 90, type: 'equivalent' },
  { source: 'SEC-3', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-2',  score: 85, type: 'related' },
  { source: 'SEC-4', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-5',   score: 80, type: 'related' },
  { source: 'SEC-4', target_framework: 'eu_ai_act',          target_id: 'AIA-Art17',  score: 82, type: 'related' },
  { source: 'SEC-4', target_framework: 'iso_42001',          target_id: 'ISO42-8.1',  score: 78, type: 'related' },
  { source: 'SEC-5', target_framework: 'nist_ai_rmf',       target_id: 'MANAGE-1',   score: 85, type: 'related' },
  { source: 'SEC-5', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 82, type: 'related' },
  { source: 'SEC-5', target_framework: 'iso_42001',          target_id: 'ISO42-6.1',  score: 80, type: 'related' },
  { source: 'SEC-6', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-2',  score: 88, type: 'related' },
  { source: 'SEC-6', target_framework: 'owasp_agentic_top10', target_id: 'AGENT04',   score: 95, type: 'equivalent' },

  // Safety
  { source: 'SAF-1', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-1',  score: 90, type: 'equivalent' },
  { source: 'SAF-1', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 88, type: 'related' },
  { source: 'SAF-1', target_framework: 'iso_42001',          target_id: 'ISO42-8.2',  score: 85, type: 'related' },
  { source: 'SAF-2', target_framework: 'nist_ai_rmf',       target_id: 'MANAGE-1',   score: 85, type: 'related' },
  { source: 'SAF-2', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 82, type: 'related' },
  { source: 'SAF-2', target_framework: 'owasp_agentic_top10', target_id: 'AGENT10',   score: 88, type: 'related' },
  { source: 'SAF-3', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-1',   score: 88, type: 'related' },
  { source: 'SAF-3', target_framework: 'eu_ai_act',          target_id: 'AIA-Art14',  score: 85, type: 'related' },
  { source: 'SAF-3', target_framework: 'owasp_agentic_top10', target_id: 'AGENT02',   score: 85, type: 'related' },
  { source: 'SAF-4', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-3',  score: 88, type: 'related' },
  { source: 'SAF-4', target_framework: 'eu_ai_act',          target_id: 'AIA-Art15',  score: 82, type: 'related' },
  { source: 'SAF-4', target_framework: 'iso_42001',          target_id: 'ISO42-9.1',  score: 80, type: 'related' },
  { source: 'SAF-5', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-4',  score: 85, type: 'related' },
  { source: 'SAF-5', target_framework: 'iso_42001',          target_id: 'ISO42-10.2', score: 82, type: 'related' },

  // Reliability
  { source: 'REL-1', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-2',  score: 85, type: 'related' },
  { source: 'REL-1', target_framework: 'eu_ai_act',          target_id: 'AIA-Art15',  score: 88, type: 'related' },
  { source: 'REL-1', target_framework: 'iso_42001',          target_id: 'ISO42-9.1',  score: 82, type: 'related' },
  { source: 'REL-2', target_framework: 'nist_ai_rmf',       target_id: 'MANAGE-3',   score: 82, type: 'related' },
  { source: 'REL-2', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 78, type: 'related' },
  { source: 'REL-2', target_framework: 'owasp_agentic_top10', target_id: 'AGENT10',   score: 85, type: 'related' },
  { source: 'REL-3', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-3',  score: 90, type: 'equivalent' },
  { source: 'REL-3', target_framework: 'eu_ai_act',          target_id: 'AIA-Art15',  score: 85, type: 'related' },
  { source: 'REL-3', target_framework: 'iso_42001',          target_id: 'ISO42-9.1',  score: 85, type: 'related' },
  { source: 'REL-4', target_framework: 'eu_ai_act',          target_id: 'AIA-Art15',  score: 78, type: 'related' },
  { source: 'REL-4', target_framework: 'iso_42001',          target_id: 'ISO42-8.1',  score: 75, type: 'related' },
  { source: 'REL-5', target_framework: 'nist_ai_rmf',       target_id: 'MEASURE-4',  score: 88, type: 'related' },
  { source: 'REL-5', target_framework: 'iso_42001',          target_id: 'ISO42-9.1',  score: 85, type: 'related' },

  // Accountability
  { source: 'ACC-1', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-1',   score: 88, type: 'related' },
  { source: 'ACC-1', target_framework: 'eu_ai_act',          target_id: 'AIA-Art12',  score: 95, type: 'equivalent' },
  { source: 'ACC-1', target_framework: 'iso_42001',          target_id: 'ISO42-9.2',  score: 85, type: 'related' },
  { source: 'ACC-1', target_framework: 'owasp_agentic_top10', target_id: 'AGENT09',   score: 92, type: 'equivalent' },
  { source: 'ACC-2', target_framework: 'eu_ai_act',          target_id: 'AIA-Art12',  score: 90, type: 'related' },
  { source: 'ACC-2', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-6',   score: 82, type: 'related' },
  { source: 'ACC-3', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-2',   score: 90, type: 'equivalent' },
  { source: 'ACC-3', target_framework: 'eu_ai_act',          target_id: 'AIA-Art14',  score: 95, type: 'equivalent' },
  { source: 'ACC-3', target_framework: 'iso_42001',          target_id: 'ISO42-5.1',  score: 85, type: 'related' },
  { source: 'ACC-3', target_framework: 'owasp_agentic_top10', target_id: 'AGENT05',   score: 95, type: 'equivalent' },
  { source: 'ACC-4', target_framework: 'nist_ai_rmf',       target_id: 'MANAGE-4',   score: 85, type: 'related' },
  { source: 'ACC-4', target_framework: 'iso_42001',          target_id: 'ISO42-10.1', score: 88, type: 'related' },
  { source: 'ACC-5', target_framework: 'nist_ai_rmf',       target_id: 'MANAGE-1',   score: 88, type: 'related' },
  { source: 'ACC-5', target_framework: 'eu_ai_act',          target_id: 'AIA-Art9',   score: 85, type: 'related' },
  { source: 'ACC-5', target_framework: 'iso_42001',          target_id: 'ISO42-10.1', score: 85, type: 'related' },

  // Societal Impact
  { source: 'SOC-1', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-1',   score: 85, type: 'related' },
  { source: 'SOC-1', target_framework: 'eu_ai_act',          target_id: 'AIA-Art52',  score: 88, type: 'related' },
  { source: 'SOC-1', target_framework: 'iso_42001',          target_id: 'ISO42-4.1',  score: 82, type: 'related' },
  { source: 'SOC-2', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-4',   score: 88, type: 'related' },
  { source: 'SOC-2', target_framework: 'eu_ai_act',          target_id: 'AIA-Art52',  score: 85, type: 'related' },
  { source: 'SOC-2', target_framework: 'iso_42001',          target_id: 'ISO42-5.2',  score: 82, type: 'related' },
  { source: 'SOC-3', target_framework: 'nist_ai_rmf',       target_id: 'MAP-5',      score: 88, type: 'related' },
  { source: 'SOC-3', target_framework: 'eu_ai_act',          target_id: 'AIA-Art10',  score: 82, type: 'related' },
  { source: 'SOC-3', target_framework: 'iso_42001',          target_id: 'ISO42-8.4',  score: 85, type: 'related' },
  { source: 'SOC-4', target_framework: 'nist_ai_rmf',       target_id: 'GOVERN-6',   score: 85, type: 'related' },
  { source: 'SOC-4', target_framework: 'eu_ai_act',          target_id: 'AIA-Art13',  score: 92, type: 'equivalent' },
  { source: 'SOC-4', target_framework: 'iso_42001',          target_id: 'ISO42-5.2',  score: 80, type: 'related' },
  { source: 'SOC-5', target_framework: 'nist_ai_rmf',       target_id: 'MAP-3',      score: 88, type: 'related' },
  { source: 'SOC-5', target_framework: 'eu_ai_act',          target_id: 'AIA-Art27',  score: 90, type: 'equivalent' },
  { source: 'SOC-5', target_framework: 'iso_42001',          target_id: 'ISO42-8.4',  score: 85, type: 'related' },
]);

module.exports = { AIUC1_FRAMEWORK, AIUC1_CONTROLS, AIUC1_CROSSWALKS };
