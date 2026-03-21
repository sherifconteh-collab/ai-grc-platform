// @tier: community
const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { authenticate, requirePermission } = require('../middleware/auth');

router.use(authenticate);

const VALID_MAPPING_STRENGTHS = new Set(['primary', 'supporting', 'informative']);
const DEFAULT_COVERAGE = {
  mapped_controls: 0,
  primary_controls: 0,
  supporting_controls: 0,
  informative_controls: 0,
  completed_controls: 0,
  in_progress_controls: 0,
  not_started_controls: 0,
  completion_percent: 0
};

function toBoolean(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeMappingInput(mappings) {
  if (!Array.isArray(mappings)) return [];

  const deduped = new Map();
  for (const mapping of mappings) {
    const frameworkCode = String(mapping?.framework_code || '').trim();
    const controlId = String(mapping?.control_id || '').trim();
    if (!frameworkCode || !controlId) continue;

    const mappingStrength = String(mapping?.mapping_strength || 'informative').trim().toLowerCase();
    const sortOrder = Number.isFinite(Number(mapping?.sort_order))
      ? Number(mapping.sort_order)
      : 0;
    const mappingNoteRaw = mapping?.mapping_note;
    const mappingNote = mappingNoteRaw === undefined || mappingNoteRaw === null
      ? null
      : String(mappingNoteRaw).trim() || null;

    const key = `${frameworkCode}:${controlId}`;
    deduped.set(key, {
      framework_code: frameworkCode,
      control_id: controlId,
      mapping_strength: mappingStrength,
      mapping_note: mappingNote,
      sort_order: sortOrder
    });
  }

  return Array.from(deduped.values());
}

function buildPublicationFilters(rawFilters) {
  const {
    search,
    publication_family,
    publication_type,
    private_only,
    federal_only
  } = rawFilters || {};

  let query = `
    SELECT
      id,
      publication_code,
      title,
      publication_family,
      publication_type,
      status,
      summary,
      primary_use_case,
      recommended_for_private,
      federal_focus,
      publication_url,
      sort_order
    FROM nist_publications
    WHERE status = 'active'
  `;
  const params = [];
  let idx = 1;

  if (publication_family) {
    query += ` AND publication_family = $${idx++}`;
    params.push(String(publication_family));
  }

  if (publication_type) {
    query += ` AND publication_type = $${idx++}`;
    params.push(String(publication_type));
  }

  if (toBoolean(private_only, false)) {
    query += ' AND recommended_for_private = true';
  }

  if (toBoolean(federal_only, false)) {
    query += ' AND federal_focus = true';
  }

  if (search) {
    query += ` AND (
      publication_code ILIKE $${idx}
      OR title ILIKE $${idx}
      OR summary ILIKE $${idx}
      OR primary_use_case ILIKE $${idx}
    )`;
    params.push(`%${String(search)}%`);
    idx++;
  }

  query += ' ORDER BY sort_order ASC, publication_code ASC';
  return { query, params };
}

async function fetchPublications(rawFilters) {
  const { query, params } = buildPublicationFilters(rawFilters);
  const result = await pool.query(query, params);
  return result.rows.map((row) => ({
    ...row,
    related_controls: [],
    related_tasks: [],
    mappings: []
  }));
}

async function attachPublicationMappings(publications) {
  if (!publications.length) return publications;

  const publicationIds = publications.map((publication) => publication.id);
  const mappingResult = await pool.query(
    `
      SELECT
        m.id AS mapping_id,
        m.publication_id,
        m.framework_code,
        m.control_id AS mapped_control_id,
        m.mapping_strength,
        m.mapping_note,
        m.sort_order,
        f.name AS framework_name,
        fc.id AS framework_control_id,
        fc.title AS framework_control_title,
        ap.id AS procedure_id,
        ap.procedure_id,
        ap.title AS procedure_title,
        ap.procedure_type,
        ap.depth,
        ap.source_document
      FROM nist_publication_control_mappings m
      LEFT JOIN frameworks f
        ON f.code = m.framework_code
       AND f.is_active = true
      LEFT JOIN framework_controls fc
        ON fc.framework_id = f.id
       AND fc.control_id = m.control_id
      LEFT JOIN LATERAL (
        SELECT
          ap.id,
          ap.procedure_id,
          ap.title,
          ap.procedure_type,
          ap.depth,
          ap.source_document
        FROM assessment_procedures ap
        WHERE ap.framework_control_id = fc.id
        ORDER BY ap.sort_order ASC, ap.procedure_id ASC
        LIMIT 1
      ) ap ON true
      WHERE m.publication_id = ANY($1::uuid[])
      ORDER BY m.publication_id, m.sort_order ASC, m.framework_code ASC, m.control_id ASC
    `,
    [publicationIds]
  );

  const byPublication = new Map();
  publications.forEach((publication) => byPublication.set(publication.id, publication));

  const seenControlsByPublication = new Map();
  const seenTasksByPublication = new Map();

  for (const row of mappingResult.rows) {
    const publication = byPublication.get(row.publication_id);
    if (!publication) continue;

    if (!seenControlsByPublication.has(row.publication_id)) {
      seenControlsByPublication.set(row.publication_id, new Set());
    }
    if (!seenTasksByPublication.has(row.publication_id)) {
      seenTasksByPublication.set(row.publication_id, new Set());
    }

    const controlSet = seenControlsByPublication.get(row.publication_id);
    const taskSet = seenTasksByPublication.get(row.publication_id);
    const controlKey = `${row.framework_code}:${row.mapped_control_id}`;
    const frameworkControlId = row.framework_control_id || null;

    publication.mappings.push({
      id: row.mapping_id,
      framework_code: row.framework_code,
      framework_name: row.framework_name || row.framework_code,
      control_id: row.mapped_control_id,
      control_title: row.framework_control_title || row.mapped_control_id,
      framework_control_id: frameworkControlId,
      mapping_strength: row.mapping_strength,
      mapping_note: row.mapping_note,
      sort_order: row.sort_order
    });

    if (!controlSet.has(controlKey)) {
      controlSet.add(controlKey);
      publication.related_controls.push({
        framework_code: row.framework_code,
        framework_name: row.framework_name || row.framework_code,
        control_id: row.mapped_control_id,
        control_title: row.framework_control_title || row.mapped_control_id,
        framework_control_id: frameworkControlId,
        mapping_strength: row.mapping_strength,
        mapping_note: row.mapping_note
      });
    }

    const assessmentHref = `/dashboard/assessments?tab=procedures&framework_code=${encodeURIComponent(
      row.framework_code
    )}&control_id=${encodeURIComponent(row.mapped_control_id)}`;

    if (row.procedure_id) {
      const taskKey = `procedure:${row.procedure_id}`;
      if (!taskSet.has(taskKey)) {
        taskSet.add(taskKey);
        publication.related_tasks.push({
          task_id: row.procedure_id,
          title: row.procedure_title || `Assess ${row.mapped_control_id}`,
          procedure_type: row.procedure_type || 'assessment',
          depth: row.depth || 'focused',
          framework_code: row.framework_code,
          control_id: row.mapped_control_id,
          framework_control_id: frameworkControlId,
          source_document: row.source_document,
          href: assessmentHref
        });
      }
    } else {
      const taskKey = `control:${controlKey}`;
      if (!taskSet.has(taskKey)) {
        taskSet.add(taskKey);
        publication.related_tasks.push({
          task_id: `control-${row.framework_code}-${row.mapped_control_id}`,
          title: `Implement or review ${row.mapped_control_id}`,
          procedure_type: 'implementation',
          depth: 'focused',
          framework_code: row.framework_code,
          control_id: row.mapped_control_id,
          framework_control_id: frameworkControlId,
          source_document: null,
          href: assessmentHref
        });
      }
    }
  }

  publications.forEach((publication) => {
    publication.mappings.sort((a, b) => {
      if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
      if (a.framework_code !== b.framework_code) return a.framework_code.localeCompare(b.framework_code);
      return a.control_id.localeCompare(b.control_id);
    });
  });

  return publications;
}

async function fetchCoverageByPublicationIds(organizationId, publicationIds) {
  if (!publicationIds.length) return new Map();

  const result = await pool.query(
    `
      WITH mapped AS (
        SELECT DISTINCT
          m.publication_id,
          m.framework_code,
          m.control_id,
          m.mapping_strength,
          fc.id AS framework_control_id
        FROM nist_publication_control_mappings m
        LEFT JOIN frameworks f
          ON f.code = m.framework_code
         AND f.is_active = true
        LEFT JOIN framework_controls fc
          ON fc.framework_id = f.id
         AND fc.control_id = m.control_id
        WHERE m.publication_id = ANY($1::uuid[])
      ),
      stats AS (
        SELECT
          m.publication_id,
          COUNT(*)::int AS mapped_controls,
          COUNT(*) FILTER (WHERE m.mapping_strength = 'primary')::int AS primary_controls,
          COUNT(*) FILTER (WHERE m.mapping_strength = 'supporting')::int AS supporting_controls,
          COUNT(*) FILTER (WHERE m.mapping_strength = 'informative')::int AS informative_controls,
          COUNT(*) FILTER (
            WHERE ci.status IN ('implemented', 'verified', 'satisfied_via_crosswalk', 'not_applicable')
          )::int AS completed_controls,
          COUNT(*) FILTER (WHERE ci.status = 'in_progress')::int AS in_progress_controls
        FROM mapped m
        LEFT JOIN control_implementations ci
          ON ci.organization_id = $2
         AND ci.control_id = m.framework_control_id
        GROUP BY m.publication_id
      )
      SELECT
        publication_id,
        mapped_controls,
        primary_controls,
        supporting_controls,
        informative_controls,
        completed_controls,
        in_progress_controls,
        GREATEST(mapped_controls - completed_controls - in_progress_controls, 0)::int AS not_started_controls,
        CASE
          WHEN mapped_controls = 0 THEN 0
          ELSE ROUND((completed_controls::numeric * 100.0) / mapped_controls, 1)
        END AS completion_percent
      FROM stats
    `,
    [publicationIds, organizationId]
  );

  const coverage = new Map();
  for (const row of result.rows) {
    coverage.set(row.publication_id, {
      mapped_controls: Number(row.mapped_controls || 0),
      primary_controls: Number(row.primary_controls || 0),
      supporting_controls: Number(row.supporting_controls || 0),
      informative_controls: Number(row.informative_controls || 0),
      completed_controls: Number(row.completed_controls || 0),
      in_progress_controls: Number(row.in_progress_controls || 0),
      not_started_controls: Number(row.not_started_controls || 0),
      completion_percent: Number(row.completion_percent || 0)
    });
  }

  return coverage;
}

function buildCoverageSummary(publicationsWithCoverage) {
  const summary = publicationsWithCoverage.reduce((acc, publication) => {
    acc.publication_count += 1;
    acc.total_mapped_controls += publication.mapped_controls;
    acc.total_completed_controls += publication.completed_controls;
    acc.total_in_progress_controls += publication.in_progress_controls;
    return acc;
  }, {
    publication_count: 0,
    total_mapped_controls: 0,
    total_completed_controls: 0,
    total_in_progress_controls: 0
  });

  const remaining = Math.max(
    0,
    summary.total_mapped_controls - summary.total_completed_controls - summary.total_in_progress_controls
  );
  const completionPercent = summary.total_mapped_controls === 0
    ? 0
    : Number(((summary.total_completed_controls * 100) / summary.total_mapped_controls).toFixed(1));

  return {
    ...summary,
    total_not_started_controls: remaining,
    overall_completion_percent: completionPercent
  };
}

function buildCoverageHeatmap(publicationsWithCoverage) {
  const families = Array.from(new Set(publicationsWithCoverage.map((row) => row.publication_family))).sort();
  const types = Array.from(new Set(publicationsWithCoverage.map((row) => row.publication_type))).sort();
  const byCell = new Map();

  for (const row of publicationsWithCoverage) {
    const key = `${row.publication_family}|||${row.publication_type}`;
    const existing = byCell.get(key) || {
      publication_family: row.publication_family,
      publication_type: row.publication_type,
      publication_count: 0,
      mapped_controls: 0,
      completed_controls: 0
    };
    existing.publication_count += 1;
    existing.mapped_controls += row.mapped_controls || 0;
    existing.completed_controls += row.completed_controls || 0;
    byCell.set(key, existing);
  }

  const cells = Array.from(byCell.values()).map((cell) => ({
    ...cell,
    completion_percent: cell.mapped_controls === 0
      ? 0
      : Number(((cell.completed_controls * 100) / cell.mapped_controls).toFixed(1))
  }));

  return { families, types, cells };
}

// GET /frameworks
router.get('/', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.name, f.code, f.version, f.description, f.category, f.tier_required,
             f.framework_group,
             COUNT(fc.id) as control_count
      FROM frameworks f
      LEFT JOIN framework_controls fc ON fc.framework_id = f.id
      WHERE f.is_active = true
      GROUP BY f.id
      ORDER BY f.name
    `);

    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Frameworks error:', error);
    res.status(500).json({ success: false, error: 'Failed to load frameworks' });
  }
});

// GET /frameworks/nist-publications
// Optional guidance library for organizations that want NIST best-practice references.
router.get('/nist-publications', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const shouldIncludeMappings = toBoolean(req.query.include_mappings, true);

    const publications = await fetchPublications(req.query);
    if (shouldIncludeMappings) {
      await attachPublicationMappings(publications);
    }

    const familyResult = await pool.query(
      `SELECT publication_family, COUNT(*)::int AS count
       FROM nist_publications
       WHERE status = 'active'
       GROUP BY publication_family
       ORDER BY publication_family`
    );

    const typeResult = await pool.query(
      `SELECT publication_type, COUNT(*)::int AS count
       FROM nist_publications
       WHERE status = 'active'
       GROUP BY publication_type
       ORDER BY publication_type`
    );

    res.json({
      success: true,
      data: {
        publications,
        total: publications.length,
        families: familyResult.rows,
        types: typeResult.rows
      }
    });
  } catch (error) {
    console.error('NIST publications error:', error);
    res.status(500).json({ success: false, error: 'Failed to load NIST publications' });
  }
});

// GET /frameworks/nist-publications/coverage
// Coverage view used for publication-task heatmaps and gap analysis.
router.get('/nist-publications/coverage', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const publications = await fetchPublications(req.query);
    const coverageMap = await fetchCoverageByPublicationIds(
      req.user.organization_id,
      publications.map((publication) => publication.id)
    );

    const publicationsWithCoverage = publications.map((publication) => ({
      ...publication,
      ...DEFAULT_COVERAGE,
      ...(coverageMap.get(publication.id) || {})
    }));

    const summary = buildCoverageSummary(publicationsWithCoverage);
    const heatmap = buildCoverageHeatmap(publicationsWithCoverage);
    const topGaps = [...publicationsWithCoverage]
      .filter((publication) => publication.mapped_controls > 0)
      .sort((a, b) => {
        if (a.completion_percent !== b.completion_percent) {
          return a.completion_percent - b.completion_percent;
        }
        return b.not_started_controls - a.not_started_controls;
      })
      .slice(0, 12);

    const familyResult = await pool.query(
      `SELECT publication_family, COUNT(*)::int AS count
       FROM nist_publications
       WHERE status = 'active'
       GROUP BY publication_family
       ORDER BY publication_family`
    );

    const typeResult = await pool.query(
      `SELECT publication_type, COUNT(*)::int AS count
       FROM nist_publications
       WHERE status = 'active'
       GROUP BY publication_type
       ORDER BY publication_type`
    );

    res.json({
      success: true,
      data: {
        summary,
        publications: publicationsWithCoverage,
        heatmap,
        top_gaps: topGaps,
        families: familyResult.rows,
        types: typeResult.rows
      }
    });
  } catch (error) {
    console.error('NIST publication coverage error:', error);
    res.status(500).json({ success: false, error: 'Failed to load publication coverage' });
  }
});

// GET /frameworks/nist-publications/catalog-controls
// Searchable control catalog used by mapping admin UI.
router.get('/nist-publications/catalog-controls', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const search = String(req.query.search || '').trim();
    const frameworkCode = String(req.query.framework_code || '').trim();
    const limit = Math.max(1, Math.min(250, Number(req.query.limit) || 75));

    let query = `
      SELECT
        fc.id AS framework_control_id,
        f.code AS framework_code,
        f.name AS framework_name,
        fc.control_id,
        fc.title AS control_title
      FROM framework_controls fc
      JOIN frameworks f ON f.id = fc.framework_id
      WHERE f.is_active = true
    `;
    const params = [];
    let idx = 1;

    if (frameworkCode) {
      query += ` AND f.code = $${idx++}`;
      params.push(frameworkCode);
    }

    if (search) {
      query += ` AND (
        fc.control_id ILIKE $${idx}
        OR fc.title ILIKE $${idx}
        OR f.name ILIKE $${idx}
        OR f.code ILIKE $${idx}
      )`;
      params.push(`%${search}%`);
      idx++;
    }

    query += ` ORDER BY f.code ASC, fc.control_id ASC LIMIT $${idx}`;
    params.push(limit);

    const result = await pool.query(query, params);
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('NIST publication control catalog error:', error);
    res.status(500).json({ success: false, error: 'Failed to load control catalog' });
  }
});

// GET /frameworks/nist-publications/:id
// Publication detail workspace with mappings and completion coverage.
router.get('/nist-publications/:id', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const publicationResult = await pool.query(
      `
        SELECT
          id,
          publication_code,
          title,
          publication_family,
          publication_type,
          status,
          summary,
          primary_use_case,
          recommended_for_private,
          federal_focus,
          publication_url,
          sort_order
        FROM nist_publications
        WHERE id = $1
        LIMIT 1
      `,
      [req.params.id]
    );

    if (publicationResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }

    const publication = {
      ...publicationResult.rows[0],
      related_controls: [],
      related_tasks: [],
      mappings: []
    };

    if (!toBoolean(req.query.include_mappings, true)) {
      const coverageMap = await fetchCoverageByPublicationIds(req.user.organization_id, [publication.id]);
      return res.json({
        success: true,
        data: {
          publication,
          coverage: coverageMap.get(publication.id) || { ...DEFAULT_COVERAGE }
        }
      });
    }

    await attachPublicationMappings([publication]);
    const coverageMap = await fetchCoverageByPublicationIds(req.user.organization_id, [publication.id]);

    res.json({
      success: true,
      data: {
        publication,
        coverage: coverageMap.get(publication.id) || { ...DEFAULT_COVERAGE }
      }
    });
  } catch (error) {
    console.error('NIST publication detail error:', error);
    res.status(500).json({ success: false, error: 'Failed to load publication details' });
  }
});

// PUT /frameworks/nist-publications/:id/mappings
// Replace or merge curated publication-control mappings (frameworks.manage only).
router.put('/nist-publications/:id/mappings', requirePermission('frameworks.manage'), async (req, res) => {
  const client = await pool.connect();
  try {
    const publicationId = req.params.id;
    const replaceExisting = toBoolean(req.body?.replace_existing, true);
    const mappings = normalizeMappingInput(req.body?.mappings);

    for (const mapping of mappings) {
      if (!VALID_MAPPING_STRENGTHS.has(mapping.mapping_strength)) {
        return res.status(400).json({
          success: false,
          error: `mapping_strength must be one of: ${Array.from(VALID_MAPPING_STRENGTHS).join(', ')}`,
          invalid_mapping: mapping
        });
      }
    }

    const publicationExists = await client.query(
      'SELECT id FROM nist_publications WHERE id = $1 LIMIT 1',
      [publicationId]
    );
    if (publicationExists.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Publication not found' });
    }

    if (mappings.length > 0) {
      const frameworkCodes = mappings.map((mapping) => mapping.framework_code);
      const controlIds = mappings.map((mapping) => mapping.control_id);

      const validationResult = await client.query(
        `
          WITH requested(framework_code, control_id) AS (
            SELECT * FROM unnest($1::text[], $2::text[])
          )
          SELECT
            r.framework_code,
            r.control_id,
            fc.id AS framework_control_id
          FROM requested r
          LEFT JOIN frameworks f
            ON f.code = r.framework_code
           AND f.is_active = true
          LEFT JOIN framework_controls fc
            ON fc.framework_id = f.id
           AND fc.control_id = r.control_id
        `,
        [frameworkCodes, controlIds]
      );

      const invalidMappings = validationResult.rows
        .filter((row) => !row.framework_control_id)
        .map((row) => ({
          framework_code: row.framework_code,
          control_id: row.control_id
        }));

      if (invalidMappings.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'One or more mappings reference controls not found in the active framework catalog',
          invalid_mappings: invalidMappings
        });
      }
    }

    await client.query('BEGIN');

    if (replaceExisting) {
      await client.query(
        'DELETE FROM nist_publication_control_mappings WHERE publication_id = $1',
        [publicationId]
      );
    }

    for (const mapping of mappings) {
      await client.query(
        `
          INSERT INTO nist_publication_control_mappings (
            publication_id,
            framework_code,
            control_id,
            mapping_strength,
            mapping_note,
            sort_order
          )
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (publication_id, framework_code, control_id) DO UPDATE SET
            mapping_strength = EXCLUDED.mapping_strength,
            mapping_note = EXCLUDED.mapping_note,
            sort_order = EXCLUDED.sort_order
        `,
        [
          publicationId,
          mapping.framework_code,
          mapping.control_id,
          mapping.mapping_strength,
          mapping.mapping_note,
          mapping.sort_order
        ]
      );
    }

    await client.query('COMMIT');

    const publicationResult = await pool.query(
      `
        SELECT
          id,
          publication_code,
          title,
          publication_family,
          publication_type,
          status,
          summary,
          primary_use_case,
          recommended_for_private,
          federal_focus,
          publication_url,
          sort_order
        FROM nist_publications
        WHERE id = $1
        LIMIT 1
      `,
      [publicationId]
    );

    const publication = {
      ...publicationResult.rows[0],
      related_controls: [],
      related_tasks: [],
      mappings: []
    };
    await attachPublicationMappings([publication]);
    const coverageMap = await fetchCoverageByPublicationIds(req.user.organization_id, [publication.id]);

    res.json({
      success: true,
      data: {
        publication,
        coverage: coverageMap.get(publication.id) || { ...DEFAULT_COVERAGE }
      }
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('NIST publication mapping update error:', error);
    res.status(500).json({ success: false, error: 'Failed to update publication mappings' });
  } finally {
    client.release();
  }
});

// GET /frameworks/crosswalk-coverage
// Returns a matrix showing how many controls in each target framework would be
// auto-satisfied if all controls in a source framework were implemented.
// Useful for compliance ROI planning: "If we implement ISO 27001, how much of NIST CSF do we get free?"
router.get('/crosswalk-coverage', requirePermission('frameworks.read'), async (req, res) => {
  try {
    const orgId = req.user.organization_id;

    // Get all active frameworks
    const frameworksResult = await pool.query(
      `SELECT id, code, name, version FROM frameworks WHERE is_active = true ORDER BY name`
    );
    const frameworks = frameworksResult.rows;

    if (frameworks.length === 0) {
      return res.json({ success: true, data: { frameworks: [], matrix: {} } });
    }

    // Get crosswalk-eligible pair stats in one query:
    // For each (source_fw, target_fw) pair, count how many target controls
    // have at least one mapping from a source control with score >= 90.
    const matrixResult = await pool.query(
      `WITH eligible_mappings AS (
         SELECT
           sf.id   AS source_fw_id,
           sf.code AS source_fw_code,
           tf.id   AS target_fw_id,
           tf.code AS target_fw_code,
           cm.target_control_id,
           cm.source_control_id,
           cm.similarity_score
         FROM control_mappings cm
         JOIN framework_controls src_fc ON src_fc.id = cm.source_control_id
         JOIN frameworks sf ON sf.id = src_fc.framework_id AND sf.is_active = true
         JOIN framework_controls tgt_fc ON tgt_fc.id = cm.target_control_id
         JOIN frameworks tf ON tf.id = tgt_fc.framework_id AND tf.is_active = true
         WHERE cm.similarity_score >= 90
           AND sf.id <> tf.id
       ),
       -- Also include the reverse direction (mappings are bidirectional)
       eligible_reverse AS (
         SELECT
           new_src_fw.id   AS source_fw_id,
           new_src_fw.code AS source_fw_code,
           new_tgt_fw.id   AS target_fw_id,
           new_tgt_fw.code AS target_fw_code,
           cm.source_control_id AS target_control_id,
           cm.target_control_id AS source_control_id,
           cm.similarity_score
         FROM control_mappings cm
         -- original target control becomes the source in the reverse direction
         JOIN framework_controls orig_tgt_fc ON orig_tgt_fc.id = cm.target_control_id
         JOIN frameworks new_src_fw ON new_src_fw.id = orig_tgt_fc.framework_id AND new_src_fw.is_active = true
         -- original source control becomes the target in the reverse direction
         JOIN framework_controls orig_src_fc ON orig_src_fc.id = cm.source_control_id
         JOIN frameworks new_tgt_fw ON new_tgt_fw.id = orig_src_fc.framework_id AND new_tgt_fw.is_active = true
         WHERE cm.similarity_score >= 90
           AND new_src_fw.id <> new_tgt_fw.id
       ),
       combined AS (
         SELECT * FROM eligible_mappings
         UNION ALL
         SELECT * FROM eligible_reverse
       ),
       target_totals AS (
         SELECT f.id AS fw_id, COUNT(fc.id)::int AS total_controls
         FROM frameworks f
         JOIN framework_controls fc ON fc.framework_id = f.id
         WHERE f.is_active = true
         GROUP BY f.id
       )
       SELECT
         c.source_fw_id,
         c.source_fw_code,
         c.target_fw_id,
         c.target_fw_code,
         COUNT(DISTINCT c.target_control_id)::int AS crosswalkable_controls,
         tt.total_controls AS target_total_controls,
         ROUND(
           (COUNT(DISTINCT c.target_control_id)::numeric * 100.0) / NULLIF(tt.total_controls, 0), 1
         )::float AS coverage_pct
       FROM combined c
       JOIN target_totals tt ON tt.fw_id = c.target_fw_id
       GROUP BY c.source_fw_id, c.source_fw_code, c.target_fw_id, c.target_fw_code, tt.total_controls
       ORDER BY c.source_fw_code, coverage_pct DESC`
    );

    // Also get current org's implementation progress per framework
    const orgProgressResult = await pool.query(
      `SELECT
         f.id AS framework_id,
         f.code,
         COUNT(fc.id)::int AS total_controls,
         COUNT(ci.id) FILTER (
           WHERE ci.status IN ('implemented', 'verified', 'satisfied_via_crosswalk')
         )::int AS implemented_controls
       FROM frameworks f
       JOIN framework_controls fc ON fc.framework_id = f.id
       LEFT JOIN control_implementations ci
         ON ci.control_id = fc.id AND ci.organization_id = $1
       WHERE f.is_active = true
       GROUP BY f.id, f.code`,
      [orgId]
    );

    const orgProgress = {};
    for (const row of orgProgressResult.rows) {
      orgProgress[row.code] = {
        total: row.total_controls,
        implemented: row.implemented_controls,
        pct: row.total_controls > 0
          ? Math.round(row.implemented_controls / row.total_controls * 100)
          : 0,
      };
    }

    // Build a full dense matrix: source_fw_code → array of all target frameworks.
    // Initialize every (source, target) pair with zero coverage so consumers
    // always get a predictable, complete structure — even when no mappings exist.
    const frameworkCodes = frameworks.map(f => f.code);
    const matrixBySource = {};
    for (const srcCode of frameworkCodes) {
      matrixBySource[srcCode] = frameworkCodes
        .filter(tgtCode => tgtCode !== srcCode)
        .map(tgtCode => ({
          target_framework_code: tgtCode,
          crosswalkable_controls: 0,
          target_total_controls: 0,
          coverage_pct: 0,
        }));
    }
    // Populate from actual mapping data
    for (const row of matrixResult.rows) {
      const targets = matrixBySource[row.source_fw_code];
      if (!targets) continue;
      const entry = targets.find(t => t.target_framework_code === row.target_fw_code);
      if (entry) {
        entry.crosswalkable_controls = row.crosswalkable_controls;
        entry.target_total_controls = row.target_total_controls;
        entry.coverage_pct = row.coverage_pct;
      }
    }
    // Sort each source's target list by coverage_pct descending (best coverage first)
    for (const srcCode of frameworkCodes) {
      matrixBySource[srcCode].sort((a, b) => b.coverage_pct - a.coverage_pct);
    }

    res.json({
      success: true,
      data: {
        frameworks: frameworks.map(f => ({
          id: f.id,
          code: f.code,
          name: f.name,
          version: f.version,
          org_progress: orgProgress[f.code] || { total: 0, implemented: 0, pct: 0 },
        })),
        matrix: matrixBySource,
        description: 'coverage_pct shows what % of the target framework controls have at least one high-similarity (>=90) crosswalk mapping from the source framework — i.e., if all source framework controls were fully implemented, that percentage of the target framework would be automatically satisfied via crosswalk.',
      }
    });
  } catch (error) {
    console.error('Crosswalk coverage matrix error:', error);
    res.status(500).json({ success: false, error: 'Failed to compute crosswalk coverage matrix' });
  }
});

module.exports = router;
