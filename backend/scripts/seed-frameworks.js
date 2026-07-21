// @tier: community
require('dotenv').config();
const { Pool } = require('pg');
const frameworks = require('./lib/frameworks/index');
const { verifyExpectedCounts } = require('./lib/frameworks/verifyCounts');
const { insertFramework, insertControl } = require('./lib/frameworkControlUpsert');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    });


async function seed() {
  verifyExpectedCounts(frameworks);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Clear existing data
    await client.query('DELETE FROM control_mappings');
    await client.query('DELETE FROM control_implementations');
    await client.query('DELETE FROM framework_controls');
    await client.query('DELETE FROM organization_frameworks');
    await client.query('DELETE FROM frameworks');

    let totalControls = 0;

    for (const fw of frameworks) {
      const frameworkId = await insertFramework(client, fw);

      for (const ctrl of fw.controls) {
        await insertControl(client, frameworkId, ctrl);
        totalControls++;
      }

      console.log(`  ${fw.code}: ${fw.controls.length} controls (${fw.tier_required} tier)`);
    }

    // Create some crosswalk mappings between common controls
    console.log('\nCreating crosswalk mappings...');
    const mappingPairs = [
      // NIST CSF <-> ISO 27001
      ['PR.AA-01', 'nist_csf_2.0', 'A.5.15', 'iso_27001', 95],
      ['PR.AA-02', 'nist_csf_2.0', 'A.5.17', 'iso_27001', 90],
      ['PR.DS-01', 'nist_csf_2.0', 'A.8.24', 'iso_27001', 85],
      ['DE.CM-01', 'nist_csf_2.0', 'A.8.16', 'iso_27001', 90],
      ['ID.AM-01', 'nist_csf_2.0', 'A.5.9', 'iso_27001', 95],
      ['RS.MA-01', 'nist_csf_2.0', 'A.5.24', 'iso_27001', 90],
      // NIST CSF <-> NIST 800-53
      ['PR.AA-01', 'nist_csf_2.0', 'AC-2', 'nist_800_53', 95],
      ['PR.AA-02', 'nist_csf_2.0', 'IA-2', 'nist_800_53', 95],
      ['DE.CM-01', 'nist_csf_2.0', 'SI-4', 'nist_800_53', 90],
      ['PR.DS-01', 'nist_csf_2.0', 'SC-13', 'nist_800_53', 85],
      ['RS.MA-01', 'nist_csf_2.0', 'IR-4', 'nist_800_53', 95],
      ['PR.IR-01', 'nist_csf_2.0', 'CP-9', 'nist_800_53', 95],
      // ISO 27001 <-> SOC 2
      ['A.5.15', 'iso_27001', 'CC6.1', 'soc2', 90],
      ['A.5.24', 'iso_27001', 'CC7.3', 'soc2', 85],
      ['A.8.15', 'iso_27001', 'CC7.2', 'soc2', 90],
      ['A.8.7', 'iso_27001', 'CC6.8', 'soc2', 90],
      // NIST 800-53 <-> SOC 2
      ['AC-2', 'nist_800_53', 'CC6.2', 'soc2', 90],
      ['IR-4', 'nist_800_53', 'CC7.4', 'soc2', 90],
      ['SI-4', 'nist_800_53', 'CC7.1', 'soc2', 85],
      ['RA-3', 'nist_800_53', 'CC3.2', 'soc2', 90],
      // AI frameworks
      ['GOVERN-1', 'nist_ai_rmf', 'AIA-Art9', 'eu_ai_act', 85],
      ['MEASURE-2', 'nist_ai_rmf', 'AIA-Art15', 'eu_ai_act', 80],
      ['MAP-1', 'nist_ai_rmf', 'AIA-Art6', 'eu_ai_act', 85],
      ['GOVERN-1', 'nist_ai_rmf', 'ISO42-5.2', 'iso_42001', 90],
      ['MEASURE-1', 'nist_ai_rmf', 'ISO42-9.1', 'iso_42001', 85],
      // AIUC-1 <-> NIST AI RMF
      ['SEC-1', 'aiuc_1', 'MEASURE-2', 'nist_ai_rmf', 92],
      ['ACC-1', 'aiuc_1', 'GOVERN-1', 'nist_ai_rmf', 88],
      ['ACC-3', 'aiuc_1', 'GOVERN-2', 'nist_ai_rmf', 90],
      ['SAF-1', 'aiuc_1', 'MEASURE-1', 'nist_ai_rmf', 90],
      ['REL-3', 'aiuc_1', 'MEASURE-3', 'nist_ai_rmf', 90],
      // AIUC-1 <-> EU AI Act
      ['ACC-1', 'aiuc_1', 'AIA-Art12', 'eu_ai_act', 95],
      ['ACC-3', 'aiuc_1', 'AIA-Art14', 'eu_ai_act', 95],
      ['SEC-3', 'aiuc_1', 'AIA-Art15', 'eu_ai_act', 90],
      ['SOC-4', 'aiuc_1', 'AIA-Art13', 'eu_ai_act', 92],
      ['SOC-5', 'aiuc_1', 'AIA-Art27', 'eu_ai_act', 90],
      // AIUC-1 <-> ISO 42001
      ['ACC-3', 'aiuc_1', 'ISO42-5.1', 'iso_42001', 85],
      ['SAF-5', 'aiuc_1', 'ISO42-10.2', 'iso_42001', 82],
      ['ACC-4', 'aiuc_1', 'ISO42-10.1', 'iso_42001', 88],
      // Zero Trust <-> NIST 800-53
      ['ZTA-2', 'nist_800_207', 'IA-2', 'nist_800_53', 90],
      ['ZTA-3', 'nist_800_207', 'AC-6', 'nist_800_53', 90],
      ['ZTA-6', 'nist_800_207', 'SI-4', 'nist_800_53', 85],
      ['ZTA-9', 'nist_800_207', 'SC-8', 'nist_800_53', 95],
      ['ZTA-11', 'nist_800_207', 'IA-2', 'nist_800_53', 90],
      // Zero Trust <-> NIST CSF
      ['ZTA-6', 'nist_800_207', 'DE.CM-01', 'nist_csf_2.0', 85],
      ['ZTA-3', 'nist_800_207', 'PR.AA-04', 'nist_csf_2.0', 90],
      ['ZTA-8', 'nist_800_207', 'PR.DS-10', 'nist_csf_2.0', 80],
      // CMMC 2.0 Level 2 <-> NIST 800-171 Rev 3
      ['AC.L2-3.1.1',  'cmmc_2.0', '03.01.01', 'nist_800_171', 98],
      ['AC.L2-3.1.2',  'cmmc_2.0', '03.01.02', 'nist_800_171', 98],
      ['AC.L2-3.1.3',  'cmmc_2.0', '03.01.03', 'nist_800_171', 98],
      ['AC.L2-3.1.5',  'cmmc_2.0', '03.01.05', 'nist_800_171', 98],
      ['AC.L2-3.1.7',  'cmmc_2.0', '03.01.05', 'nist_800_171', 90],
      ['AC.L2-3.1.12', 'cmmc_2.0', '03.01.12', 'nist_800_171', 98],
      ['AC.L2-3.1.20', 'cmmc_2.0', '03.01.20', 'nist_800_171', 98],
      ['AU.L2-3.3.1',  'cmmc_2.0', '03.03.01', 'nist_800_171', 98],
      ['AU.L2-3.3.2',  'cmmc_2.0', '03.03.02', 'nist_800_171', 98],
      ['CA.L2-3.12.1', 'cmmc_2.0', '03.12.01', 'nist_800_171', 98],
      ['CM.L2-3.4.1',  'cmmc_2.0', '03.04.01', 'nist_800_171', 98],
      ['CM.L2-3.4.2',  'cmmc_2.0', '03.04.02', 'nist_800_171', 98],
      ['CM.L2-3.4.6',  'cmmc_2.0', '03.04.06', 'nist_800_171', 98],
      ['IA.L2-3.5.1',  'cmmc_2.0', '03.05.01', 'nist_800_171', 98],
      ['IA.L2-3.5.2',  'cmmc_2.0', '03.05.02', 'nist_800_171', 98],
      ['IA.L2-3.5.3',  'cmmc_2.0', '03.05.03', 'nist_800_171', 98],
      ['IR.L2-3.6.1',  'cmmc_2.0', '03.06.01', 'nist_800_171', 98],
      ['MP.L2-3.8.1',  'cmmc_2.0', '03.08.01', 'nist_800_171', 98],
      ['RA.L2-3.11.1', 'cmmc_2.0', '03.11.01', 'nist_800_171', 98],
      ['RA.L2-3.11.2', 'cmmc_2.0', '03.11.02', 'nist_800_171', 98],
      ['SC.L2-3.13.1', 'cmmc_2.0', '03.13.01', 'nist_800_171', 98],
      ['SC.L2-3.13.8', 'cmmc_2.0', '03.13.08', 'nist_800_171', 98],
      ['SI.L2-3.14.1', 'cmmc_2.0', '03.14.01', 'nist_800_171', 98],
      ['SI.L2-3.14.2', 'cmmc_2.0', '03.14.02', 'nist_800_171', 98],
      ['SI.L2-3.14.6', 'cmmc_2.0', '03.14.06', 'nist_800_171', 98],
      // NIST 800-171 Rev 3 <-> NIST 800-53 Rev 5
      ['03.01.01', 'nist_800_171', 'AC-2',  'nist_800_53', 95],
      ['03.01.02', 'nist_800_171', 'AC-3',  'nist_800_53', 95],
      ['03.01.03', 'nist_800_171', 'AC-4',  'nist_800_53', 95],
      ['03.01.05', 'nist_800_171', 'AC-6',  'nist_800_53', 95],
      ['03.01.12', 'nist_800_171', 'AC-17', 'nist_800_53', 95],
      ['03.03.01', 'nist_800_171', 'AU-2',  'nist_800_53', 95],
      ['03.03.02', 'nist_800_171', 'AU-3',  'nist_800_53', 95],
      ['03.04.01', 'nist_800_171', 'CM-2',  'nist_800_53', 95],
      ['03.04.02', 'nist_800_171', 'CM-6',  'nist_800_53', 95],
      ['03.04.06', 'nist_800_171', 'CM-7',  'nist_800_53', 95],
      ['03.05.01', 'nist_800_171', 'IA-2',  'nist_800_53', 95],
      ['03.05.03', 'nist_800_171', 'IA-2',  'nist_800_53', 90],
      ['03.06.01', 'nist_800_171', 'IR-4',  'nist_800_53', 95],
      ['03.11.01', 'nist_800_171', 'RA-3',  'nist_800_53', 95],
      ['03.11.02', 'nist_800_171', 'RA-5',  'nist_800_53', 95],
      ['03.12.01', 'nist_800_171', 'CA-2',  'nist_800_53', 95],
      ['03.13.01', 'nist_800_171', 'SC-7',  'nist_800_53', 95],
      ['03.13.08', 'nist_800_171', 'SC-8',  'nist_800_53', 95],
      ['03.14.01', 'nist_800_171', 'SI-2',  'nist_800_53', 95],
      ['03.14.02', 'nist_800_171', 'SI-3',  'nist_800_53', 95],
      ['03.14.06', 'nist_800_171', 'SI-4',  'nist_800_53', 95],
      // PCI DSS v4.0 <-> NIST 800-53 Rev 5
      ['PCI-1.3',   'pci_dss_v4', 'SC-7',  'nist_800_53', 90],
      ['PCI-1.4',   'pci_dss_v4', 'SC-7',  'nist_800_53', 88],
      ['PCI-2.2',   'pci_dss_v4', 'CM-6',  'nist_800_53', 92],
      ['PCI-3.5',   'pci_dss_v4', 'SC-13', 'nist_800_53', 88],
      ['PCI-4.2',   'pci_dss_v4', 'SC-8',  'nist_800_53', 95],
      ['PCI-5.2',   'pci_dss_v4', 'SI-3',  'nist_800_53', 95],
      ['PCI-6.3',   'pci_dss_v4', 'SI-2',  'nist_800_53', 92],
      ['PCI-6.5',   'pci_dss_v4', 'CM-3',  'nist_800_53', 90],
      ['PCI-7.2',   'pci_dss_v4', 'AC-3',  'nist_800_53', 92],
      ['PCI-7.3',   'pci_dss_v4', 'AC-3',  'nist_800_53', 90],
      ['PCI-8.2',   'pci_dss_v4', 'IA-5',  'nist_800_53', 92],
      ['PCI-8.4',   'pci_dss_v4', 'IA-2',  'nist_800_53', 95],
      ['PCI-10.2',  'pci_dss_v4', 'AU-2',  'nist_800_53', 95],
      ['PCI-10.3',  'pci_dss_v4', 'AU-9',  'nist_800_53', 92],
      ['PCI-10.4',  'pci_dss_v4', 'AU-6',  'nist_800_53', 92],
      ['PCI-11.3',  'pci_dss_v4', 'RA-5',  'nist_800_53', 95],
      ['PCI-11.5',  'pci_dss_v4', 'SI-4',  'nist_800_53', 90],
      ['PCI-12.1',  'pci_dss_v4', 'PL-2',  'nist_800_53', 88],
      ['PCI-12.3',  'pci_dss_v4', 'RA-3',  'nist_800_53', 90],
      ['PCI-12.6',  'pci_dss_v4', 'AT-2',  'nist_800_53', 90],
      ['PCI-12.10', 'pci_dss_v4', 'IR-4',  'nist_800_53', 92],
      // HIPAA Security Rule <-> NIST 800-53 Rev 5
      ['HIPAA-164.308(a)(1)', 'hipaa', 'PM-9',  'nist_800_53', 88],
      ['HIPAA-164.308(a)(4)', 'hipaa', 'AC-2',  'nist_800_53', 92],
      ['HIPAA-164.308(a)(5)', 'hipaa', 'AT-2',  'nist_800_53', 92],
      ['HIPAA-164.308(a)(6)', 'hipaa', 'IR-4',  'nist_800_53', 92],
      ['HIPAA-164.308(a)(7)', 'hipaa', 'CP-2',  'nist_800_53', 92],
      ['HIPAA-164.308(a)(8)', 'hipaa', 'CA-2',  'nist_800_53', 88],
      ['HIPAA-164.312(a)(1)', 'hipaa', 'AC-3',  'nist_800_53', 92],
      ['HIPAA-164.312(b)',    'hipaa', 'AU-2',  'nist_800_53', 92],
      ['HIPAA-164.312(c)(1)', 'hipaa', 'SC-13', 'nist_800_53', 82],
      ['HIPAA-164.312(d)',    'hipaa', 'IA-2',  'nist_800_53', 92],
      ['HIPAA-164.312(e)(1)', 'hipaa', 'SC-8',  'nist_800_53', 92],
      ['HIPAA-164.316(a)',    'hipaa', 'PL-2',  'nist_800_53', 85],
      ['HIPAA-164.316(b)(1)', 'hipaa', 'PL-2',  'nist_800_53', 80],
      // HIPAA Security Rule <-> NIST CSF 2.0
      ['HIPAA-164.308(a)(1)', 'hipaa', 'GV.RM-01', 'nist_csf_2.0', 88],
      ['HIPAA-164.308(a)(2)', 'hipaa', 'GV.RR-01', 'nist_csf_2.0', 85],
      ['HIPAA-164.308(a)(4)', 'hipaa', 'PR.AA-04', 'nist_csf_2.0', 90],
      ['HIPAA-164.308(a)(5)', 'hipaa', 'PR.AT-01', 'nist_csf_2.0', 92],
      ['HIPAA-164.308(a)(6)', 'hipaa', 'RS.MA-01', 'nist_csf_2.0', 90],
      ['HIPAA-164.308(a)(7)', 'hipaa', 'PR.IR-01', 'nist_csf_2.0', 85],
      ['HIPAA-164.312(a)(1)', 'hipaa', 'PR.AA-04', 'nist_csf_2.0', 92],
      ['HIPAA-164.312(b)',    'hipaa', 'DE.CM-01', 'nist_csf_2.0', 80],
      ['HIPAA-164.312(d)',    'hipaa', 'PR.AA-02', 'nist_csf_2.0', 92],
      ['HIPAA-164.312(e)(1)', 'hipaa', 'PR.DS-02', 'nist_csf_2.0', 92],
      // GDPR <-> ISO 27701
      ['GDPR-5',  'gdpr', 'PG-1',  'iso_27701', 88],
      ['GDPR-7',  'gdpr', 'CMF-1', 'iso_27701', 92],
      ['GDPR-12', 'gdpr', 'PNT-1', 'iso_27701', 92],
      ['GDPR-13', 'gdpr', 'PNT-1', 'iso_27701', 90],
      ['GDPR-15', 'gdpr', 'DSR-1', 'iso_27701', 92],
      ['GDPR-17', 'gdpr', 'DRE-1', 'iso_27701', 92],
      ['GDPR-25', 'gdpr', 'PBD-1', 'iso_27701', 95],
      ['GDPR-28', 'gdpr', 'TPA-1', 'iso_27701', 92],
      ['GDPR-30', 'gdpr', 'DPR-1', 'iso_27701', 95],
      ['GDPR-33', 'gdpr', 'PIR-1', 'iso_27701', 92],
      ['GDPR-34', 'gdpr', 'PIR-1', 'iso_27701', 90],
      ['GDPR-35', 'gdpr', 'PIA-1', 'iso_27701', 95],
      ['GDPR-37', 'gdpr', 'PG-1',  'iso_27701', 85],
      ['GDPR-44', 'gdpr', 'CBT-1', 'iso_27701', 95],
      // GDPR <-> NIST Privacy Framework
      ['GDPR-5',  'gdpr', 'GV-P.01', 'nist_privacy', 85],
      ['GDPR-7',  'gdpr', 'CM-P.02', 'nist_privacy', 88],
      ['GDPR-12', 'gdpr', 'CM-P.01', 'nist_privacy', 88],
      ['GDPR-15', 'gdpr', 'CT-P.02', 'nist_privacy', 85],
      ['GDPR-25', 'gdpr', 'CT-P.01', 'nist_privacy', 88],
      ['GDPR-30', 'gdpr', 'ID-P.01', 'nist_privacy', 90],
      ['GDPR-32', 'gdpr', 'PR-P.01', 'nist_privacy', 88],
      // CCPA/CPRA <-> GDPR
      ['CCPA-1', 'ccpa_cpra', 'GDPR-15', 'gdpr', 88],
      ['CCPA-2', 'ccpa_cpra', 'GDPR-17', 'gdpr', 92],
      ['CCPA-7', 'ccpa_cpra', 'GDPR-12', 'gdpr', 90],
      ['CCPA-8', 'ccpa_cpra', 'GDPR-28', 'gdpr', 88],
      ['CCPA-9', 'ccpa_cpra', 'GDPR-30', 'gdpr', 90],
      ['CPRA-1', 'ccpa_cpra', 'GDPR-35', 'gdpr', 92],
      // CCPA/CPRA <-> NIST Privacy Framework
      ['CCPA-1', 'ccpa_cpra', 'CT-P.02', 'nist_privacy', 85],
      ['CCPA-7', 'ccpa_cpra', 'CM-P.01', 'nist_privacy', 90],
      ['CCPA-9', 'ccpa_cpra', 'ID-P.01', 'nist_privacy', 92],
      ['CPRA-1', 'ccpa_cpra', 'GV-P.03', 'nist_privacy', 88],
      ['CPRA-2', 'ccpa_cpra', 'PR-P.01', 'nist_privacy', 85],
      // NIST Privacy Framework <-> NIST CSF 2.0
      ['GV-P.01', 'nist_privacy', 'GV.PO-01', 'nist_csf_2.0', 92],
      ['GV-P.02', 'nist_privacy', 'GV.OC-03', 'nist_csf_2.0', 88],
      ['GV-P.03', 'nist_privacy', 'GV.RM-01', 'nist_csf_2.0', 90],
      ['ID-P.01', 'nist_privacy', 'ID.AM-03', 'nist_csf_2.0', 88],
      ['PR-P.01', 'nist_privacy', 'PR.DS-01', 'nist_csf_2.0', 90],
      ['PR-P.02', 'nist_privacy', 'PR.AA-01', 'nist_csf_2.0', 90],
      // NERC CIP <-> NIST 800-53 Rev 5
      ['CIP-002-6', 'nerc_cip', 'RA-2',  'nist_800_53', 88],
      ['CIP-003-9', 'nerc_cip', 'PL-2',  'nist_800_53', 88],
      ['CIP-004-7', 'nerc_cip', 'AT-2',  'nist_800_53', 88],
      ['CIP-005-7', 'nerc_cip', 'SC-7',  'nist_800_53', 92],
      ['CIP-007-6', 'nerc_cip', 'SI-2',  'nist_800_53', 88],
      ['CIP-008-6', 'nerc_cip', 'IR-4',  'nist_800_53', 92],
      ['CIP-009-6', 'nerc_cip', 'CP-10', 'nist_800_53', 90],
      ['CIP-010-4', 'nerc_cip', 'CM-3',  'nist_800_53', 92],
      ['CIP-011-3', 'nerc_cip', 'SC-13', 'nist_800_53', 85],
      // CIS Controls v8 <-> NIST 800-53 Rev 5
      ['CIS-1',  'cis_controls_v8', 'CM-8',  'nist_800_53', 92],
      ['CIS-2',  'cis_controls_v8', 'CM-7',  'nist_800_53', 92],
      ['CIS-3',  'cis_controls_v8', 'SC-13', 'nist_800_53', 88],
      ['CIS-4',  'cis_controls_v8', 'CM-6',  'nist_800_53', 92],
      ['CIS-5',  'cis_controls_v8', 'IA-2',  'nist_800_53', 90],
      ['CIS-6',  'cis_controls_v8', 'AC-3',  'nist_800_53', 90],
      ['CIS-7',  'cis_controls_v8', 'RA-5',  'nist_800_53', 95],
      ['CIS-8',  'cis_controls_v8', 'AU-2',  'nist_800_53', 92],
      ['CIS-10', 'cis_controls_v8', 'SI-3',  'nist_800_53', 95],
      ['CIS-11', 'cis_controls_v8', 'CP-9',  'nist_800_53', 92],
      ['CIS-12', 'cis_controls_v8', 'SC-7',  'nist_800_53', 90],
      ['CIS-13', 'cis_controls_v8', 'SI-4',  'nist_800_53', 92],
      ['CIS-14', 'cis_controls_v8', 'AT-2',  'nist_800_53', 90],
      ['CIS-16', 'cis_controls_v8', 'SA-15', 'nist_800_53', 85],
      ['CIS-17', 'cis_controls_v8', 'IR-4',  'nist_800_53', 95],
      // CIS Controls v8 <-> NIST CSF 2.0
      ['CIS-1',  'cis_controls_v8', 'ID.AM-01', 'nist_csf_2.0', 92],
      ['CIS-2',  'cis_controls_v8', 'ID.AM-02', 'nist_csf_2.0', 90],
      ['CIS-3',  'cis_controls_v8', 'PR.DS-01', 'nist_csf_2.0', 88],
      ['CIS-4',  'cis_controls_v8', 'PR.PS-01', 'nist_csf_2.0', 90],
      ['CIS-7',  'cis_controls_v8', 'ID.RA-01', 'nist_csf_2.0', 92],
      ['CIS-8',  'cis_controls_v8', 'DE.CM-01', 'nist_csf_2.0', 90],
      ['CIS-13', 'cis_controls_v8', 'DE.CM-03', 'nist_csf_2.0', 92],
      ['CIS-17', 'cis_controls_v8', 'RS.MA-01', 'nist_csf_2.0', 90],
      // FedRAMP High <-> NIST 800-53 Rev 5
      ['FRH-AC-2(13)', 'fedramp_high', 'AC-2',  'nist_800_53', 98],
      ['FRH-AC-12',    'fedramp_high', 'AC-12', 'nist_800_53', 98],
      ['FRH-AU-9(3)',  'fedramp_high', 'AU-9',  'nist_800_53', 98],
      ['FRH-AU-10',    'fedramp_high', 'AU-10', 'nist_800_53', 98],
      ['FRH-IA-3',     'fedramp_high', 'IA-3',  'nist_800_53', 98],
      ['FRH-IA-5(2)',  'fedramp_high', 'IA-5',  'nist_800_53', 95],
      ['FRH-SC-28(1)', 'fedramp_high', 'SC-28', 'nist_800_53', 98],
      ['FRH-SC-8(1)',  'fedramp_high', 'SC-8',  'nist_800_53', 98],
      ['FRH-SI-7(14)', 'fedramp_high', 'SI-7',  'nist_800_53', 90],
      ['FRH-SI-16',    'fedramp_high', 'SI-16', 'nist_800_53', 98],
      ['FRH-SA-10(1)', 'fedramp_high', 'SA-10', 'nist_800_53', 92],
      ['FRH-CP-6(3)',  'fedramp_high', 'CP-6',  'nist_800_53', 98],
      ['FRH-CP-7(5)',  'fedramp_high', 'CP-7',  'nist_800_53', 98],
      ['FRH-CP-9(3)',  'fedramp_high', 'CP-9',  'nist_800_53', 98],
      ['FRH-IR-4(4)',  'fedramp_high', 'IR-4',  'nist_800_53', 95],
      ['FRH-RA-3(1)',  'fedramp_high', 'RA-3',  'nist_800_53', 95],
      ['FRH-AC-6(9)',  'fedramp_high', 'AC-6',  'nist_800_53', 98],
      ['FRH-CM-5(1)',  'fedramp_high', 'CM-5',  'nist_800_53', 98],
    ];

    let mappingsCreated = 0;
    for (const [srcCtrl, srcFw, tgtCtrl, tgtFw, score] of mappingPairs) {
      const src = await client.query(
        `SELECT fc.id FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.control_id = $1 AND f.code = $2`,
        [srcCtrl, srcFw]
      );
      const tgt = await client.query(
        `SELECT fc.id FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE fc.control_id = $1 AND f.code = $2`,
        [tgtCtrl, tgtFw]
      );

      if (src.rows.length > 0 && tgt.rows.length > 0) {
        await client.query(
          `INSERT INTO control_mappings (source_control_id, target_control_id, mapping_type, similarity_score)
           VALUES ($1, $2, 'equivalent', $3)`,
          [src.rows[0].id, tgt.rows[0].id, score]
        );
        mappingsCreated++;
      }
    }

    await client.query('COMMIT');

    console.log(`\n=== Seed Complete ===`);
    console.log(`Frameworks: ${frameworks.length}`);
    console.log(`Controls: ${totalControls}`);
    console.log(`Crosswalk Mappings: ${mappingsCreated}`);

    // Auto-subscribe the first org to free-tier frameworks
    const orgResult = await pool.query('SELECT id, tier FROM organizations LIMIT 1');
    if (orgResult.rows.length > 0) {
      const org = orgResult.rows[0];
      const communityFrameworks = await pool.query("SELECT id FROM frameworks WHERE tier_required = 'community'");
      for (const fw of communityFrameworks.rows) {
        await pool.query(
          `INSERT INTO organization_frameworks (organization_id, framework_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [org.id, fw.id]
        );
      }
      console.log(`\nAuto-subscribed org (${org.tier} tier) to ${communityFrameworks.rows.length} free frameworks`);
    }

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', err);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed();
