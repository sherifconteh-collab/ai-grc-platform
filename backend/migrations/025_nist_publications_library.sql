-- Migration 025: NIST publications library + organization NIST posture controls
-- Adds a 30+ publication reference catalog and makes NIST usage explicitly optional for private organizations.

CREATE TABLE IF NOT EXISTS nist_publications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    publication_code VARCHAR(100) NOT NULL UNIQUE,
    title VARCHAR(500) NOT NULL,
    publication_family VARCHAR(120) NOT NULL,
    publication_type VARCHAR(40) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'active',
    summary TEXT,
    primary_use_case TEXT,
    recommended_for_private BOOLEAN NOT NULL DEFAULT TRUE,
    federal_focus BOOLEAN NOT NULL DEFAULT FALSE,
    publication_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_nist_publications_family
ON nist_publications (publication_family);

CREATE INDEX IF NOT EXISTS idx_nist_publications_type
ON nist_publications (publication_type);

CREATE INDEX IF NOT EXISTS idx_nist_publications_private
ON nist_publications (recommended_for_private);

ALTER TABLE organization_profiles
    ADD COLUMN IF NOT EXISTS compliance_profile VARCHAR(30) NOT NULL DEFAULT 'private',
    ADD COLUMN IF NOT EXISTS nist_adoption_mode VARCHAR(20) NOT NULL DEFAULT 'best_practice',
    ADD COLUMN IF NOT EXISTS nist_notes TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'organization_profiles_compliance_profile_valid'
    ) THEN
        ALTER TABLE organization_profiles
            ADD CONSTRAINT organization_profiles_compliance_profile_valid
            CHECK (compliance_profile IN ('private', 'federal', 'hybrid'));
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'organization_profiles_nist_adoption_mode_valid'
    ) THEN
        ALTER TABLE organization_profiles
            ADD CONSTRAINT organization_profiles_nist_adoption_mode_valid
            CHECK (nist_adoption_mode IN ('best_practice', 'mandatory'));
    END IF;
END $$;

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
    ('FIPS 199', 'Standards for Security Categorization of Federal Information and Information Systems', 'RMF Core', 'FIPS', 'Defines confidentiality, integrity, and availability impact levels.', 'Security categorization baseline for systems and data.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/fips/199/final', 10),
    ('FIPS 200', 'Minimum Security Requirements for Federal Information and Information Systems', 'RMF Core', 'FIPS', 'Defines minimum security requirement families for federal systems.', 'Baseline security requirement selection.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/fips/200/final', 20),
    ('SP 800-18 Rev.1', 'Guide for Developing Security Plans for Federal Information Systems', 'RMF Core', 'SP', 'Security plan structure and documentation guidance.', 'System security planning and governance context capture.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-18/rev-1/final', 30),
    ('SP 800-37 Rev.2', 'Risk Management Framework for Information Systems and Organizations', 'RMF Core', 'SP', 'RMF lifecycle from Prepare through Monitor.', 'Enterprise risk lifecycle management.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-37/rev-2/final', 40),
    ('SP 800-39', 'Managing Information Security Risk', 'RMF Core', 'SP', 'Organization-wide information security risk management strategy.', 'Risk governance across mission/business/system tiers.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-39/final', 50),
    ('SP 800-30 Rev.1', 'Guide for Conducting Risk Assessments', 'Risk Assessment', 'SP', 'Practical method for threat, vulnerability, likelihood, and impact analysis.', 'Risk assessment methodology.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-30/rev-1/final', 60),
    ('SP 800-53 Rev.5', 'Security and Privacy Controls for Information Systems and Organizations', 'Control Catalogs', 'SP', 'Comprehensive security and privacy controls catalog.', 'Control implementation and compliance mapping.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final', 70),
    ('SP 800-53A Rev.5', 'Assessing Security and Privacy Controls', 'Control Catalogs', 'SP', 'Assessment procedures for control effectiveness.', 'Assessment planning and evidence-based validation.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-53a/rev-5/final', 80),
    ('SP 800-60 Vol.1 Rev.1', 'Guide for Mapping Types of Information and Information Systems to Security Categories', 'RMF Core', 'SP', 'Mapping guidance for FIPS 199 categorization decisions.', 'Support CIA impact categorization.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-60/vol-1-rev-1/final', 90),
    ('SP 800-61 Rev.2', 'Computer Security Incident Handling Guide', 'Operations', 'SP', 'Incident response lifecycle and playbooks.', 'Incident response operations and readiness.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final', 100),
    ('SP 800-63-3', 'Digital Identity Guidelines', 'Identity', 'SP', 'Digital identity, authenticator assurance, and federation guidance.', 'Identity proofing and authentication architecture.', TRUE, FALSE, 'https://pages.nist.gov/800-63-3/', 110),
    ('SP 800-64 Rev.2', 'Security Considerations in the System Development Life Cycle', 'Engineering & SDLC', 'SP', 'Security activities aligned to system lifecycle phases.', 'Embed security in development lifecycle.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-64/rev-2/final', 120),
    ('SP 800-92', 'Guide to Computer Security Log Management', 'Operations', 'SP', 'Log collection, retention, and analysis guidance.', 'Audit logging and SIEM program design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-92/final', 130),
    ('SP 800-115', 'Technical Guide to Information Security Testing and Assessment', 'Assessment', 'SP', 'Technical testing approach for security controls.', 'Pen test and technical assessment planning.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-115/final', 140),
    ('SP 800-122', 'Guide to Protecting the Confidentiality of PII', 'Privacy', 'SP', 'PII protection lifecycle and control guidance.', 'Privacy and PII safeguards implementation.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-122/final', 150),
    ('SP 800-128', 'Guide for Security-Focused Configuration Management', 'Operations', 'SP', 'Configuration management in support of system security.', 'Baseline control and change management.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-128/final', 160),
    ('SP 800-137', 'Information Security Continuous Monitoring (ISCM) for Federal Information Systems and Organizations', 'Operations', 'SP', 'Continuous monitoring strategy and metrics.', 'Continuous control monitoring program.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-137/final', 170),
    ('SP 800-145', 'The NIST Definition of Cloud Computing', 'Cloud', 'SP', 'Canonical cloud service and deployment model definitions.', 'Cloud architecture and governance baseline.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-145/final', 180),
    ('SP 800-160 Vol.1 Rev.1', 'Developing Cyber-Resilient Systems: A Systems Security Engineering Approach', 'Engineering & SDLC', 'SP', 'Security engineering principles across full system lifecycle.', 'Secure-by-design engineering for complex systems.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-160/vol-1-rev-1/final', 190),
    ('SP 800-160 Vol.2', 'Developing Cyber Resilient Systems: A Systems Security Engineering Approach (Cyber Resiliency Engineering)', 'Engineering & SDLC', 'SP', 'Cyber resiliency engineering methods and design goals.', 'Resiliency patterns and architecture decisions.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-160/vol-2/final', 200),
    ('SP 800-171 Rev.3', 'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations', 'Control Catalogs', 'SP', 'CUI protection requirements for nonfederal environments.', 'CUI safeguarding for contractors and suppliers.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-171/rev-3/final', 210),
    ('SP 800-171A Rev.3', 'Assessing Security Requirements for CUI', 'Assessment', 'SP', 'Assessment procedures for SP 800-171 requirements.', 'CUI assessment and audit readiness.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-171a/rev-3/final', 220),
    ('SP 800-172', 'Enhanced Security Requirements for Protecting CUI', 'Control Catalogs', 'SP', 'Enhanced safeguards for high-value CUI systems.', 'Advanced threat protection for sensitive environments.', TRUE, TRUE, 'https://csrc.nist.gov/publications/detail/sp/800-172/final', 230),
    ('SP 800-190', 'Application Container Security Guide', 'Cloud', 'SP', 'Container-specific security risks and control recommendations.', 'Container and Kubernetes security baselines.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-190/final', 240),
    ('SP 800-204A', 'Building Secure Microservices-based Applications Using Service-Mesh Architecture', 'Cloud', 'SP', 'Microservices security patterns using service mesh controls.', 'Cloud-native architecture security design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-204a/final', 250),
    ('SP 800-207', 'Zero Trust Architecture', 'Architecture Models', 'SP', 'Zero Trust principles and reference architecture patterns.', 'Identity-centric access and segmentation design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-207/final', 260),
    ('SP 800-207A', 'A Zero Trust Architecture Model for Access Control in Cloud-Native Applications in Multi-Location Environments', 'Architecture Models', 'SP', 'Applied ZTA model for cloud-native multi-location systems.', 'Practical ZTA architecture deployment patterns.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-207a/final', 270),
    ('SP 800-218', 'Secure Software Development Framework (SSDF)', 'Software Supply Chain', 'SP', 'Foundational secure software development practices.', 'DevSecOps and secure software lifecycle governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-218/final', 280),
    ('IR 8259', 'Foundational Cybersecurity Activities for IoT Device Manufacturers', 'IoT', 'IR', 'Baseline cybersecurity outcomes for IoT manufacturers.', 'IoT product security lifecycle governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/nistir/8259/final', 290),
    ('IR 8278', 'Key Practices in Cyber Supply Chain Risk Management', 'Software Supply Chain', 'IR', 'Supply chain risk management practices and governance priorities.', 'Third-party and supplier risk governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/nistir/8278/final', 300),
    ('SP 1800-5', 'IT Asset Management (ITAM) for U.S. Government', 'Operations', 'SP', 'Practical playbook for asset visibility and control.', 'CMDB and asset governance implementation.', TRUE, TRUE, 'https://www.nccoe.nist.gov/projects/building-blocks/itam', 310),
    ('NIST CSF 2.0', 'Cybersecurity Framework (CSF) 2.0', 'Framework Profiles', 'CSF', 'Outcomes-based cybersecurity framework for any sector.', 'Enterprise cybersecurity program management.', TRUE, FALSE, 'https://www.nist.gov/cyberframework', 320),
    ('NIST Privacy Framework 1.0', 'Privacy Framework: A Tool for Improving Privacy through Enterprise Risk Management', 'Framework Profiles', 'PF', 'Privacy risk management outcomes aligned to enterprise operations.', 'Privacy engineering and compliance governance.', TRUE, FALSE, 'https://www.nist.gov/privacy-framework', 330),
    ('NIST AI RMF 1.0', 'AI Risk Management Framework', 'AI Governance', 'RMF', 'Framework for trustworthy and governable AI systems.', 'AI governance, risk controls, and assurance planning.', TRUE, FALSE, 'https://www.nist.gov/itl/ai-risk-management-framework', 340),
    ('AI RMF Playbook', 'NIST AI RMF Playbook', 'AI Governance', 'Playbook', 'Implementation guidance and practical actions for AI RMF.', 'Operationalizing AI RMF functions.', TRUE, FALSE, 'https://airc.nist.gov/airmf-resources/playbook', 350),
    ('SP 800-226', 'Guidelines for Evaluating Differential Privacy Guarantees', 'Privacy', 'SP', 'Guidance for evaluating differential privacy in data sharing systems.', 'Privacy-preserving analytics governance.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-226/draft', 360),
    ('SP 800-55 Rev.1', 'Performance Measurement Guide for Information Security', 'Metrics', 'SP', 'Security measurement and metric program guidance.', 'Program effectiveness tracking and KPI design.', TRUE, FALSE, 'https://csrc.nist.gov/publications/detail/sp/800-55/rev-1/final', 370)
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

COMMENT ON TABLE nist_publications IS 'Reference library of NIST publications for optional best-practice adoption and federal alignment.';
