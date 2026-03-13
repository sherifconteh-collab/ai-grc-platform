// @tier: community
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

/**
 * Apply Security Baseline to ControlWeave
 * 
 * This script applies a comprehensive security baseline incorporating:
 * - DISA STIG Application Security controls
 * - NIST SP 800-53 Rev 5 security controls
 * - NIST Cybersecurity Framework 2.0
 * - ISO 27001:2022
 * - SOC 2 Type II
 * - HIPAA Security Rule
 * - GDPR requirements
 * 
 * The baseline ensures audit readiness and comprehensive security coverage.
 */

async function applySecurityBaseline() {
  const client = await pool.connect();
  
  try {
    console.log('='.repeat(80));
    console.log('CONTROLWEAVE SECURITY BASELINE APPLICATION');
    console.log('='.repeat(80));
    console.log();
    
    await client.query('BEGIN');
    
    // Get all organizations
    const orgsResult = await client.query(
      'SELECT id, name FROM organizations ORDER BY created_at'
    );
    
    if (orgsResult.rows.length === 0) {
      console.log('No organizations found. Please create organizations first.');
      await client.query('ROLLBACK');
      return;
    }
    
    console.log(`Found ${orgsResult.rows.length} organization(s):`);
    orgsResult.rows.forEach((org, idx) => {
      console.log(`  ${idx + 1}. ${org.name} (${org.id})`);
    });
    console.log();
    
    // Security frameworks to apply
    const securityFrameworks = [
      'disa_stig_app',      // DISA Application Security STIG
      'nist_800_53',        // NIST SP 800-53 Rev 5
      'nist_csf_2.0',       // NIST Cybersecurity Framework 2.0
      'iso_27001',          // ISO/IEC 27001:2022
      'soc2',               // SOC 2 Type II
      'hipaa',              // HIPAA Security Rule
      'gdpr',               // GDPR
      'nist_800_171',       // NIST SP 800-171 (CUI)
      'nist_privacy',       // NIST Privacy Framework
      'nist_ai_rmf'         // NIST AI Risk Management Framework
    ];
    
    console.log('Security Frameworks in Baseline:');
    securityFrameworks.forEach((code, idx) => {
      console.log(`  ${idx + 1}. ${code}`);
    });
    console.log();
    
    // Verify all frameworks exist
    const frameworksResult = await client.query(
      `SELECT id, code, name, version 
       FROM frameworks 
       WHERE code = ANY($1::text[])`,
      [securityFrameworks]
    );
    
    const foundFrameworks = frameworksResult.rows;
    const foundCodes = foundFrameworks.map(f => f.code);
    const missingFrameworks = securityFrameworks.filter(code => !foundCodes.includes(code));
    
    if (missingFrameworks.length > 0) {
      console.log('WARNING: The following frameworks are not yet seeded:');
      missingFrameworks.forEach(code => {
        console.log(`  - ${code}`);
      });
      console.log('Please run the appropriate seed scripts first.');
      console.log();
    }
    
    console.log('Available Frameworks:');
    foundFrameworks.forEach(fw => {
      console.log(`  ✓ ${fw.code}: ${fw.name} ${fw.version}`);
    });
    console.log();
    
    // Apply baseline to each organization
    for (const org of orgsResult.rows) {
      console.log('-'.repeat(80));
      console.log(`Applying security baseline to: ${org.name}`);
      console.log('-'.repeat(80));
      
      // Check which frameworks are already selected
      const selectedFrameworksResult = await client.query(
        `SELECT framework_id, f.code, f.name
         FROM organization_frameworks of
         JOIN frameworks f ON of.framework_id = f.id
         WHERE of.organization_id = $1`,
        [org.id]
      );
      
      const selectedFrameworkIds = selectedFrameworksResult.rows.map(r => r.framework_id);
      
      console.log(`Currently selected frameworks: ${selectedFrameworksResult.rows.length}`);
      if (selectedFrameworksResult.rows.length > 0) {
        selectedFrameworksResult.rows.forEach(sf => {
          console.log(`  - ${sf.code}: ${sf.name}`);
        });
      }
      console.log();
      
      // Add missing frameworks to organization
      let addedCount = 0;
      for (const framework of foundFrameworks) {
        if (!selectedFrameworkIds.includes(framework.id)) {
          await client.query(
            `INSERT INTO organization_frameworks (organization_id, framework_id)
             VALUES ($1, $2)
             ON CONFLICT (organization_id, framework_id) DO NOTHING`,
            [org.id, framework.id]
          );
          console.log(`  ✓ Added framework: ${framework.code}`);
          addedCount++;
        }
      }
      
      if (addedCount === 0) {
        console.log('  All security frameworks already applied.');
      } else {
        console.log(`  Added ${addedCount} new security framework(s).`);
      }
      console.log();
      
      // Get all controls from selected frameworks
      const controlsResult = await client.query(
        `SELECT fc.id, fc.framework_id, fc.control_id, fc.title, 
                fc.priority, fc.control_type, f.code as framework_code
         FROM framework_controls fc
         JOIN frameworks f ON fc.framework_id = f.id
         WHERE f.id = ANY($1::uuid[])
         ORDER BY f.code, fc.control_id`,
        [foundFrameworks.map(fw => fw.id)]
      );
      
      console.log(`Total controls across all frameworks: ${controlsResult.rows.length}`);
      
      // Create control implementations for high-priority controls
      let implCreatedCount = 0;
      const highPriorityControls = controlsResult.rows.filter(c => c.priority === '1');
      
      console.log(`Creating implementations for ${highPriorityControls.length} Priority 1 controls...`);
      
      for (const control of highPriorityControls) {
        // Check if implementation already exists
        const existingImpl = await client.query(
          `SELECT id FROM control_implementations
           WHERE organization_id = $1 AND control_id = $2`,
          [org.id, control.id]
        );
        
        if (existingImpl.rows.length === 0) {
          // Create default implementation
          await client.query(
            `INSERT INTO control_implementations 
             (organization_id, control_id, status, implementation_narrative)
             VALUES ($1, $2, $3, $4)`,
            [
              org.id,
              control.id,
              'needs_review',
              `This control is part of the ${control.framework_code} security baseline and requires implementation review.`
            ]
          );
          implCreatedCount++;
        }
      }
      
      console.log(`  ✓ Created ${implCreatedCount} control implementation records.`);
      console.log();
    }
    
    await client.query('COMMIT');
    
    console.log('='.repeat(80));
    console.log('SECURITY BASELINE APPLICATION COMPLETE');
    console.log('='.repeat(80));
    console.log();
    console.log('Summary:');
    console.log(`  - Organizations processed: ${orgsResult.rows.length}`);
    console.log(`  - Security frameworks in baseline: ${foundFrameworks.length}`);
    console.log('  - Status: All organizations now have comprehensive security baseline');
    console.log();
    console.log('Next Steps:');
    console.log('  1. Review control implementations in the application');
    console.log('  2. Update implementation status and narratives');
    console.log('  3. Upload evidence for implemented controls');
    console.log('  4. Run compliance assessments');
    console.log('  5. Generate audit reports');
    console.log();
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error applying security baseline:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the script
if (require.main === module) {
  applySecurityBaseline()
    .then(() => {
      console.log('Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

module.exports = { applySecurityBaseline };
