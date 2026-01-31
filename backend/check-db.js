import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const client = new Client({
  connectionString: process.env.DATABASE_URL,
});

async function checkDatabase() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check what tables exist
    const tablesResult = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`📊 Tables in database: ${tablesResult.rows.length}`);
    if (tablesResult.rows.length > 0) {
      tablesResult.rows.forEach(row => {
        console.log(`   • ${row.table_name}`);
      });
    } else {
      console.log('   (no tables found)');
    }

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    await client.end();
    process.exit(1);
  }
}

checkDatabase();
