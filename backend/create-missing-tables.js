import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function createMissingTables() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    console.log('📋 Creating missing tables...\n');

    // Create framework_controls table
    console.log('   • Creating framework_controls...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS framework_controls (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          framework_id UUID REFERENCES frameworks(id) ON DELETE CASCADE,
          function_id UUID REFERENCES framework_functions(id),
          category_id UUID REFERENCES framework_categories(id),
          control_id VARCHAR(100) NOT NULL,
          title VARCHAR(500) NOT NULL,
          description TEXT NOT NULL,
          implementation_guidance TEXT,
          example_implementations TEXT,
          control_type VARCHAR(50),
          automation_level VARCHAR(50),
          maturity_level INTEGER,
          priority VARCHAR(20),
          references TEXT[],
          related_controls TEXT[],
          display_order INTEGER,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(framework_id, control_id)
      )
    `);

    // Create control_parameters table
    console.log('   • Creating control_parameters...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_parameters (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
          parameter_name VARCHAR(255) NOT NULL,
          parameter_description TEXT,
          parameter_type VARCHAR(50),
          default_value TEXT,
          allowed_values TEXT[],
          is_required BOOLEAN DEFAULT FALSE
      )
    `);

    // Create control_implementations table
    console.log('   • Creating control_implementations...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_implementations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
          status VARCHAR(50) DEFAULT 'not_started',
          implementation_date DATE,
          last_review_date DATE,
          next_review_date DATE,
          owner_id UUID REFERENCES users(id),
          implementation_notes TEXT,
          evidence_location TEXT,
          maturity_score INTEGER,
          UNIQUE(organization_id, control_id)
      )
    `);

    // Create assessment_findings table
    console.log('   • Creating assessment_findings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS assessment_findings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          assessment_id UUID REFERENCES assessments(id) ON DELETE CASCADE,
          control_id UUID REFERENCES framework_controls(id),
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

    // Create control_evidence table
    console.log('   • Creating control_evidence...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_evidence (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          control_implementation_id UUID REFERENCES control_implementations(id) ON DELETE CASCADE,
          evidence_type VARCHAR(100),
          file_name VARCHAR(500),
          file_path TEXT,
          file_size BIGINT,
          uploaded_by UUID REFERENCES users(id),
          uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          description TEXT
      )
    `);

    // Create ai_system_controls table
    console.log('   • Creating ai_system_controls...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_system_controls (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          ai_system_id UUID REFERENCES ai_systems(id) ON DELETE CASCADE,
          control_id UUID REFERENCES framework_controls(id),
          status VARCHAR(50) DEFAULT 'not_started',
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(ai_system_id, control_id)
      )
    `);

    // Create risk_treatments table
    console.log('   • Creating risk_treatments...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS risk_treatments (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          risk_id UUID REFERENCES risks(id) ON DELETE CASCADE,
          treatment_type VARCHAR(50),
          description TEXT,
          status VARCHAR(50) DEFAULT 'planned',
          target_date DATE,
          owner_id UUID REFERENCES users(id),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create control_mappings table
    console.log('   • Creating control_mappings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS control_mappings (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          source_control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
          target_control_id UUID REFERENCES framework_controls(id) ON DELETE CASCADE,
          mapping_type VARCHAR(50),
          similarity_score INTEGER,
          notes TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(source_control_id, target_control_id)
      )
    `);

    console.log('\n✅ All missing tables created successfully!\n');

    // Create indexes
    console.log('📇 Creating indexes...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_framework_controls_framework ON framework_controls(framework_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_control_implementations_org ON control_implementations(organization_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_risks_org ON risks(organization_id)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_ai_systems_org ON ai_systems(organization_id)`);
    console.log('✅ Indexes created\n');

    await client.end();
    console.log('✅ Database setup complete!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
    await client.end();
    process.exit(1);
  }
}

createMissingTables();
