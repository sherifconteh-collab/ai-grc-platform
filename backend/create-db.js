import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

// Connect to default postgres database to create our database
const client = new Client({
  user: 'postgres',
  password: 'ShakaZulu12!',
  host: 'localhost',
  database: 'postgres',  // Connect to default database
  port: 5432,
});

async function createDatabase() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    // Check if database exists
    const checkDb = await client.query(
      "SELECT 1 FROM pg_database WHERE datname='ai_grc_platform'"
    );

    if (checkDb.rows.length > 0) {
      console.log('✅ Database ai_grc_platform already exists');
    } else {
      // Create database
      await client.query('CREATE DATABASE ai_grc_platform');
      console.log('✅ Database ai_grc_platform created successfully');
    }

    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err);
    process.exit(1);
  }
}

createDatabase();
