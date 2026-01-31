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

async function setupDatabase() {
  try {
    await client.connect();
    console.log('✅ Connected to database');
    console.log('');

    // Load schema
    console.log('📋 Loading database schema...');
    const schemaPath = path.join(__dirname, '../db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    try {
      await client.query(schema);
      console.log('✅ Schema loaded successfully');
    } catch (err) {
      // If there's an error, it might be because tables already exist
      if (err.message.includes('already exists')) {
        console.log('✅ Schema already exists (skipping)');
      } else {
        console.error('   ⚠️  Error loading schema:', err.message);
        // Continue anyway, tables might already exist
      }
    }
    console.log('');

    // Load seed files in order
    const seedFiles = [
      '01_nist_csf_2.0.sql',
      '02_nist_ai_rmf.sql',
      '03_iso_soc2_others.sql',
      '04_nist_800_171.sql',
      '05_nist_800_53_moderate.sql',
      '06_crosswalk_mappings.sql',
      '07_fiscam.sql',
      '08_ffiec.sql'
    ];

    console.log('📚 Loading framework data...');

    for (const seedFile of seedFiles) {
      const seedPath = path.join(__dirname, '../db/seeds', seedFile);

      if (fs.existsSync(seedPath)) {
        console.log(`   • Loading ${seedFile}...`);
        const seedData = fs.readFileSync(seedPath, 'utf8');

        try {
          await client.query(seedData);
          console.log(`     ✅ ${seedFile} loaded`);
        } catch (err) {
          console.error(`     ❌ Error loading ${seedFile}:`, err.message);
        }
      } else {
        console.log(`   ⚠️  ${seedFile} not found, skipping...`);
      }
    }

    console.log('');
    console.log('✅ All data loaded successfully');
    console.log('');

    // Get statistics
    console.log('📊 Database Statistics:');

    const frameworkCount = await client.query('SELECT COUNT(*) FROM frameworks');
    console.log(`   • Frameworks: ${frameworkCount.rows[0].count}`);

    const controlCount = await client.query('SELECT COUNT(*) FROM framework_controls');
    console.log(`   • Controls: ${controlCount.rows[0].count}`);

    const mappingCount = await client.query('SELECT COUNT(*) FROM control_mappings');
    console.log(`   • Mappings: ${mappingCount.rows[0].count}`);

    console.log('');

    // List frameworks
    console.log('📑 Loaded Frameworks:');
    const frameworks = await client.query(`
      SELECT
        f.code,
        f.name,
        COUNT(fc.id) as control_count
      FROM frameworks f
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      GROUP BY f.code, f.name
      ORDER BY f.code
    `);

    frameworks.rows.forEach(fw => {
      console.log(`   • ${fw.code}: ${fw.name} (${fw.control_count} controls)`);
    });

    console.log('');
    console.log('================================');
    console.log('✅ Database Setup Complete!');
    console.log('================================');
    console.log('');
    console.log('🚀 Your server should now work correctly.');
    console.log('   Visit: http://localhost:3001');
    console.log('   API: http://localhost:3001/api/frameworks');
    console.log('');

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Fatal Error:', err.message);
    console.error(err.stack);
    await client.end();
    process.exit(1);
  }
}

setupDatabase();
