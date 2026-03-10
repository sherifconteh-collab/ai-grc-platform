// @tier: free
const pool = require('../src/config/database');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const migrationFile = process.argv[2] || '006_ai_decision_log.sql';
  const client = await pool.connect();

  try {
    console.log(`\n🔄 Running migration: ${migrationFile}`);
    const sql = fs.readFileSync(
      path.join(__dirname, '../migrations', migrationFile),
      'utf8'
    );

    await client.query(sql);
    console.log(`✅ Migration ${migrationFile} applied successfully\n`);
  } catch (err) {
    console.error(`\n❌ Migration failed:`, err.message);
    if (err.detail) console.error('Detail:', err.detail);
    if (err.hint) console.error('Hint:', err.hint);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
