const mockQuery = jest.fn();
const mockClient = { query: mockQuery, release: jest.fn() };

jest.mock('../../src/config/database', () => ({
  connect: jest.fn(() => Promise.resolve(mockClient)),
  query: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  log: jest.fn(),
  serializeError: jest.fn((error) => ({ message: error?.message }))
}));

const pool = require('../../src/config/database');
const service = require('../../src/services/crosswalkCreditService');

/**
 * Drives the mocked client by matching on SQL fragments, so a test states the
 * database's answers rather than the call order. Order-coupled mocks break
 * every time the service gains a query.
 */
function primeClient(handlers) {
  mockQuery.mockReset();
  mockQuery.mockImplementation((sql) => {
    const text = String(sql);
    for (const [fragment, response] of handlers) {
      if (text.includes(fragment)) return Promise.resolve(response);
    }
    return Promise.resolve({ rows: [], rowCount: 0 });
  });
}

const CREDIT_INSERT = 'INSERT INTO control_crosswalk_credits';
const PRIOR_SELECT = 'SELECT DISTINCT ON (target_control_id)';

function callsMatching(fragment) {
  return mockQuery.mock.calls.filter(([sql]) => String(sql).includes(fragment));
}

describe('crosswalkCreditService', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockClient.release.mockReset();
    pool.connect.mockClear();
  });

  describe('recordCredits', () => {
    it('does nothing when the caller credited nothing', async () => {
      primeClient([]);
      const written = await service.recordCredits(mockClient, {
        organizationId: 'org-1', sourceControlId: 'src-1', credits: [], actorUserId: 'user-1'
      });
      expect(written).toBe(0);
      expect(mockQuery).not.toHaveBeenCalled();
    });

    it('records provenance for each credited target', async () => {
      primeClient([
        [PRIOR_SELECT, { rows: [] }],
        [CREDIT_INSERT, { rowCount: 2 }]
      ]);

      const written = await service.recordCredits(mockClient, {
        organizationId: 'org-1',
        sourceControlId: 'src-1',
        credits: [
          { targetControlId: 'tgt-1', similarityScore: 95, mappingType: 'equivalent', previousStatus: 'not_started' },
          { targetControlId: 'tgt-2', similarityScore: 100, mappingType: 'exact', previousStatus: 'not_started' }
        ],
        actorUserId: 'user-1'
      });

      expect(written).toBe(2);
      const [, params] = callsMatching(CREDIT_INSERT)[0];
      expect(params).toEqual(expect.arrayContaining([
        'org-1', 'src-1', 'user-1', ['tgt-1', 'tgt-2'], [95, 100], ['equivalent', 'exact']
      ]));
    });

    it('reuses the first credit\'s prior status when a second source credits the same target', async () => {
      // The target is already satisfied_via_crosswalk from another source, whose
      // credit captured the real prior state.
      primeClient([
        [PRIOR_SELECT, { rows: [{ target_control_id: 'tgt-1', previous_status: 'in_progress' }] }],
        [CREDIT_INSERT, { rowCount: 1 }]
      ]);

      await service.recordCredits(mockClient, {
        organizationId: 'org-1',
        sourceControlId: 'src-2',
        credits: [{ targetControlId: 'tgt-1', similarityScore: 91, mappingType: 'equivalent', previousStatus: 'satisfied_via_crosswalk' }],
        actorUserId: 'user-1'
      });

      const [, params] = callsMatching(CREDIT_INSERT)[0];
      // previous_status must never be 'satisfied_via_crosswalk', or withdrawing
      // the last source would restore the target to a status that was itself
      // only ever crosswalk credit.
      expect(params).toContainEqual(['in_progress']);
    });

    it('falls back to not_started when a crosswalk-satisfied target has no prior credit', async () => {
      primeClient([[PRIOR_SELECT, { rows: [] }], [CREDIT_INSERT, { rowCount: 1 }]]);

      await service.recordCredits(mockClient, {
        organizationId: 'org-1',
        sourceControlId: 'src-2',
        credits: [{ targetControlId: 'tgt-1', similarityScore: 91, previousStatus: 'satisfied_via_crosswalk' }],
        actorUserId: null
      });

      const [, params] = callsMatching(CREDIT_INSERT)[0];
      expect(params).toContainEqual(['not_started']);
    });
  });

  describe('withdrawCredits', () => {
    it('restores a target when no other source still justifies it', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [{ target_control_id: 'tgt-1', previous_status: 'not_started' }] }],
        ['FROM control_crosswalk_credits ccc', { rows: [] }],
        ['UPDATE control_implementations', { rowCount: 1 }]
      ]);

      const restored = await service.withdrawCredits(mockClient, {
        organizationId: 'org-1', sourceControlId: 'src-1'
      });

      expect(restored).toBe(1);
      const [, params] = callsMatching('UPDATE control_implementations')[0];
      expect(params).toContain('not_started');
    });

    it('leaves credit in place when another implemented source still justifies it', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [{ target_control_id: 'tgt-1', previous_status: 'not_started' }] }],
        ['FROM control_crosswalk_credits ccc', { rows: [{ '?column?': 1 }] }]
      ]);

      const restored = await service.withdrawCredits(mockClient, {
        organizationId: 'org-1', sourceControlId: 'src-1'
      });

      expect(restored).toBe(0);
      expect(callsMatching('UPDATE control_implementations')).toHaveLength(0);
    });

    it('only rewrites controls still sitting on crosswalk credit', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [{ target_control_id: 'tgt-1', previous_status: 'in_progress' }] }],
        ['FROM control_crosswalk_credits ccc', { rows: [] }]
      ]);

      await service.withdrawCredits(mockClient, { organizationId: 'org-1', sourceControlId: 'src-1' });

      const [sql, params] = callsMatching('UPDATE control_implementations')[0];
      expect(sql).toContain("status = 'satisfied_via_crosswalk'");
      // Restores what was actually there, not a hardcoded not_started.
      expect(params).toContain('in_progress');
    });

    it('scopes both the delete and the restore to the organization', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [{ target_control_id: 'tgt-1', previous_status: 'not_started' }] }],
        ['FROM control_crosswalk_credits ccc', { rows: [] }]
      ]);

      await service.withdrawCredits(mockClient, { organizationId: 'org-1', sourceControlId: 'src-1' });

      for (const fragment of ['DELETE FROM control_crosswalk_credits', 'UPDATE control_implementations']) {
        const [sql, params] = callsMatching(fragment)[0];
        expect(sql).toContain('organization_id');
        expect(params).toContain('org-1');
      }
    });
  });

  describe('handleSourceStatusChange', () => {
    it.each(['implemented', 'verified'])('does not withdraw while the source is still %s', async (status) => {
      primeClient([]);
      const result = await service.handleSourceStatusChange({
        organizationId: 'org-1', controlId: 'src-1', newStatus: status, actorUserId: 'user-1'
      });
      expect(result).toEqual({ withdrawn: 0 });
      expect(pool.connect).not.toHaveBeenCalled();
    });

    it('writes an AU-2 audit row when credit is actually withdrawn', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [{ target_control_id: 'tgt-1', previous_status: 'not_started' }] }],
        ['FROM control_crosswalk_credits ccc', { rows: [] }],
        ['UPDATE control_implementations', { rowCount: 1 }],
        ['INSERT INTO audit_logs', { rowCount: 1 }]
      ]);

      const result = await service.handleSourceStatusChange({
        organizationId: 'org-1', controlId: 'src-1', newStatus: 'in_progress', actorUserId: 'user-1'
      });

      expect(result.withdrawn).toBe(1);
      const [sql, params] = callsMatching('INSERT INTO audit_logs')[0];
      expect(sql).toContain('crosswalk_credit_withdrawn');
      expect(params).toContain('org-1');
      expect(JSON.parse(params[3])).toMatchObject({ controls_restored: 1 });
      expect(callsMatching('COMMIT')).toHaveLength(1);
    });

    it('skips the audit row when nothing was withdrawn', async () => {
      primeClient([
        ['DELETE FROM control_crosswalk_credits', { rows: [] }]
      ]);

      await service.handleSourceStatusChange({
        organizationId: 'org-1', controlId: 'src-1', newStatus: 'not_started', actorUserId: 'user-1'
      });

      expect(callsMatching('INSERT INTO audit_logs')).toHaveLength(0);
    });

    it('rolls back and reports failure without throwing into the caller', async () => {
      mockQuery.mockReset();
      mockQuery.mockImplementation((sql) => {
        if (String(sql).includes('DELETE FROM control_crosswalk_credits')) {
          return Promise.reject(new Error('ledger delete exploded'));
        }
        return Promise.resolve({ rows: [], rowCount: 0 });
      });

      // Bookkeeping failure must never fail the status change the user made.
      const result = await service.handleSourceStatusChange({
        organizationId: 'org-1', controlId: 'src-1', newStatus: 'in_progress', actorUserId: 'user-1'
      });

      expect(result).toMatchObject({ withdrawn: 0, error: true });
      expect(callsMatching('ROLLBACK')).toHaveLength(1);
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getCreditsForControl', () => {
    it('scopes provenance to the organization and orders by strength', async () => {
      pool.query.mockResolvedValueOnce({ rows: [{ similarity_score: 95 }] });

      const rows = await service.getCreditsForControl('org-1', 'tgt-1');

      expect(rows).toHaveLength(1);
      const [sql, params] = pool.query.mock.calls[0];
      expect(sql).toContain('ccc.organization_id = $1');
      expect(sql).toContain('ORDER BY ccc.similarity_score DESC');
      expect(params).toEqual(['org-1', 'tgt-1']);
    });
  });
});
