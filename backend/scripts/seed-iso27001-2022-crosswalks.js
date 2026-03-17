// @tier: community
/**
 * Seed ISO 27001:2022 Enhanced Crosswalk Mappings
 *
 * Adds comprehensive NIST SP 800-53 Rev 5 ↔ ISO/IEC 27001:2022 crosswalk mappings
 * based on the official NIST SP 800-53 Rev 5 to ISO/IEC 27001:2022 mapping.
 *
 * Also adds:
 * - ISO 27001:2022 ↔ GDPR additional mappings
 * - ISO 27001:2022 ↔ HIPAA additional mappings
 * - ISO 27001:2022 ↔ NIST CSF 2.0 expanded mappings
 *
 * Run after: seed-frameworks.js, seed-missing-controls.js
 */

require('dotenv').config();
const { Pool } = require('pg');

const pool = process.env.DATABASE_URL
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'grc_platform',
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    });

// ============================================================
// NIST 800-53 Rev 5 → ISO 27001:2022 Annex A Mappings
// Based on NIST SP 800-53 Rev 5 to ISO/IEC 27001:2022 mapping
// Source: https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
// ============================================================
const NIST_800_53_TO_ISO_27001 = [
  // Access Control (AC)
  { source: 'AC-1',  source_fw: 'nist_800_53', target: 'A.5.1',  target_fw: 'iso_27001', score: 90, type: 'related' },
  { source: 'AC-2',  source_fw: 'nist_800_53', target: 'A.5.18', target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'AC-3',  source_fw: 'nist_800_53', target: 'A.8.3',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'AC-4',  source_fw: 'nist_800_53', target: 'A.8.22', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'AC-5',  source_fw: 'nist_800_53', target: 'A.5.3',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'AC-6',  source_fw: 'nist_800_53', target: 'A.8.2',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'AC-7',  source_fw: 'nist_800_53', target: 'A.8.5',  target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'AC-17', source_fw: 'nist_800_53', target: 'A.6.7',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Awareness and Training (AT)
  { source: 'AT-2',  source_fw: 'nist_800_53', target: 'A.6.3',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'AT-3',  source_fw: 'nist_800_53', target: 'A.6.3',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Audit and Accountability (AU)
  { source: 'AU-2',  source_fw: 'nist_800_53', target: 'A.8.15', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'AU-3',  source_fw: 'nist_800_53', target: 'A.8.15', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'AU-6',  source_fw: 'nist_800_53', target: 'A.8.16', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'AU-9',  source_fw: 'nist_800_53', target: 'A.8.15', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'AU-12', source_fw: 'nist_800_53', target: 'A.8.15', target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Assessment, Authorization and Monitoring (CA)
  { source: 'CA-2',  source_fw: 'nist_800_53', target: 'A.5.35', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'CA-7',  source_fw: 'nist_800_53', target: 'A.8.16', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'CA-8',  source_fw: 'nist_800_53', target: 'A.8.29', target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Configuration Management (CM)
  { source: 'CM-2',  source_fw: 'nist_800_53', target: 'A.8.9',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'CM-6',  source_fw: 'nist_800_53', target: 'A.8.9',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'CM-7',  source_fw: 'nist_800_53', target: 'A.8.19', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'CM-8',  source_fw: 'nist_800_53', target: 'A.5.9',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'CM-11', source_fw: 'nist_800_53', target: 'A.8.19', target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Contingency Planning (CP)
  { source: 'CP-9',  source_fw: 'nist_800_53', target: 'A.8.13', target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'CP-10', source_fw: 'nist_800_53', target: 'A.5.29', target_fw: 'iso_27001', score: 85, type: 'related' },

  // Identification and Authentication (IA)
  { source: 'IA-2',  source_fw: 'nist_800_53', target: 'A.8.5',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'IA-4',  source_fw: 'nist_800_53', target: 'A.5.16', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'IA-5',  source_fw: 'nist_800_53', target: 'A.5.17', target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'IA-8',  source_fw: 'nist_800_53', target: 'A.8.5',  target_fw: 'iso_27001', score: 85, type: 'related' },

  // Incident Response (IR)
  { source: 'IR-4',  source_fw: 'nist_800_53', target: 'A.5.26', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'IR-5',  source_fw: 'nist_800_53', target: 'A.5.25', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'IR-6',  source_fw: 'nist_800_53', target: 'A.6.8',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'IR-8',  source_fw: 'nist_800_53', target: 'A.5.24', target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Media Protection (MP)
  { source: 'MP-6',  source_fw: 'nist_800_53', target: 'A.8.10', target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Physical and Environmental Protection (PE)
  { source: 'PE-1',  source_fw: 'nist_800_53', target: 'A.7.1',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'PE-3',  source_fw: 'nist_800_53', target: 'A.7.2',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'PE-6',  source_fw: 'nist_800_53', target: 'A.7.4',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },

  // Risk Assessment (RA)
  { source: 'RA-5',  source_fw: 'nist_800_53', target: 'A.8.8',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },

  // System and Services Acquisition (SA)
  { source: 'SA-3',  source_fw: 'nist_800_53', target: 'A.8.25', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SA-8',  source_fw: 'nist_800_53', target: 'A.8.27', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'SA-11', source_fw: 'nist_800_53', target: 'A.8.29', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SA-15', source_fw: 'nist_800_53', target: 'A.8.25', target_fw: 'iso_27001', score: 85, type: 'related' },

  // System and Communications Protection (SC)
  { source: 'SC-7',  source_fw: 'nist_800_53', target: 'A.8.20', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SC-7',  source_fw: 'nist_800_53', target: 'A.8.22', target_fw: 'iso_27001', score: 85, type: 'related' },
  { source: 'SC-12', source_fw: 'nist_800_53', target: 'A.8.24', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SC-13', source_fw: 'nist_800_53', target: 'A.8.24', target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'SC-28', source_fw: 'nist_800_53', target: 'A.8.24', target_fw: 'iso_27001', score: 85, type: 'related' },

  // System and Information Integrity (SI)
  { source: 'SI-2',  source_fw: 'nist_800_53', target: 'A.8.8',  target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SI-3',  source_fw: 'nist_800_53', target: 'A.8.7',  target_fw: 'iso_27001', score: 95, type: 'equivalent' },
  { source: 'SI-4',  source_fw: 'nist_800_53', target: 'A.8.16', target_fw: 'iso_27001', score: 90, type: 'equivalent' },
  { source: 'SI-7',  source_fw: 'nist_800_53', target: 'A.8.9',  target_fw: 'iso_27001', score: 85, type: 'related' },
];

// ============================================================
// ISO 27001:2022 → NIST CSF 2.0 Expanded Mappings
// ============================================================
const ISO_27001_TO_NIST_CSF = [
  { source: 'A.5.1',  source_fw: 'iso_27001', target: 'GV.PO-01', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.5.7',  source_fw: 'iso_27001', target: 'ID.RA-01', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.5.8',  source_fw: 'iso_27001', target: 'GV.RM-06', target_fw: 'nist_csf_2.0', score: 85, type: 'related' },
  { source: 'A.5.18', source_fw: 'iso_27001', target: 'PR.AA-05', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.5.23', source_fw: 'iso_27001', target: 'GV.SC-01', target_fw: 'nist_csf_2.0', score: 85, type: 'related' },
  { source: 'A.5.24', source_fw: 'iso_27001', target: 'RS.MA-01', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.5.26', source_fw: 'iso_27001', target: 'RS.MA-02', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.5.29', source_fw: 'iso_27001', target: 'RC.RP-01', target_fw: 'nist_csf_2.0', score: 85, type: 'related' },
  { source: 'A.6.3',  source_fw: 'iso_27001', target: 'PR.AT-01', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.8.2',  source_fw: 'iso_27001', target: 'PR.AA-05', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.8.5',  source_fw: 'iso_27001', target: 'PR.AA-03', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.8.8',  source_fw: 'iso_27001', target: 'ID.RA-01', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.8.9',  source_fw: 'iso_27001', target: 'PR.PS-01', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.8.12', source_fw: 'iso_27001', target: 'PR.DS-02', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.8.13', source_fw: 'iso_27001', target: 'PR.DS-11', target_fw: 'nist_csf_2.0', score: 95, type: 'equivalent' },
  { source: 'A.8.20', source_fw: 'iso_27001', target: 'PR.IR-01', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
  { source: 'A.8.25', source_fw: 'iso_27001', target: 'PR.PS-05', target_fw: 'nist_csf_2.0', score: 90, type: 'equivalent' },
];

// ============================================================
// ISO 27001:2022 → GDPR Additional Mappings
// ============================================================
const ISO_27001_TO_GDPR = [
  { source: 'A.5.34', source_fw: 'iso_27001', target: 'Art-5',   target_fw: 'gdpr', score: 95, type: 'equivalent' },
  { source: 'A.5.12', source_fw: 'iso_27001', target: 'Art-5',   target_fw: 'gdpr', score: 85, type: 'related' },
  { source: 'A.8.10', source_fw: 'iso_27001', target: 'Art-17',  target_fw: 'gdpr', score: 90, type: 'equivalent' },
  { source: 'A.8.12', source_fw: 'iso_27001', target: 'Art-32',  target_fw: 'gdpr', score: 90, type: 'equivalent' },
  { source: 'A.5.31', source_fw: 'iso_27001', target: 'Art-5',   target_fw: 'gdpr', score: 90, type: 'equivalent' },
  { source: 'A.5.33', source_fw: 'iso_27001', target: 'Art-5',   target_fw: 'gdpr', score: 85, type: 'related' },
  { source: 'A.6.5',  source_fw: 'iso_27001', target: 'Art-32',  target_fw: 'gdpr', score: 80, type: 'related' },
];

// ============================================================
// ISO 27001:2022 → HIPAA Additional Mappings
// ============================================================
const ISO_27001_TO_HIPAA = [
  { source: 'A.8.3',  source_fw: 'iso_27001', target: '164.312(a)', target_fw: 'hipaa', score: 90, type: 'equivalent' },
  { source: 'A.8.5',  source_fw: 'iso_27001', target: '164.312(d)', target_fw: 'hipaa', score: 90, type: 'equivalent' },
  { source: 'A.8.15', source_fw: 'iso_27001', target: '164.312(b)', target_fw: 'hipaa', score: 90, type: 'equivalent' },
  { source: 'A.8.13', source_fw: 'iso_27001', target: '164.308(a)', target_fw: 'hipaa', score: 85, type: 'related' },
  { source: 'A.5.26', source_fw: 'iso_27001', target: '164.308(a)', target_fw: 'hipaa', score: 85, type: 'related' },
];

// ============================================================
// ISO 27001:2022 → SOC 2 Expanded Mappings
// ============================================================
const ISO_27001_TO_SOC2 = [
  { source: 'A.5.3',  source_fw: 'iso_27001', target: 'CC5.2', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.5.16', source_fw: 'iso_27001', target: 'CC6.2', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.5.17', source_fw: 'iso_27001', target: 'CC6.1', target_fw: 'soc2', score: 85, type: 'related' },
  { source: 'A.5.18', source_fw: 'iso_27001', target: 'CC6.3', target_fw: 'soc2', score: 95, type: 'equivalent' },
  { source: 'A.5.26', source_fw: 'iso_27001', target: 'CC7.3', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.5.27', source_fw: 'iso_27001', target: 'CC7.5', target_fw: 'soc2', score: 85, type: 'related' },
  { source: 'A.6.3',  source_fw: 'iso_27001', target: 'CC2.2', target_fw: 'soc2', score: 85, type: 'related' },
  { source: 'A.8.2',  source_fw: 'iso_27001', target: 'CC6.3', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.8.8',  source_fw: 'iso_27001', target: 'CC7.1', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.8.9',  source_fw: 'iso_27001', target: 'CC6.6', target_fw: 'soc2', score: 85, type: 'related' },
  { source: 'A.8.13', source_fw: 'iso_27001', target: 'A1.2',  target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.8.16', source_fw: 'iso_27001', target: 'CC7.2', target_fw: 'soc2', score: 90, type: 'equivalent' },
  { source: 'A.8.20', source_fw: 'iso_27001', target: 'CC6.6', target_fw: 'soc2', score: 85, type: 'related' },
  { source: 'A.8.24', source_fw: 'iso_27001', target: 'CC6.1', target_fw: 'soc2', score: 85, type: 'related' },
];

async function insertCrosswalk(client, mapping) {
  const srcFw = await client.query(
    'SELECT id FROM frameworks WHERE code = $1 LIMIT 1',
    [mapping.source_fw]
  );
  if (srcFw.rows.length === 0) {
    return { inserted: false, reason: `framework not found: ${mapping.source_fw}` };
  }

  const srcCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [srcFw.rows[0].id, mapping.source]
  );
  if (srcCtrl.rows.length === 0) {
    return { inserted: false, reason: `control not found: ${mapping.source_fw}/${mapping.source}` };
  }

  const tgtFw = await client.query(
    'SELECT id FROM frameworks WHERE code = $1 LIMIT 1',
    [mapping.target_fw]
  );
  if (tgtFw.rows.length === 0) {
    return { inserted: false, reason: `framework not found: ${mapping.target_fw}` };
  }

  const tgtCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [tgtFw.rows[0].id, mapping.target]
  );
  if (tgtCtrl.rows.length === 0) {
    return { inserted: false, reason: `control not found: ${mapping.target_fw}/${mapping.target}` };
  }

  // Check both directions for duplicates
  const existing = await client.query(
    `SELECT id FROM control_mappings
     WHERE (source_control_id = $1 AND target_control_id = $2)
        OR (source_control_id = $2 AND target_control_id = $1)
     LIMIT 1`,
    [srcCtrl.rows[0].id, tgtCtrl.rows[0].id]
  );
  if (existing.rows.length > 0) {
    return { inserted: false, reason: 'duplicate' };
  }

  await client.query(
    `INSERT INTO control_mappings (source_control_id, target_control_id, similarity_score, mapping_type)
     VALUES ($1, $2, $3, $4)`,
    [srcCtrl.rows[0].id, tgtCtrl.rows[0].id, mapping.score, mapping.type]
  );
  return { inserted: true };
}

async function processMappings(client, label, mappings) {
  let inserted = 0;
  let skipped = 0;

  for (const mapping of mappings) {
    const result = await insertCrosswalk(client, mapping);
    if (result.inserted) {
      inserted++;
    } else {
      skipped++;
      if (result.reason !== 'duplicate') {
        console.warn(`  [SKIP] ${mapping.source_fw}/${mapping.source} → ${mapping.target_fw}/${mapping.target}: ${result.reason}`);
      }
    }
  }

  console.log(`  [OK] ${label}: ${inserted} inserted, ${skipped} skipped/already exist`);
  return inserted;
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n=== ISO 27001:2022 Crosswalk Enhancement ===\n');

    let total = 0;
    total += await processMappings(client, 'NIST 800-53 Rev 5 → ISO 27001:2022', NIST_800_53_TO_ISO_27001);
    total += await processMappings(client, 'ISO 27001:2022 → NIST CSF 2.0', ISO_27001_TO_NIST_CSF);
    total += await processMappings(client, 'ISO 27001:2022 → GDPR', ISO_27001_TO_GDPR);
    total += await processMappings(client, 'ISO 27001:2022 → HIPAA', ISO_27001_TO_HIPAA);
    total += await processMappings(client, 'ISO 27001:2022 → SOC 2', ISO_27001_TO_SOC2);

    await client.query('COMMIT');

    // Print final crosswalk count
    const countResult = await client.query(`
      SELECT COUNT(*) AS total FROM control_mappings
    `);

    console.log('\n========================================');
    console.log(`New crosswalk mappings added: ${total}`);
    console.log(`Total crosswalk mappings in platform: ${countResult.rows[0].total}`);
    console.log('========================================\n');

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Seed failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
