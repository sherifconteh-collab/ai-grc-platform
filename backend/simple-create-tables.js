import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function createTables() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Enable UUID extension
    console.log('📦 Enabling UUID extension...');
    try {
      await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
      console.log('✅ UUID extension enabled\n');
    } catch (err) {
      console.log('✅ UUID extension already exists\n');
    }

    // Create framework_controls without foreign keys
    console.log('📋 Creating framework_controls table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS framework_controls (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          framework_id UUID,
          function_id UUID,
          category_id UUID,
          control_id VARCHAR(100) NOT NULL,
          title VARCHAR(500) NOT NULL,
          description TEXT NOT NULL,
          implementation_guidance TEXT,
          example_implementations TEXT,
          control_type VARCHAR(50),
          automation_level VARCHAR(50),
          maturity_level INTEGER,
          priority VARCHAR(20),
          "references" TEXT[],
          related_controls TEXT[],
          display_order INTEGER,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ framework_controls created\n');

    // Create control_implementations
    console.log('📋 Creating control_implementations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_implementations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID,
          control_id UUID,
          status VARCHAR(50) DEFAULT 'not_started',
          implementation_date DATE,
          last_review_date DATE,
          next_review_date DATE,
          owner_id UUID,
          implementation_notes TEXT,
          evidence_location TEXT,
          maturity_score INTEGER
      )
    `);
    console.log('✅ control_implementations created\n');

    // Create control_mappings
    console.log('📋 Creating control_mappings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_mappings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          source_control_id UUID,
          target_control_id UUID,
          mapping_type VARCHAR(50),
          similarity_score INTEGER,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ control_mappings created\n');

    // Create assessment_findings
    console.log('📋 Creating assessment_findings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_findings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          assessment_id UUID,
          control_id UUID,
          finding_type VARCHAR(50),
          severity VARCHAR(20),
          title VARCHAR(500),
          description TEXT,
          recommendation TEXT,
          status VARCHAR(50) DEFAULT 'open',
          due_date DATE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ assessment_findings created\n');

    // Create indexes
    console.log('📇 Creating indexes...');
    await client.query('CREATE INDEX IF NOT EXISTS idx_framework_controls_framework ON framework_controls(framework_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_control_implementations_org ON control_implementations(organization_id)');
    console.log('✅ Indexes created\n');

    await client.end();
    console.log('================================');
    console.log('✅ All tables created successfully!');
    console.log('================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    await client.end();
    process.exit(1);
  }
}

createTables();
