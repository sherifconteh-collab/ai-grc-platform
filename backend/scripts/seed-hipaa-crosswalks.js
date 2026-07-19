// @tier: community
/**
 * Seed HIPAA Security Rule Crosswalks
 *
 * This script primarily seeds crosswalk mappings for the HIPAA Security Rule:
 *   1. Adds comprehensive HIPAA → NIST SP 800-53 Rev 5 mappings based on
 *      NIST SP 800-66 Rev 2 (Implementing the HIPAA Security Rule).
 *   2. Adds comprehensive HIPAA → ISO/IEC 27001:2022 Annex A mappings based
 *      on the HHS/NIST HIPAA-ISO mapping guidance.
 *   3. Backfills the §164.314 (Organizational Requirements) and §164.316
 *      (Policies, Procedures, and Documentation) HIPAA controls for older
 *      databases that were seeded before those controls were added to
 *      seed-frameworks.js. New installs that run seed-frameworks.js will
 *      already have these controls; this script is a no-op for them.
 *
 * This script is idempotent: re-running it will not duplicate controls or
 * mappings (relies on ON CONFLICT DO NOTHING and pre-insert existence checks).
 *
 * Run after: seed-frameworks.js, seed-missing-controls.js
 *
 * Flags:
 *   --strict   Fail (exit 1, ROLLBACK) if any non-duplicate mapping cannot be
 *              inserted because the source/target framework or control is
 *              missing. Without --strict (default) the script logs a warning
 *              and continues, COMMITting any successful inserts. Use --strict
 *              in CI / production seeding to avoid silent partial state.
 *
 * Framework code:        'hipaa'
 * Control ID prefix:     'HIPAA-164.xxx(y)(z)'   (matches seed-frameworks.js)
 */

require('dotenv').config();
const { Pool } = require('pg');

const STRICT = process.argv.includes('--strict') || process.env.STRICT_SEEDING === 'true';

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
// Missing HIPAA Security Rule controls
// §164.314 Organizational Requirements and §164.316 Policies,
// Procedures, and Documentation Requirements are part of the
// Security Rule but were not present in seed-frameworks.js.
// ============================================================
const MISSING_HIPAA_CONTROLS = [
  {
    control_id: 'HIPAA-164.314(a)(1)', // ip-hygiene:ignore
    title: 'Business Associate Contracts',
    description: 'The contract or other arrangement between the covered entity and its business associate must meet the applicable requirements of §164.504(e), including that the business associate will appropriately safeguard ePHI.', // ip-hygiene:ignore
    priority: '1',
    control_type: 'organizational',
  },
  {
    control_id: 'HIPAA-164.314(b)(1)', // ip-hygiene:ignore
    title: 'Requirements for Group Health Plans',
    description: 'Plan documents of the group health plan must be amended to incorporate provisions requiring the plan sponsor to reasonably and appropriately safeguard ePHI.', // ip-hygiene:ignore
    priority: '2',
    control_type: 'organizational',
  },
  {
    control_id: 'HIPAA-164.316(a)', // ip-hygiene:ignore
    title: 'Policies and Procedures',
    description: 'Implement reasonable and appropriate policies and procedures to comply with the standards, implementation specifications, and other requirements of the HIPAA Security Rule.', // ip-hygiene:ignore
    priority: '1',
    control_type: 'policy',
  },
  {
    control_id: 'HIPAA-164.316(b)(1)', // ip-hygiene:ignore
    title: 'Documentation',
    description: 'Maintain the policies and procedures implemented to comply with this subpart in written (which may be electronic) form, and maintain a written (which may be electronic) record of any action, activity, or assessment required by this subpart.', // ip-hygiene:ignore
    priority: '1',
    control_type: 'policy',
  },
  {
    control_id: 'HIPAA-164.316(b)(2)', // ip-hygiene:ignore
    title: 'Documentation - Time Limit, Availability, Updates',
    description: 'Retain documentation required by §164.316(b)(1) for 6 years from the date of its creation or the date when it last was in effect, whichever is later. Make documentation available to those responsible for implementing the procedures and review documentation periodically.', // ip-hygiene:ignore
    priority: '2',
    control_type: 'policy',
  },
];

// ============================================================
// HIPAA Security Rule → NIST SP 800-53 Rev 5
// Based on NIST SP 800-66 Rev 2 mapping guidance.
// Control IDs in the DB are prefixed with 'HIPAA-'.
// ============================================================
const HIPAA_TO_NIST_800_53 = [
  // §164.308 Administrative Safeguards
  { source: 'HIPAA-164.308(a)(1)', target: 'PM-9',  score: 90, type: 'equivalent' }, // Risk Management Strategy
  { source: 'HIPAA-164.308(a)(1)', target: 'RA-3',  score: 90, type: 'equivalent' }, // Risk Assessment
  { source: 'HIPAA-164.308(a)(1)', target: 'CA-5',  score: 85, type: 'related' },    // Plan of Action & Milestones
  { source: 'HIPAA-164.308(a)(2)', target: 'PM-2',  score: 95, type: 'equivalent' }, // Senior Information Security Officer
  { source: 'HIPAA-164.308(a)(3)', target: 'PS-3',  score: 90, type: 'equivalent' }, // Personnel Screening
  { source: 'HIPAA-164.308(a)(3)', target: 'PS-4',  score: 90, type: 'equivalent' }, // Personnel Termination
  { source: 'HIPAA-164.308(a)(3)', target: 'PS-5',  score: 90, type: 'equivalent' }, // Personnel Transfer
  { source: 'HIPAA-164.308(a)(4)', target: 'AC-2',  score: 95, type: 'equivalent' }, // Account Management
  { source: 'HIPAA-164.308(a)(4)', target: 'AC-3',  score: 90, type: 'equivalent' }, // Access Enforcement
  { source: 'HIPAA-164.308(a)(4)', target: 'AC-6',  score: 90, type: 'equivalent' }, // Least Privilege
  { source: 'HIPAA-164.308(a)(5)', target: 'AT-2',  score: 95, type: 'equivalent' }, // Security Awareness Training
  { source: 'HIPAA-164.308(a)(5)', target: 'AT-3',  score: 90, type: 'equivalent' }, // Role-based Training
  { source: 'HIPAA-164.308(a)(6)', target: 'IR-4',  score: 95, type: 'equivalent' }, // Incident Handling
  { source: 'HIPAA-164.308(a)(6)', target: 'IR-5',  score: 90, type: 'equivalent' }, // Incident Monitoring
  { source: 'HIPAA-164.308(a)(6)', target: 'IR-6',  score: 90, type: 'equivalent' }, // Incident Reporting
  { source: 'HIPAA-164.308(a)(7)', target: 'CP-2',  score: 95, type: 'equivalent' }, // Contingency Plan
  { source: 'HIPAA-164.308(a)(7)', target: 'CP-9',  score: 90, type: 'equivalent' }, // System Backup
  { source: 'HIPAA-164.308(a)(7)', target: 'CP-10', score: 90, type: 'equivalent' }, // System Recovery and Reconstitution
  { source: 'HIPAA-164.308(a)(8)', target: 'CA-2',  score: 90, type: 'equivalent' }, // Control Assessments
  { source: 'HIPAA-164.308(a)(8)', target: 'CA-7',  score: 85, type: 'related' },    // Continuous Monitoring

  // §164.310 Physical Safeguards
  { source: 'HIPAA-164.310(a)(1)', target: 'PE-2',  score: 95, type: 'equivalent' }, // Physical Access Authorizations
  { source: 'HIPAA-164.310(a)(1)', target: 'PE-3',  score: 95, type: 'equivalent' }, // Physical Access Control
  { source: 'HIPAA-164.310(b)',    target: 'AC-11', score: 85, type: 'related' },    // Device Lock
  { source: 'HIPAA-164.310(b)',    target: 'PL-4',  score: 85, type: 'related' },    // Rules of Behavior
  { source: 'HIPAA-164.310(c)',    target: 'PE-5',  score: 90, type: 'equivalent' }, // Access Control for Output Devices
  { source: 'HIPAA-164.310(d)(1)', target: 'MP-6',  score: 95, type: 'equivalent' }, // Media Sanitization
  { source: 'HIPAA-164.310(d)(1)', target: 'MP-7',  score: 90, type: 'equivalent' }, // Media Use

  // §164.312 Technical Safeguards
  { source: 'HIPAA-164.312(a)(1)', target: 'AC-3',  score: 95, type: 'equivalent' }, // Access Enforcement
  { source: 'HIPAA-164.312(a)(1)', target: 'IA-2',  score: 90, type: 'equivalent' }, // User Identification and Authentication
  { source: 'HIPAA-164.312(b)',    target: 'AU-2',  score: 95, type: 'equivalent' }, // Event Logging
  { source: 'HIPAA-164.312(b)',    target: 'AU-3',  score: 90, type: 'equivalent' }, // Content of Audit Records
  { source: 'HIPAA-164.312(b)',    target: 'AU-12', score: 90, type: 'equivalent' }, // Audit Record Generation
  { source: 'HIPAA-164.312(c)(1)', target: 'SI-7',  score: 95, type: 'equivalent' }, // Software, Firmware, Information Integrity
  { source: 'HIPAA-164.312(c)(1)', target: 'SC-28', score: 85, type: 'related' },    // Protection of Information at Rest
  { source: 'HIPAA-164.312(d)',    target: 'IA-2',  score: 95, type: 'equivalent' }, // Identification and Authentication
  { source: 'HIPAA-164.312(d)',    target: 'IA-5',  score: 90, type: 'equivalent' }, // Authenticator Management
  { source: 'HIPAA-164.312(e)(1)', target: 'SC-8',  score: 95, type: 'equivalent' }, // Transmission Confidentiality/Integrity
  { source: 'HIPAA-164.312(e)(1)', target: 'SC-13', score: 90, type: 'equivalent' }, // Cryptographic Protection

  // §164.314 Organizational Requirements
  { source: 'HIPAA-164.314(a)(1)', target: 'SA-9',  score: 90, type: 'equivalent' }, // External System Services
  { source: 'HIPAA-164.314(a)(1)', target: 'PS-7',  score: 85, type: 'related' },    // External Personnel Security
  { source: 'HIPAA-164.314(b)(1)', target: 'SA-4',  score: 80, type: 'related' },    // Acquisition Process

  // §164.316 Policies, Procedures, and Documentation
  { source: 'HIPAA-164.316(a)',    target: 'PL-1',  score: 90, type: 'equivalent' }, // Policy and Procedures
  { source: 'HIPAA-164.316(b)(1)', target: 'PL-2',  score: 85, type: 'related' },    // System Security and Privacy Plans
  { source: 'HIPAA-164.316(b)(2)', target: 'PL-1',  score: 85, type: 'related' },    // Policy and Procedures (review/update)
];

// ============================================================
// HIPAA Security Rule → ISO/IEC 27001:2022 Annex A
// Fixes the mismatched entries currently in seed-iso27001-2022-crosswalks.js
// (which referenced '164.312(a)' instead of the actual seeded
// 'HIPAA-164.312(a)(1)') and adds additional coverage.
// ============================================================
const HIPAA_TO_ISO_27001 = [
  // §164.308 Administrative Safeguards
  { source: 'HIPAA-164.308(a)(1)', target: 'A.5.1',  score: 90, type: 'equivalent' }, // Policies for information security
  { source: 'HIPAA-164.308(a)(1)', target: 'A.5.2',  score: 85, type: 'related' },    // Information security roles and responsibilities
  { source: 'HIPAA-164.308(a)(2)', target: 'A.5.2',  score: 95, type: 'equivalent' }, // Information security roles and responsibilities
  { source: 'HIPAA-164.308(a)(3)', target: 'A.6.1',  score: 90, type: 'equivalent' }, // Screening
  { source: 'HIPAA-164.308(a)(3)', target: 'A.6.5',  score: 85, type: 'related' },    // Responsibilities after termination or change of employment
  { source: 'HIPAA-164.308(a)(4)', target: 'A.5.15', score: 95, type: 'equivalent' }, // Access control
  { source: 'HIPAA-164.308(a)(4)', target: 'A.5.18', score: 90, type: 'equivalent' }, // Access rights
  { source: 'HIPAA-164.308(a)(5)', target: 'A.6.3',  score: 95, type: 'equivalent' }, // Information security awareness, education and training
  { source: 'HIPAA-164.308(a)(6)', target: 'A.5.24', score: 90, type: 'equivalent' }, // Information security incident management planning and preparation
  { source: 'HIPAA-164.308(a)(6)', target: 'A.5.25', score: 90, type: 'equivalent' }, // Assessment and decision on information security events
  { source: 'HIPAA-164.308(a)(7)', target: 'A.5.29', score: 95, type: 'equivalent' }, // Information security during disruption
  { source: 'HIPAA-164.308(a)(7)', target: 'A.8.13', score: 90, type: 'equivalent' }, // Information backup
  { source: 'HIPAA-164.308(a)(8)', target: 'A.5.35', score: 85, type: 'related' },    // Independent review of information security

  // §164.310 Physical Safeguards
  { source: 'HIPAA-164.310(a)(1)', target: 'A.7.1',  score: 95, type: 'equivalent' }, // Physical security perimeters
  { source: 'HIPAA-164.310(a)(1)', target: 'A.7.2',  score: 95, type: 'equivalent' }, // Physical entry
  { source: 'HIPAA-164.310(b)',    target: 'A.8.1',  score: 85, type: 'related' },    // User endpoint devices
  { source: 'HIPAA-164.310(c)',    target: 'A.7.6',  score: 85, type: 'related' },    // Working in secure areas
  { source: 'HIPAA-164.310(d)(1)', target: 'A.7.10', score: 95, type: 'equivalent' }, // Storage media
  { source: 'HIPAA-164.310(d)(1)', target: 'A.7.14', score: 90, type: 'equivalent' }, // Secure disposal or re-use of equipment

  // §164.312 Technical Safeguards
  { source: 'HIPAA-164.312(a)(1)', target: 'A.8.3',  score: 95, type: 'equivalent' }, // Information access restriction
  { source: 'HIPAA-164.312(a)(1)', target: 'A.8.2',  score: 90, type: 'equivalent' }, // Privileged access rights
  { source: 'HIPAA-164.312(b)',    target: 'A.8.15', score: 95, type: 'equivalent' }, // Logging
  { source: 'HIPAA-164.312(b)',    target: 'A.8.16', score: 85, type: 'related' },    // Monitoring activities
  { source: 'HIPAA-164.312(c)(1)', target: 'A.8.24', score: 85, type: 'related' },    // Use of cryptography
  { source: 'HIPAA-164.312(d)',    target: 'A.5.17', score: 90, type: 'equivalent' }, // Authentication information
  { source: 'HIPAA-164.312(d)',    target: 'A.8.5',  score: 90, type: 'equivalent' }, // Secure authentication
  { source: 'HIPAA-164.312(e)(1)', target: 'A.8.20', score: 90, type: 'equivalent' }, // Network security
  { source: 'HIPAA-164.312(e)(1)', target: 'A.8.24', score: 90, type: 'equivalent' }, // Use of cryptography (in transit)

  // §164.314 Organizational Requirements
  { source: 'HIPAA-164.314(a)(1)', target: 'A.5.19', score: 95, type: 'equivalent' }, // Information security in supplier relationships
  { source: 'HIPAA-164.314(a)(1)', target: 'A.5.20', score: 95, type: 'equivalent' }, // Addressing information security within supplier agreements

  // §164.316 Policies, Procedures, and Documentation
  { source: 'HIPAA-164.316(a)',    target: 'A.5.1',  score: 90, type: 'equivalent' }, // Policies for information security
  { source: 'HIPAA-164.316(b)(1)', target: 'A.5.37', score: 85, type: 'related' },    // Documented operating procedures
  { source: 'HIPAA-164.316(b)(2)', target: 'A.5.37', score: 85, type: 'related' },    // Documented operating procedures (retention/review)
];

async function upsertMissingControls(client) {
  const fw = await client.query(
    "SELECT id FROM frameworks WHERE code = 'hipaa' LIMIT 1"
  );
  if (fw.rows.length === 0) {
    if (STRICT) {
      throw new Error('Strict seeding failed: framework "hipaa" not found. Run seed-frameworks.js first.');
    }
    console.warn('  [SKIP] framework "hipaa" not found — run seed-frameworks.js first');
    return 0;
  }
  const frameworkId = fw.rows[0].id;

  let inserted = 0;
  let skipped = 0;

  for (const ctrl of MISSING_HIPAA_CONTROLS) {
    const existing = await client.query(
      'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
      [frameworkId, ctrl.control_id]
    );
    if (existing.rows.length > 0) {
      skipped++;
      continue;
    }
    await client.query(
      `INSERT INTO framework_controls (framework_id, control_id, title, description, priority, control_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [frameworkId, ctrl.control_id, ctrl.title, ctrl.description, ctrl.priority, ctrl.control_type]
    );
    inserted++;
  }

  console.log(`  [OK] Missing HIPAA controls: ${inserted} inserted, ${skipped} already existed`);
  return inserted;
}

async function insertCrosswalk(client, mapping, sourceFwCode, targetFwCode) {
  const srcFw = await client.query(
    'SELECT id FROM frameworks WHERE code = $1 LIMIT 1',
    [sourceFwCode]
  );
  if (srcFw.rows.length === 0) {
    return { inserted: false, reason: `framework not found: ${sourceFwCode}` };
  }

  const srcCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [srcFw.rows[0].id, mapping.source]
  );
  if (srcCtrl.rows.length === 0) {
    return { inserted: false, reason: `control not found: ${sourceFwCode}/${mapping.source}` };
  }

  const tgtFw = await client.query(
    'SELECT id FROM frameworks WHERE code = $1 LIMIT 1',
    [targetFwCode]
  );
  if (tgtFw.rows.length === 0) {
    return { inserted: false, reason: `framework not found: ${targetFwCode}` };
  }

  const tgtCtrl = await client.query(
    'SELECT id FROM framework_controls WHERE framework_id = $1 AND control_id = $2 LIMIT 1',
    [tgtFw.rows[0].id, mapping.target]
  );
  if (tgtCtrl.rows.length === 0) {
    return { inserted: false, reason: `control not found: ${targetFwCode}/${mapping.target}` };
  }

  const existing = await client.query(
    `SELECT id FROM control_mappings
     WHERE source_control_id = $1 AND target_control_id = $2
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

async function processMappings(client, label, mappings, sourceFw, targetFw) {
  let inserted = 0;
  let skipped = 0;
  const failures = [];

  for (const mapping of mappings) {
    const result = await insertCrosswalk(client, mapping, sourceFw, targetFw);
    if (result.inserted) {
      inserted++;
    } else {
      skipped++;
      if (result.reason !== 'duplicate') {
        const detail = `${sourceFw}/${mapping.source} -> ${targetFw}/${mapping.target}: ${result.reason}`;
        console.warn(`  [SKIP] ${detail}`);
        failures.push(detail);
      }
    }
  }

  console.log(`  [OK] ${label}: ${inserted} inserted, ${skipped} skipped/already exist`);

  if (STRICT && failures.length > 0) {
    throw new Error(
      `Strict seeding failed: ${failures.length} non-duplicate mapping(s) could not be inserted for ${label}. ` +
      `Run seed-frameworks.js (and seed-missing-controls.js) first, or remove --strict to allow partial seeding.`
    );
  }

  return inserted;
}

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log('\n=== HIPAA Security Rule Crosswalk Enhancement ===\n');

    let controlsAdded = await upsertMissingControls(client);

    let mappingsAdded = 0;
    mappingsAdded += await processMappings(
      client,
      'HIPAA → NIST SP 800-53 Rev 5',
      HIPAA_TO_NIST_800_53,
      'hipaa',
      'nist_800_53'
    );
    mappingsAdded += await processMappings(
      client,
      'HIPAA → ISO/IEC 27001:2022',
      HIPAA_TO_ISO_27001,
      'hipaa',
      'iso_27001'
    );

    await client.query('COMMIT');

    const hipaaCount = await client.query(
      "SELECT COUNT(*) AS n FROM framework_controls fc JOIN frameworks f ON f.id = fc.framework_id WHERE f.code = 'hipaa'"
    );

    console.log('\n========================================');
    console.log(`New HIPAA controls added:     ${controlsAdded}`);
    console.log(`New crosswalk mappings added: ${mappingsAdded}`);
    console.log(`Total HIPAA controls:         ${hipaaCount.rows[0].n}`);
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

if (require.main === module) {
  main();
}

module.exports = {
  MISSING_HIPAA_CONTROLS,
  HIPAA_TO_NIST_800_53,
  HIPAA_TO_ISO_27001,
};
