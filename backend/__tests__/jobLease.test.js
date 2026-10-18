jest.mock('../src/config/database', () => ({ query: jest.fn() }));
jest.mock('../src/utils/logger', () => ({ log: jest.fn() }));

const pool = require('../src/config/database');
const { claimJobRun } = require('../src/services/jobLease');

function pgError(code) {
  return Object.assign(new Error(code), { code });
}

describe('claimJobRun', () => {
  beforeEach(() => pool.query.mockReset());

  test('runs the job only when this instance moved the lease forward', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1 }).mockResolvedValueOnce({ rowCount: 0 });
    expect(await claimJobRun('reminders', 1800000)).toBe(true);
    expect(await claimJobRun('reminders', 1800000)).toBe(false);
    const [sql, params] = pool.query.mock.calls[0];
    expect(sql).toMatch(/ON CONFLICT \(job_name\) DO UPDATE/);
    expect(params.slice(0, 2)).toEqual(['reminders', 1800000]);
  });

  test('before migration 165 the job still runs, as it did before', async () => {
    pool.query.mockRejectedValueOnce(pgError('42P01'));
    expect(await claimJobRun('retention', 1000)).toBe(true);
  });

  test('a read-only standby database never runs jobs', async () => {
    pool.query.mockRejectedValueOnce(pgError('25006'));
    expect(await claimJobRun('db_backup', 1000)).toBe(false);
  });

  test('any other database error skips this run', async () => {
    pool.query.mockRejectedValueOnce(pgError('57P01'));
    expect(await claimJobRun('db_backup', 1000)).toBe(false);
  });
});
