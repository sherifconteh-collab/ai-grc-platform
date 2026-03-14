-- Migration 026: Expand NIST publication library to 50+ and map publications to controls/tasks
-- Keeps NIST optional for private organizations while adding direct, clickable guidance mapping.

CREATE TABLE IF NOT EXISTS nist_publication_control_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_id UUID NOT NULL REFERENCES nist_publications(id) ON DELETE CASCADE,
    framework_code VARCHAR(100) NOT NULL,
    control_id VARCHAR(120) NOT NULL,
    mapping_strength VARCHAR(20) NOT NULL DEFAULT 'informative',
    mapping_note TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (publication_id, framework_code, control_id)
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'nist_publication_control_mappings_strength_valid'
    ) THEN
        ALTER TABLE nist_publication_control_mappings
            ADD CONSTRAINT nist_publication_control_mappings_strength_valid
            CHECK (mapping_strength IN ('primary', 'supporting', 'informative'));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_nist_pub_control_map_publication
ON nist_publication_control_mappings (publication_id);

CREATE INDEX IF NOT EXISTS idx_nist_pub_control_map_framework
ON nist_publication_control_mappings (framework_code, control_id);

INSERT INTO nist_publications (
    publication_code,
    title,
    publication_family,
    publication_type,
    summary,
    primary_use_case,
    recommended_for_private,
    federal_focus,
    publication_url,
    sort_order
) VALUES
    ('SP 800-12 Rev.1', 'An Introduction to Information Security', 'Foundations', 'SP', 'Foundational information security concepts and lifecycle basics.', 'Program onboarding and foundational security orientation.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-12/rev-1/final', 380),
    ('SP 800-14', 'Generally Accepted Principles and Practices for Securing Information Technology Systems', 'Foundations', 'SP', 'Baseline principles and practices for system security programs.', 'Security policy and practice baseline design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-14/final', 390),
    ('SP 800-34 Rev.1', 'Contingency Planning Guide for Federal Information Systems', 'Operations', 'SP', 'Planning and testing guidance for continuity and disaster recovery.', 'Business continuity and disaster recovery program design.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-34/rev-1/final', 400),
    ('SP 800-40 Rev.4', 'Guide to Enterprise Patch Management Planning', 'Operations', 'SP', 'Enterprise patch management strategy and execution guidance.', 'Vulnerability and patch remediation governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-40/rev-4/final', 410),
    ('SP 800-41 Rev.1', 'Guidelines on Firewalls and Firewall Policy', 'Network Security', 'SP', 'Firewall architecture, deployment, and policy guidance.', 'Boundary and network segmentation governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-41/rev-1/final', 420),
    ('SP 800-44 Ver.2', 'Guidelines on Securing Public Web Servers', 'Application Security', 'SP', 'Security hardening guidance for internet-facing web servers.', 'Web server baseline hardening and operations.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-44/version-2/final', 430),
    ('SP 800-46 Rev.2', 'Guide to Enterprise Telework, Remote Access, and BYOD Security', 'Operations', 'SP', 'Security controls for telework, remote access, and bring-your-own-device usage.', 'Remote workforce and endpoint access security.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-46/rev-2/final', 440),
    ('SP 800-50', 'Building an Information Technology Security Awareness and Training Program', 'Workforce', 'SP', 'Framework for awareness and role-based training programs.', 'Security awareness program development and measurement.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-50/final', 450),
    ('SP 800-53B', 'Control Baselines for Information Systems and Organizations', 'Control Catalogs', 'SP', 'Predefined security and privacy control baselines by impact level.', 'Control baseline selection and tailoring.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-53b/final', 460),
    ('SP 800-66 Rev.2', 'Implementing the HIPAA Security Rule: A Cybersecurity Resource Guide', 'Privacy', 'SP', 'Resource guide for applying security practices to HIPAA safeguards.', 'Healthcare security rule implementation support.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-66/rev-2/final', 470), -- ip-hygiene:ignore
    ('SP 800-70 Rev.4', 'National Checklist Program for IT Products: Guidelines for Checklist Users and Developers', 'Operations', 'SP', 'Guidance on secure configuration checklists for IT products.', 'Baseline checklist and secure configuration governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-70/rev-4/final', 480),
    ('SP 800-81-2', 'Secure Domain Name System (DNS) Deployment Guide', 'Network Security', 'SP', 'Guidance for secure DNS deployment and hardening.', 'DNS integrity and secure resolution architecture.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-81/2/final', 490),
    ('SP 800-83 Rev.1', 'Guide to Malware Incident Prevention and Handling for Desktops and Laptops', 'Operations', 'SP', 'Malware prevention, detection, and incident handling practices.', 'Endpoint malware resilience and response.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-83/rev-1/final', 500),
    ('SP 800-88 Rev.1', 'Guidelines for Media Sanitization', 'Data Protection', 'SP', 'Methods for secure media sanitization and disposal decisions.', 'Data remanence risk reduction and secure disposal.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-88/rev-1/final', 510),
    ('SP 800-100', 'Information Security Handbook: A Guide for Managers', 'Foundations', 'SP', 'Management-focused guidance for building enterprise security programs.', 'Security governance program management.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-100/final', 520),
    ('SP 800-111', 'Guide to Storage Encryption Technologies for End User Devices', 'Data Protection', 'SP', 'Practical guidance on storage encryption selection and deployment.', 'Data-at-rest protection for endpoints and devices.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-111/final', 530),
    ('SP 800-124 Rev.2', 'Guidelines for Managing the Security of Mobile Devices in the Enterprise', 'Operations', 'SP', 'Security controls for enterprise mobile device management.', 'Mobile endpoint governance and policy enforcement.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-124/rev-2/final', 540),
    ('SP 800-125A', 'Security Recommendations for Hypervisor Deployment', 'Cloud', 'SP', 'Hardening and management guidance for hypervisor security.', 'Virtualization security baseline deployment.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-125a/final', 550),
    ('SP 800-146', 'Cloud Computing Synopsis and Recommendations', 'Cloud', 'SP', 'Cloud adoption, risk, and control recommendations.', 'Cloud risk governance and architecture planning.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-146/final', 560),
    ('SP 800-154', 'Guide to Data-Centric System Threat Modeling', 'Risk Assessment', 'SP', 'Threat modeling guidance focused on data-centric systems.', 'Data-focused threat analysis and architecture decisions.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-154/final', 570),
    ('SP 800-161 Rev.1', 'Cybersecurity Supply Chain Risk Management Practices for Systems and Organizations', 'Software Supply Chain', 'SP', 'Comprehensive SCRM practices for enterprise and mission systems.', 'Supplier and third-party cybersecurity risk governance.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-161/rev-1/final', 580),
    ('SP 800-162', 'Guide to Attribute Based Access Control (ABAC) Definition and Considerations', 'Identity', 'SP', 'ABAC concepts and implementation considerations for access decisions.', 'Fine-grained, context-aware authorization design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-162/final', 590),
    ('SP 800-184', 'Guide for Cybersecurity Event Recovery', 'Operations', 'SP', 'Recovery planning and execution guidance after cyber events.', 'Operational restoration and service recovery governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-184/final', 600),
    ('SP 800-193', 'Platform Firmware Resiliency Guidelines', 'Platform Security', 'SP', 'Guidance on platform firmware protection, detection, and recovery.', 'Firmware integrity and platform resiliency control design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-193/final', 610),
    ('SP 800-213', 'IoT Device Cybersecurity Guidance for the Federal Government', 'IoT', 'SP', 'Guidance for evaluating and managing IoT cybersecurity requirements.', 'IoT procurement and lifecycle security governance.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-213/final', 620)
ON CONFLICT (publication_code) DO UPDATE SET
    title = EXCLUDED.title,
    publication_family = EXCLUDED.publication_family,
    publication_type = EXCLUDED.publication_type,
    summary = EXCLUDED.summary,
    primary_use_case = EXCLUDED.primary_use_case,
    recommended_for_private = EXCLUDED.recommended_for_private,
    federal_focus = EXCLUDED.federal_focus,
    publication_url = EXCLUDED.publication_url,
    sort_order = EXCLUDED.sort_order,
    status = EXCLUDED.status;

WITH mapping_seed (publication_code, framework_code, control_id, mapping_strength, mapping_note, sort_order) AS (
    VALUES
        ('FIPS 199', 'nist_800_53', 'RA-2', 'primary', 'CIA impact categorization baseline.', 10),
        ('FIPS 200', 'nist_800_53', 'AC-2', 'primary', 'Minimum security requirement baseline alignment.', 10),
        ('SP 800-18 Rev.1', 'nist_csf_2.0', 'GV.PO-01', 'primary', 'System security planning and policy structure.', 10),
        ('SP 800-37 Rev.2', 'nist_csf_2.0', 'GV.RM-01', 'primary', 'RMF lifecycle governance and monitoring.', 10),
        ('SP 800-39', 'nist_800_53', 'RA-3', 'primary', 'Organization-wide risk management integration.', 10),
        ('SP 800-30 Rev.1', 'nist_csf_2.0', 'ID.RA-01', 'primary', 'Threat and vulnerability-based risk assessment.', 10),
        ('SP 800-53 Rev.5', 'nist_800_53', 'AC-2', 'primary', 'Security and privacy control catalog anchor.', 10),
        ('SP 800-53 Rev.5', 'nist_800_53', 'SI-4', 'supporting', 'Continuous monitoring controls within baseline.', 20),
        ('SP 800-53A Rev.5', 'nist_800_53', 'AU-2', 'primary', 'Assessment procedure anchor for control testing.', 10),
        ('SP 800-53A Rev.5', 'nist_800_53', 'RA-5', 'supporting', 'Technical control test depth and validation.', 20),
        ('SP 800-60 Vol.1 Rev.1', 'nist_800_53', 'RA-2', 'primary', 'Information type to impact mapping.', 10),
        ('SP 800-61 Rev.2', 'nist_800_53', 'IR-4', 'primary', 'Incident handling process alignment.', 10),
        ('SP 800-61 Rev.2', 'nist_csf_2.0', 'RS.MA-01', 'supporting', 'Operational incident management execution.', 20),
        ('SP 800-63-3', 'nist_800_53', 'IA-2', 'primary', 'Identity assurance and authentication strength.', 10),
        ('SP 800-63-3', 'nist_800_53', 'IA-5', 'supporting', 'Authenticator lifecycle management alignment.', 20),
        ('SP 800-64 Rev.2', 'iso_27001', 'A.8.25', 'primary', 'Security activities embedded in SDLC phases.', 10),
        ('SP 800-92', 'nist_800_53', 'AU-2', 'primary', 'Log management and event capture program.', 10),
        ('SP 800-92', 'iso_27001', 'A.8.15', 'supporting', 'Logging implementation and retention practices.', 20),
        ('SP 800-115', 'nist_800_53', 'RA-5', 'primary', 'Technical security testing and validation.', 10),
        ('SP 800-122', 'nist_privacy', 'PR-P.01', 'primary', 'PII protection safeguards and handling.', 10),
        ('SP 800-128', 'nist_800_53', 'CM-2', 'primary', 'Configuration baselines and drift control.', 10),
        ('SP 800-128', 'nist_800_53', 'CM-3', 'supporting', 'Configuration change governance workflow.', 20),
        ('SP 800-137', 'nist_csf_2.0', 'DE.CM-01', 'primary', 'Continuous monitoring capability design.', 10),
        ('SP 800-137', 'nist_800_53', 'SI-4', 'supporting', 'System monitoring implementation alignment.', 20),
        ('SP 800-145', 'iso_27001', 'A.5.23', 'supporting', 'Cloud service governance context.', 10),
        ('SP 800-160 Vol.1 Rev.1', 'nist_csf_2.0', 'GV.OC-01', 'primary', 'System context and engineering lifecycle framing.', 10),
        ('SP 800-160 Vol.2', 'nist_800_53', 'CP-2', 'primary', 'Cyber resiliency strategy and planning.', 10),
        ('SP 800-171 Rev.3', 'nist_800_171', '03.01.01', 'primary', 'CUI account and access safeguarding baseline.', 10),
        ('SP 800-171A Rev.3', 'nist_800_171', '03.12.01', 'primary', 'Assessment procedures for CUI requirements.', 10),
        ('SP 800-172', 'nist_800_171', '03.14.06', 'primary', 'Enhanced monitoring for high-value CUI systems.', 10),
        ('SP 800-190', 'nist_csf_2.0', 'PR.PS-01', 'primary', 'Container platform hardening and runtime protections.', 10),
        ('SP 800-204A', 'nist_800_53', 'SC-7', 'supporting', 'Service mesh boundary and traffic protections.', 10),
        ('SP 800-207', 'nist_800_207', 'ZTA-1', 'primary', 'Zero trust resource identification and policy context.', 10),
        ('SP 800-207', 'nist_800_207', 'ZTA-11', 'supporting', 'Strong authentication in zero trust access.', 20),
        ('SP 800-207A', 'nist_800_207', 'ZTA-4', 'primary', 'Policy decision point implementation in cloud-native environments.', 10),
        ('SP 800-218', 'iso_27001', 'A.8.25', 'primary', 'Secure software development lifecycle controls.', 10),
        ('SP 800-218', 'iso_27001', 'A.8.28', 'supporting', 'Secure coding and code quality controls.', 20),
        ('IR 8259', 'nist_csf_2.0', 'ID.AM-01', 'supporting', 'IoT asset and component inventory visibility.', 10),
        ('IR 8278', 'nist_csf_2.0', 'GV.SC-01', 'primary', 'Cyber supply chain risk governance practices.', 10),
        ('SP 1800-5', 'nist_csf_2.0', 'ID.AM-01', 'primary', 'Operational IT asset management implementation.', 10),
        ('NIST CSF 2.0', 'nist_csf_2.0', 'GV.RM-01', 'primary', 'CSF governance and risk management foundation.', 10),
        ('NIST Privacy Framework 1.0', 'nist_privacy', 'GV-P.03', 'primary', 'Privacy risk strategy and governance outcomes.', 10),
        ('NIST AI RMF 1.0', 'nist_ai_rmf', 'GOVERN-1', 'primary', 'Trustworthy AI governance foundation.', 10),
        ('NIST AI RMF 1.0', 'nist_ai_rmf', 'MANAGE-1', 'supporting', 'AI risk treatment and response planning.', 20),
        ('AI RMF Playbook', 'nist_ai_rmf', 'MAP-1', 'primary', 'Operational AI context and mapping actions.', 10),
        ('AI RMF Playbook', 'nist_ai_rmf', 'MEASURE-1', 'supporting', 'AI measurement and monitoring task patterns.', 20),
        ('SP 800-226', 'nist_privacy', 'PR-P.01', 'supporting', 'Differential privacy guardrail design and validation.', 10),
        ('SP 800-55 Rev.1', 'nist_csf_2.0', 'GV.RM-01', 'supporting', 'Program measurement and KPI governance.', 10),

        ('SP 800-12 Rev.1', 'nist_csf_2.0', 'GV.PO-01', 'supporting', 'Foundational policy and control vocabulary.', 10),
        ('SP 800-14', 'nist_800_53', 'AC-1', 'supporting', 'Security principles translated into policy requirements.', 10),
        ('SP 800-34 Rev.1', 'nist_800_53', 'CP-2', 'primary', 'Contingency planning and continuity governance.', 10),
        ('SP 800-34 Rev.1', 'nist_800_53', 'CP-9', 'supporting', 'Backup and recovery readiness activities.', 20),
        ('SP 800-40 Rev.4', 'nist_800_53', 'SI-2', 'primary', 'Patch and flaw remediation lifecycle.', 10),
        ('SP 800-40 Rev.4', 'nist_800_53', 'RA-5', 'supporting', 'Vulnerability discovery and risk-driven prioritization.', 20),
        ('SP 800-41 Rev.1', 'nist_800_53', 'SC-7', 'supporting', 'Boundary protection through firewall policy.', 10),
        ('SP 800-44 Ver.2', 'nist_800_53', 'SC-7', 'supporting', 'Public web server security hardening.', 10),
        ('SP 800-46 Rev.2', 'nist_800_53', 'AC-17', 'primary', 'Remote access policy and technical safeguards.', 10),
        ('SP 800-46 Rev.2', 'nist_800_53', 'IA-2', 'supporting', 'Strong authentication for remote sessions.', 20),
        ('SP 800-50', 'nist_800_53', 'AT-2', 'primary', 'Security awareness and training program governance.', 10),
        ('SP 800-50', 'iso_27001', 'A.6.3', 'supporting', 'Workforce awareness and refresher training outcomes.', 20),
        ('SP 800-53B', 'nist_800_53', 'RA-3', 'primary', 'Baseline tailoring and control selection context.', 10),
        ('SP 800-66 Rev.2', 'hipaa', 'HIPAA-164.312(a)(1)', 'primary', 'HIPAA access safeguard implementation support.', 10),
        ('SP 800-66 Rev.2', 'hipaa', 'HIPAA-164.308(a)(1)', 'supporting', 'Healthcare security management process alignment.', 20),
        ('SP 800-70 Rev.4', 'nist_800_53', 'CM-6', 'supporting', 'Configuration checklist and benchmark governance.', 10),
        ('SP 800-81-2', 'nist_800_53', 'SC-13', 'supporting', 'DNS integrity and cryptographic protections.', 10),
        ('SP 800-83 Rev.1', 'nist_800_53', 'SI-3', 'supporting', 'Malware prevention and handling lifecycle.', 10),
        ('SP 800-88 Rev.1', 'iso_27001', 'A.8.10', 'primary', 'Secure deletion and media sanitization evidence.', 10),
        ('SP 800-88 Rev.1', 'nist_800_53', 'SI-2', 'supporting', 'Data sanitization tied to lifecycle remediation.', 20),
        ('SP 800-100', 'nist_csf_2.0', 'GV.RR-01', 'supporting', 'Leadership accountability in security governance.', 10),
        ('SP 800-111', 'nist_800_53', 'SC-13', 'primary', 'Storage encryption implementation guidance.', 10),
        ('SP 800-111', 'nist_csf_2.0', 'PR.DS-01', 'supporting', 'Data-at-rest protection outcomes.', 20),
        ('SP 800-124 Rev.2', 'nist_800_53', 'AC-17', 'supporting', 'Mobile device remote access controls.', 10),
        ('SP 800-124 Rev.2', 'nist_800_53', 'SI-4', 'supporting', 'Mobile telemetry and continuous monitoring.', 20),
        ('SP 800-125A', 'nist_800_53', 'CM-6', 'supporting', 'Virtualization hardening and secure defaults.', 10),
        ('SP 800-146', 'iso_27001', 'A.5.23', 'supporting', 'Cloud service governance and due diligence.', 10),
        ('SP 800-154', 'nist_csf_2.0', 'ID.RA-03', 'supporting', 'Data-centric threat model and risk identification.', 10),
        ('SP 800-161 Rev.1', 'nist_csf_2.0', 'GV.SC-01', 'primary', 'Enterprise supply chain risk governance.', 10),
        ('SP 800-161 Rev.1', 'nerc_cip', 'CIP-013-2', 'supporting', 'Supplier risk controls for critical infrastructure.', 20),
        ('SP 800-162', 'nist_800_53', 'AC-3', 'supporting', 'Attribute-based authorization patterns.', 10),
        ('SP 800-162', 'nist_800_207', 'ZTA-3', 'supporting', 'Fine-grained policy decisions in zero trust.', 20),
        ('SP 800-184', 'nist_800_53', 'CP-10', 'primary', 'Cyber event recovery and restoration actions.', 10),
        ('SP 800-184', 'nist_csf_2.0', 'RC.RP-01', 'supporting', 'Recovery plan execution and validation.', 20),
        ('SP 800-193', 'nist_800_53', 'SI-2', 'supporting', 'Firmware integrity and corrective action workflow.', 10),
        ('SP 800-213', 'nist_csf_2.0', 'ID.AM-01', 'supporting', 'IoT asset identification and lifecycle control.', 10)
)
INSERT INTO nist_publication_control_mappings (
    publication_id,
    framework_code,
    control_id,
    mapping_strength,
    mapping_note,
    sort_order
)
SELECT
    np.id,
    ms.framework_code,
    ms.control_id,
    ms.mapping_strength,
    ms.mapping_note,
    ms.sort_order
FROM mapping_seed ms
JOIN nist_publications np
  ON np.publication_code = ms.publication_code
ON CONFLICT (publication_id, framework_code, control_id) DO UPDATE SET
    mapping_strength = EXCLUDED.mapping_strength,
    mapping_note = EXCLUDED.mapping_note,
    sort_order = EXCLUDED.sort_order;

-- Ensure every active publication has at least one control mapping.
INSERT INTO nist_publication_control_mappings (
    publication_id,
    framework_code,
    control_id,
    mapping_strength,
    mapping_note,
    sort_order
)
SELECT
    np.id,
    'nist_csf_2.0'::VARCHAR(100),
    'GV.RM-01'::VARCHAR(120),
    'informative'::VARCHAR(20),
    'Default governance mapping for publications without a curated control map.',
    999
FROM nist_publications np
WHERE np.status = 'active'
  AND NOT EXISTS (
      SELECT 1
      FROM nist_publication_control_mappings m
      WHERE m.publication_id = np.id
  )
ON CONFLICT (publication_id, framework_code, control_id) DO NOTHING;

COMMENT ON TABLE nist_publication_control_mappings IS 'Curated mapping from NIST publications to in-app framework controls for actionable implementation guidance.';
