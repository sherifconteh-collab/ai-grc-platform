import 'dotenv/config';
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function loadSchema() {
  try {
    await client.connect();
    console.log('✅ Connected to database');

    // Load schema
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    console.log('📋 Loading database schema...');
    await client.query(schema);
    console.log('✅ Schema loaded successfully');

    // Load seed files in order
    const seedFiles = [
      '01_nist_csf_2.0.sql',
      '02_nist_ai_rmf.sql',
      '03_iso_soc2_others.sql',
      '04_nist_800_171.sql',
      '05_nist_800_53_moderate.sql',
      '06_crosswalk_mappings.sql'
    ];

    console.log('📚 Loading framework data...');
    for (const seedFile of seedFiles) {
      const seedPath = path.join(__dirname, '../db/seeds', seedFile);
      if (fs.existsSync(seedPath)) {
        console.log(`   • Loading ${seedFile}...`);
        const seedData = fs.readFileSync(seedPath, 'utf8');
        await client.query(seedData);
      } else {
        console.log(`   ⚠️  ${seedFile} not found, skipping...`);
      }
    }

    console.log('✅ All data loaded successfully');

    // Get stats
    const result = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM frameworks) as framework_count,
        (SELECT COUNT(*) FROM framework_controls) as control_count,
        (SELECT COUNT(*) FROM control_mappings) as mapping_count
    `);

    console.log('\n📊 Database Statistics:');
    console.log(`   • Frameworks: ${result.rows[0].framework_count}`);
    console.log(`   • Controls: ${result.rows[0].control_count}`);
    console.log(`   • Mappings: ${result.rows[0].mapping_count}`);

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    await client.end();
    process.exit(1);
  }
}

loadSchema();
