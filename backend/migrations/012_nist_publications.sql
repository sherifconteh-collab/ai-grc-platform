-- Migration 012: NIST Publications Guidance Library
-- Provides a curated catalog of NIST special publications and their
-- control mappings, enabling organizations to trace compliance
-- obligations back to authoritative NIST guidance documents.

-- NIST Publications catalog
CREATE TABLE IF NOT EXISTS nist_publications (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_code      VARCHAR(100) NOT NULL UNIQUE,  -- e.g. "SP 800-53 Rev 5"
  title                 TEXT NOT NULL,
  publication_family    VARCHAR(100) NOT NULL,          -- e.g. "SP 800 Series", "FIPS", "NISTIR"
  publication_type      VARCHAR(100) NOT NULL,          -- e.g. "Security Controls", "Risk Management"
  status                VARCHAR(20)  NOT NULL DEFAULT 'active', -- 'active' | 'withdrawn' | 'draft'
  summary               TEXT,
  primary_use_case      TEXT,
  recommended_for_private BOOLEAN NOT NULL DEFAULT FALSE,
  federal_focus         BOOLEAN NOT NULL DEFAULT FALSE,
  publication_url       TEXT,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Mappings from NIST publications to framework controls
CREATE TABLE IF NOT EXISTS nist_publication_control_mappings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id   UUID NOT NULL REFERENCES nist_publications(id) ON DELETE CASCADE,
  framework_code   VARCHAR(100) NOT NULL,
  control_id       VARCHAR(100) NOT NULL,
  mapping_strength VARCHAR(20)  NOT NULL DEFAULT 'informative', -- 'primary' | 'supporting' | 'informative'
  mapping_note     TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_nist_pub_mapping UNIQUE (publication_id, framework_code, control_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_nist_publications_status
  ON nist_publications(status);

CREATE INDEX IF NOT EXISTS idx_nist_publications_family
  ON nist_publications(publication_family);

CREATE INDEX IF NOT EXISTS idx_nist_publications_type
  ON nist_publications(publication_type);

CREATE INDEX IF NOT EXISTS idx_nist_pub_mappings_publication
  ON nist_publication_control_mappings(publication_id);

CREATE INDEX IF NOT EXISTS idx_nist_pub_mappings_framework
  ON nist_publication_control_mappings(framework_code);

-- ---------------------------------------------------------------
-- Seed: core NIST special publications used in GRC practice
-- ---------------------------------------------------------------
INSERT INTO nist_publications (
  publication_code, title, publication_family, publication_type,
  status, summary, primary_use_case,
  recommended_for_private, federal_focus, publication_url, sort_order
) VALUES
(
  'SP 800-53 Rev 5',
  'Security and Privacy Controls for Information Systems and Organizations',
  'SP 800 Series',
  'Security Controls',
  'active',
  'A comprehensive catalog of security and privacy controls for federal information systems and organizations. Provides a baseline of safeguards applicable across all sectors.',
  'Selecting and implementing security and privacy controls for information systems',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-53/rev-5/final',
  10
),
(
  'SP 800-171 Rev 2',
  'Protecting Controlled Unclassified Information in Nonfederal Systems and Organizations',
  'SP 800 Series',
  'Security Controls',
  'active',
  'Defines requirements for protecting Controlled Unclassified Information (CUI) in non-federal systems, widely used in defense supply chains (DFARS/CMMC compliance).',
  'DFARS/CMMC compliance for defense contractors handling CUI',
  TRUE, FALSE,
  'https://csrc.nist.gov/publications/detail/sp/800-171/rev-2/final',
  20
),
(
  'SP 800-37 Rev 2',
  'Risk Management Framework for Information Systems and Organizations',
  'SP 800 Series',
  'Risk Management',
  'active',
  'Describes the Risk Management Framework (RMF) — a seven-step process for integrating security and risk management activities into the system development life cycle.',
  'Implementing a structured risk management process for federal and non-federal systems',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-37/rev-2/final',
  30
),
(
  'SP 800-30 Rev 1',
  'Guide for Conducting Risk Assessments',
  'SP 800 Series',
  'Risk Management',
  'active',
  'Provides guidance for conducting risk assessments of federal information systems and organizations, amplifying the RMF risk assessment step.',
  'Conducting structured cybersecurity risk assessments',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-30/rev-1/final',
  40
),
(
  'SP 800-61 Rev 2',
  'Computer Security Incident Handling Guide',
  'SP 800 Series',
  'Incident Response',
  'active',
  'Assists organizations in establishing computer security incident response capabilities and handling incidents efficiently and effectively.',
  'Building and operating an incident response program',
  TRUE, FALSE,
  'https://csrc.nist.gov/publications/detail/sp/800-61/rev-2/final',
  50
),
(
  'SP 800-137',
  'Information Security Continuous Monitoring for Federal Information Systems and Organizations',
  'SP 800 Series',
  'Continuous Monitoring',
  'active',
  'Provides guidance for the development of a continuous monitoring strategy and implementation of a continuous monitoring program to maintain ongoing situational awareness.',
  'Implementing continuous monitoring of security controls',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-137/final',
  60
),
(
  'SP 800-39',
  'Managing Information Security Risk',
  'SP 800 Series',
  'Risk Management',
  'active',
  'Provides guidance for an integrated, organization-wide program for managing information security risk at multiple tiers: organization, mission/business process, and information system.',
  'Enterprise-wide information security risk management',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-39/final',
  70
),
(
  'SP 800-34 Rev 1',
  'Contingency Planning Guide for Federal Information Systems',
  'SP 800 Series',
  'Business Continuity',
  'active',
  'Provides instructions, recommendations, and considerations for government IT contingency planning covering business impact analysis, recovery strategies, and plan testing.',
  'Developing IT contingency and disaster recovery plans',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/sp/800-34/rev-1/final',
  80
),
(
  'SP 800-128',
  'Guide for Security-Focused Configuration Management of Information Systems',
  'SP 800 Series',
  'Configuration Management',
  'active',
  'Provides guidelines for organizations responsible for managing and administering the security aspects of configuration management processes for information systems.',
  'Security configuration management and baselining',
  TRUE, FALSE,
  'https://csrc.nist.gov/publications/detail/sp/800-128/final',
  90
),
(
  'FIPS 200',
  'Minimum Security Requirements for Federal Information and Information Systems',
  'FIPS',
  'Security Controls',
  'active',
  'Specifies minimum security requirements for federal information and information systems using a risk-based approach, complementing SP 800-53.',
  'Establishing minimum federal security baselines',
  FALSE, TRUE,
  'https://csrc.nist.gov/publications/detail/fips/200/final',
  100
),
(
  'FIPS 140-3',
  'Security Requirements for Cryptographic Modules',
  'FIPS',
  'Cryptography',
  'active',
  'Specifies security requirements for cryptographic modules used to protect sensitive but unclassified information in computer and telecommunication systems.',
  'Selecting and validating cryptographic modules',
  TRUE, TRUE,
  'https://csrc.nist.gov/publications/detail/fips/140/3/final',
  110
),
(
  'SP 800-218',
  'Secure Software Development Framework (SSDF) Version 1.1',
  'SP 800 Series',
  'Secure Development',
  'active',
  'Recommends a core set of high-level secure software development practices that can be integrated into each SDLC implementation to help reduce the number of vulnerabilities in released software.',
  'Integrating secure development practices into the SDLC',
  TRUE, FALSE,
  'https://csrc.nist.gov/publications/detail/sp/800-218/final',
  120
)
ON CONFLICT (publication_code) DO NOTHING;

SELECT 'Migration 012 completed.' AS result;
