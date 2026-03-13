// @tier: community
require('dotenv').config();
const { Pool } = require('pg');

const useConnectionString = Boolean(process.env.DATABASE_URL);
const sslMode = String(process.env.DB_SSL_MODE || '').toLowerCase();
const useSsl = sslMode === 'require';
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

const options = useConnectionString
  ? { connectionString: process.env.DATABASE_URL }
  : {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD
    };

if (useSsl) {
  options.ssl = { rejectUnauthorized };
}

const pool = new Pool(options);

async function check() {
  try {
    const cols = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name='frameworks' ORDER BY ordinal_position"
    );
    console.log('Frameworks columns:', cols.rows.map(c => c.column_name));

    const data = await pool.query('SELECT * FROM frameworks LIMIT 5');
    console.log('Frameworks data:', data.rows);

    const controls = await pool.query('SELECT COUNT(*) as count FROM framework_controls');
    console.log('Framework controls:', controls.rows[0].count);

    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('organization_frameworks','evidence','ai_usage_log','organization_settings') ORDER BY table_name"
    );
    console.log('New tables:', tables.rows.map(t => t.table_name));
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await pool.end();
  }
}

check();
