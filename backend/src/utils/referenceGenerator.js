// @tier: community
/**
 * Human-readable per-organization reference codes (R-0001, INC-0007, OBL-0012).
 *
 * These are what people say out loud in a risk committee, quote in an audit
 * report, and paste into an email. A UUID cannot do that job.
 *
 * Sequencing is per organization and derived from the highest existing
 * reference rather than a global sequence, so tenant A's numbering never
 * reveals tenant B's volume — an organization that can see its own risks
 * jumping from R-0004 to R-0140 has learned something about another customer.
 */

// Each register that uses references is registered here with its query written
// out in full rather than a table name interpolated at call time. Table names
// cannot be parameterized in SQL, so the only way to keep this free of string
// interpolation — and free of any path where a caller could influence the
// statement — is to have no dynamic fragment at all.
const MAX_SEQ_SELECT = `SELECT COALESCE(MAX(
     CASE WHEN reference ~ ('^' || $2 || '-[0-9]+$')
          THEN CAST(SUBSTRING(reference FROM '[0-9]+$') AS integer)
          ELSE 0 END), 0) AS max_seq
   FROM`;

const REFERENCE_SOURCES = {
  risk: {
    prefix: 'R',
    query: `${MAX_SEQ_SELECT} risks WHERE organization_id = $1 AND reference LIKE $3`
  },
  incident: {
    prefix: 'INC',
    query: `${MAX_SEQ_SELECT} incidents WHERE organization_id = $1 AND reference LIKE $3`
  },
  obligation: {
    prefix: 'OBL',
    query: `${MAX_SEQ_SELECT} compliance_obligations WHERE organization_id = $1 AND reference LIKE $3`
  },
  objective: {
    prefix: 'OBJ',
    query: `${MAX_SEQ_SELECT} business_objectives WHERE organization_id = $1 AND reference LIKE $3`
  },
  indicator: {
    prefix: 'IND',
    query: `${MAX_SEQ_SELECT} indicators WHERE organization_id = $1 AND reference LIKE $3`
  }
};

const REFERENCE_PAD = 4;

/**
 * Allocate the next reference for a register within one organization.
 *
 * @param {Object} executor - pool or transaction client (both expose query()).
 * @param {string} kind - key of REFERENCE_SOURCES.
 * @param {string} organizationId
 * @returns {Promise<string>} e.g. 'R-0007'
 */
async function nextReference(executor, kind, organizationId) {
  const source = REFERENCE_SOURCES[kind];
  if (!source) {
    throw new Error(`Unknown reference kind: ${kind}`);
  }

  // Parse the numeric tail of references that match this prefix and take the
  // maximum. Rows with a hand-entered reference in another shape are ignored
  // rather than breaking allocation.
  const result = await executor.query(
    source.query,
    [organizationId, source.prefix, `${source.prefix}-%`]
  );

  const next = Number(result.rows[0]?.max_seq || 0) + 1;
  return `${source.prefix}-${String(next).padStart(REFERENCE_PAD, '0')}`;
}

module.exports = { nextReference, REFERENCE_SOURCES };
