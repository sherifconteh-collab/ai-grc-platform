require('dotenv').config();
const { Pool } = require('pg');

const useConnectionString = Boolean(String(process.env.DATABASE_URL || '').trim());
const individualDbVars = ['DB_HOST', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missingIndividualDbVars = individualDbVars.filter((name) => !String(process.env[name] || '').trim());
const hasIndividualDbConfig = missingIndividualDbVars.length === 0;
const isDatabaseConfigured = useConnectionString || hasIndividualDbConfig;
const sslMode = String(process.env.DB_SSL_MODE || '').toLowerCase();
const useSsl = sslMode === 'require';
const rejectUnauthorized = String(process.env.DB_SSL_REJECT_UNAUTHORIZED || 'true').toLowerCase() !== 'false';

const poolOptions = {
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DB_POOL_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DB_POOL_CONNECT_TIMEOUT_MS || '2000', 10),
};

if (useSsl) {
  poolOptions.ssl = { rejectUnauthorized };
}

if (useConnectionString) {
  poolOptions.connectionString = process.env.DATABASE_URL;
} else {
  poolOptions.host = process.env.DB_HOST;
  poolOptions.port = process.env.DB_PORT;
  poolOptions.database = process.env.DB_NAME;
  poolOptions.user = process.env.DB_USER;
  poolOptions.password = process.env.DB_PASSWORD;
}

const pool = new Pool(poolOptions);

pool.isConfigured = isDatabaseConfigured;
pool.missingConfig = useConnectionString ? [] : missingIndividualDbVars;

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  // Don't exit on pool errors - let health checks handle it
  // The application should remain available for other operations
});

// withOrgContext runs fn(client) inside a transaction with app.org_id set.
// RLS policies on key tables use this session variable as a second isolation
// layer (defense-in-depth). Existing routes using pool.query directly are
// unaffected — the variable is only active within the transaction.
async function withOrgContext(orgId, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL app.org_id = $1', [String(orgId)]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = pool;
module.exports.withOrgContext = withOrgContext;
