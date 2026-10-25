// processPendingJobs must claim queued platform_jobs atomically so that two
// concurrent callers (two instances) never run the same job.

jest.mock('../../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../../src/utils/logger', () => ({ log: jest.fn(), serializeError: jest.fn((e) => String(e)) }));
jest.mock('../../src/services/webhookService', () => ({ processPendingWebhookDeliveries: jest.fn() }));
jest.mock('../../src/services/scheduledReportService', () => ({ generateReportFile: jest.fn() }));
jest.mock('../../src/services/emailService', () => ({ sendReportEmail: jest.fn() }));
jest.mock('../../src/services/baselineScope', () => ({ BASELINE_SCOPE_PREDICATE: 'true' }));

const pool = require('../../src/config/database');
const { processPendingJobs } = require('../../src/services/jobService');

// In-memory stand-in for platform_jobs. The claim statement is applied in one
// synchronous step, like Postgres row locking with SKIP LOCKED: rows already
// moved to 'running' are never returned to a second caller.
function installFakeJobsTable(rows) {
  const claimSql = [];
  pool.query.mockImplementation(async (sql, params) => {
    await Promise.resolve();
    if (/^\s*UPDATE platform_jobs\s+SET status = 'running'/.test(sql)) {
      claimSql.push(sql);
      const limit = params[params.length - 1];
      const claimed = rows
        .filter((r) => r.status === 'queued')
        .slice(0, limit)
        .map((r) => {
          r.status = 'running';
          r.attempts += 1;
          return { ...r };
        });
      return { rows: claimed, rowCount: claimed.length };
    }
    if (/^\s*UPDATE platform_jobs/.test(sql)) {
      const row = rows.find((r) => r.id === params[0]);
      if (row) row.status = /status = 'completed'/.test(sql) ? 'completed' : params[1];
      return { rows: [], rowCount: 1 };
    }
    throw new Error(`unexpected query: ${sql}`);
  });
  return claimSql;
}

function makeJobs(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `job-${i}`,
    organization_id: null,
    job_type: 'integration_sync',
    payload: {},
    status: 'queued',
    attempts: 0,
    max_attempts: 5,
    created_at: new Date(2026, 0, 1, 0, 0, i).toISOString()
  }));
}

describe('processPendingJobs claim', () => {
  beforeEach(() => pool.query.mockReset());

  test('claims with a single UPDATE using FOR UPDATE SKIP LOCKED and RETURNING', async () => {
    const claimSql = installFakeJobsTable(makeJobs(1));
    await processPendingJobs({});
    expect(claimSql).toHaveLength(1);
    expect(claimSql[0]).toMatch(/WHERE id IN \(/);
    expect(claimSql[0]).toMatch(/FOR UPDATE SKIP LOCKED/);
    expect(claimSql[0]).toMatch(/RETURNING \*/);
  });

  test('two concurrent callers never run the same job', async () => {
    const rows = makeJobs(6);
    installFakeJobsTable(rows);

    const [a, b] = await Promise.all([
      processPendingJobs({ limit: 4 }),
      processPendingJobs({ limit: 4 })
    ]);

    const ids = [...a.details, ...b.details].map((d) => d.id);
    expect(ids).toHaveLength(6);
    expect(new Set(ids).size).toBe(6);
    expect(a.attempted + b.attempted).toBe(6);
    expect(rows.every((r) => r.attempts === 1 && r.status === 'completed')).toBe(true);
  });

  test('a second call finds nothing once the jobs are claimed', async () => {
    installFakeJobsTable(makeJobs(3));
    const first = await processPendingJobs({});
    const second = await processPendingJobs({});
    expect(first.attempted).toBe(3);
    expect(second.attempted).toBe(0);
  });
});
