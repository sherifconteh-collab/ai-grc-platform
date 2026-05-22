// @tier: enterprise
const { createHash } = require('crypto');
const yaml = require('js-yaml');
const { parseStringPromise } = require('xml2js');

function toArray(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null) return [];
  return [value];
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const result = String(value).trim();
  return result.length ? result : null;
}

function parseNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeverity(severity, score = null) {
  const normalized = String(severity || '').trim().toLowerCase();
  if (['critical', 'high', 'medium', 'low', 'info'].includes(normalized)) {
    return normalized;
  }
  if (score === null || score === undefined) return 'medium';
  if (score >= 9) return 'critical';
  if (score >= 7) return 'high';
  if (score >= 4) return 'medium';
  if (score > 0) return 'low';
  return 'info';
}

function normalizeLicenseEntries(rawLicenses) {
  const entries = toArray(rawLicenses).map((entry) => {
    if (!entry) return null;
    if (typeof entry === 'string') return { id: entry };

    const licenseObj = entry.license || entry;
    const id = normalizeText(licenseObj.id || licenseObj.licenseId || licenseObj.spdxId || licenseObj.name);
    const name = normalizeText(licenseObj.name);
    const expression = normalizeText(entry.expression || licenseObj.expression);

    if (!id && !name && !expression) return null;
    return {
      id: id || name || expression,
      name: name || null,
      expression: expression || null
    };
  }).filter(Boolean);

  return entries;
}

function parseCycloneDxVulnerabilities(rawBom) {
  const vulnerabilitiesByRef = new Map();
  const vulnerabilities = toArray(rawBom.vulnerabilities);
  const vulnerabilityItems = vulnerabilities.flatMap((item) => toArray(item.vulnerability || item));

  for (const vulnerability of vulnerabilityItems) {
    const vulnId = normalizeText(vulnerability.id || vulnerability.bomRef || vulnerability['@id']);
    const ratings = toArray(vulnerability.ratings?.rating || vulnerability.rating || vulnerability.ratings);
    const firstRating = ratings[0] || {};
    const score = parseNumber(firstRating.score || firstRating.value || vulnerability.score);
    const severity = normalizeSeverity(firstRating.severity || vulnerability.severity, score);
    const cweId = normalizeText(vulnerability.cwes?.cwe?.id || vulnerability.cwe || vulnerability.cwe_id);
    const description = normalizeText(vulnerability.description || vulnerability.detail);
    const recommendation = normalizeText(vulnerability.recommendation || vulnerability.remediation);

    const affectedRefs = toArray(vulnerability.affects?.target || vulnerability.affects?.affect || vulnerability.affects)
      .map((target) => normalizeText(target.ref || target.bomRef || target))
      .filter(Boolean);

    const normalized = {
      id: vulnId || null,
      severity,
      cvss_score: score,
      cwe_id: cweId,
      title: vulnId ? `Component vulnerability ${vulnId}` : 'Component vulnerability',
      description: description || recommendation || null,
      recommendation: recommendation || null,
      raw: vulnerability
    };

    for (const ref of affectedRefs) {
      if (!vulnerabilitiesByRef.has(ref)) vulnerabilitiesByRef.set(ref, []);
      vulnerabilitiesByRef.get(ref).push(normalized);
    }
  }

  return vulnerabilitiesByRef;
}

function normalizeCycloneDxComponent(component, vulnerabilitiesByRef) {
  const bomRef = normalizeText(component['bom-ref'] || component.bomRef || component.ref || component.purl || component.name);
  const localVulnerabilities = toArray(component.vulnerabilities?.vulnerability || component.vulnerabilities)
    .map((vuln) => {
      const score = parseNumber(vuln.cvss_score || vuln.score || vuln.ratings?.rating?.score);
      return {
        id: normalizeText(vuln.id || vuln.cve || vuln.vulnerability_id),
        severity: normalizeSeverity(vuln.severity, score),
        cvss_score: score,
        cwe_id: normalizeText(vuln.cwe_id || vuln.cwe),
        title: normalizeText(vuln.title) || `Component vulnerability ${normalizeText(vuln.id || vuln.cve) || ''}`.trim(),
        description: normalizeText(vuln.description),
        recommendation: normalizeText(vuln.recommendation),
        raw: vuln
      };
    });

  const mappedVulnerabilities = bomRef && vulnerabilitiesByRef.has(bomRef)
    ? vulnerabilitiesByRef.get(bomRef)
    : [];

  return {
    bomRef: bomRef || null,
    name: normalizeText(component.name) || 'Unnamed component',
    version: normalizeText(component.version),
    purl: normalizeText(component.purl),
    cpe: normalizeText(component.cpe),
    componentType: normalizeText(component.type || component.component_type),
    vendor: normalizeText(component.publisher || component.vendor),
    supplier: normalizeText(component.supplier?.name || component.supplier),
    author: normalizeText(component.author),
    licenses: normalizeLicenseEntries(component.licenses?.license || component.licenses),
    vulnerabilities: [...mappedVulnerabilities, ...localVulnerabilities],
    metadata: component
  };
}

function normalizeCycloneDx(rawBom) {
  const vulnerabilitiesByRef = parseCycloneDxVulnerabilities(rawBom);
  const components = toArray(rawBom.components?.component || rawBom.components)
    .map((component) => normalizeCycloneDxComponent(component, vulnerabilitiesByRef));

  const dependencies = toArray(rawBom.dependencies?.dependency || rawBom.dependencies)
    .map((entry) => ({
      ref: normalizeText(entry.ref || entry.bomRef || entry['@ref']),
      dependsOn: toArray(entry.dependsOn || entry.dependency)
        .map((dep) => normalizeText(dep.ref || dep.bomRef || dep))
        .filter(Boolean)
    }))
    .filter((entry) => entry.ref);

  const tools = toArray(rawBom.metadata?.tools?.tool || rawBom.metadata?.tools).filter(Boolean);
  const firstTool = tools[0] || {};

  return {
    format: 'CycloneDX',
    specVersion: normalizeText(rawBom.specVersion),
    serialNumber: normalizeText(rawBom.serialNumber),
    version: parseNumber(rawBom.version),
    generatedAt: normalizeText(rawBom.metadata?.timestamp),
    toolName: normalizeText(firstTool.name || firstTool.vendor),
    toolVersion: normalizeText(firstTool.version),
    rootComponentName: normalizeText(rawBom.metadata?.component?.name),
    rootComponentVersion: normalizeText(rawBom.metadata?.component?.version),
    components,
    dependencies,
    raw: rawBom
  };
}

function parseSpdxLicense(value) {
  if (!value) return [];
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed || trimmed.toUpperCase() === 'NONE' || trimmed.toUpperCase() === 'NOASSERTION') return [];
    if (trimmed.includes(' OR ') || trimmed.includes(' AND ')) return [{ id: trimmed, expression: trimmed }];
    return [{ id: trimmed }];
  }
  return [];
}

function normalizeSpdx(rawSpdx) {
  const packages = toArray(rawSpdx.packages).filter(Boolean);

  const components = packages
    .filter((pkg) => normalizeText(pkg.name))
    .map((pkg) => {
      const refs = toArray(pkg.externalRefs);
      const purlRef = refs.find((ref) => String(ref.referenceType || '').toLowerCase().includes('purl'));
      const cpeRef = refs.find((ref) => String(ref.referenceType || '').toLowerCase().includes('cpe'));
      const licenses = [
        ...parseSpdxLicense(pkg.licenseConcluded),
        ...parseSpdxLicense(pkg.licenseDeclared)
      ];

      return {
        bomRef: normalizeText(pkg.SPDXID || pkg.spdxid || pkg.name),
        name: normalizeText(pkg.name) || 'Unnamed component',
        version: normalizeText(pkg.versionInfo || pkg.version),
        purl: normalizeText(purlRef?.referenceLocator || pkg.purl),
        cpe: normalizeText(cpeRef?.referenceLocator || pkg.cpe),
        componentType: 'library',
        vendor: normalizeText(pkg.originator),
        supplier: normalizeText(pkg.supplier),
        author: normalizeText(pkg.originator),
        licenses,
        vulnerabilities: [],
        metadata: pkg
      };
    });

  const dependencyMap = new Map();
  const relationships = toArray(rawSpdx.relationships).filter(Boolean);
  for (const rel of relationships) {
    const relType = String(rel.relationshipType || '').toUpperCase();
    if (!relType.includes('DEPENDS_ON')) continue;
    const source = normalizeText(rel.spdxElementId);
    const target = normalizeText(rel.relatedSpdxElement);
    if (!source || !target) continue;
    if (!dependencyMap.has(source)) dependencyMap.set(source, []);
    dependencyMap.get(source).push(target);
  }

  const dependencies = Array.from(dependencyMap.entries()).map(([ref, dependsOn]) => ({
    ref,
    dependsOn: Array.from(new Set(dependsOn))
  }));

  const creators = toArray(rawSpdx.creationInfo?.creators);
  const toolCreator = creators.find((creator) => String(creator).startsWith('Tool:'));
  const toolName = toolCreator ? normalizeText(String(toolCreator).replace(/^Tool:/, '').trim()) : null;

  return {
    format: 'SPDX',
    specVersion: normalizeText(rawSpdx.spdxVersion),
    serialNumber: normalizeText(rawSpdx.documentNamespace),
    version: null,
    generatedAt: normalizeText(rawSpdx.creationInfo?.created),
    toolName,
    toolVersion: null,
    rootComponentName: normalizeText(rawSpdx.name),
    rootComponentVersion: null,
    components,
    dependencies,
    raw: rawSpdx
  };
}

function normalizeSwid(rawSwid) {
  const identity = rawSwid.SoftwareIdentity || rawSwid.softwareIdentity || rawSwid;
  const name = normalizeText(identity.name) || 'Software Identity';
  const version = normalizeText(identity.version);
  const tagId = normalizeText(identity.tagId || identity.tagid || identity.id);

  return {
    format: 'SWID',
    specVersion: null,
    serialNumber: tagId,
    version: null,
    generatedAt: null,
    toolName: null,
    toolVersion: null,
    rootComponentName: name,
    rootComponentVersion: version,
    components: [
      {
        bomRef: tagId || `${name}:${version || 'unknown'}`,
        name,
        version,
        purl: null,
        cpe: null,
        componentType: 'application',
        vendor: normalizeText(identity.tagCreator?.name || identity.softwareCreator),
        supplier: null,
        author: null,
        licenses: [],
        vulnerabilities: [],
        metadata: identity
      }
    ],
    dependencies: [],
    raw: rawSwid
  };
}

function detectStructuredPayload(text, fileName = '', mimeType = '') {
  const ext = String(fileName).toLowerCase().split('.').pop() || '';
  const mime = String(mimeType).toLowerCase();

  if (['json'].includes(ext) || mime.includes('json')) {
    return JSON.parse(text);
  }

  if (['yaml', 'yml'].includes(ext) || mime.includes('yaml') || mime.includes('yml')) {
    return yaml.load(text);
  }

  if (['xml', 'rdf', 'swidtag'].includes(ext) || mime.includes('xml') || mime.includes('rdf')) {
    return parseStringPromise(text, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true
    });
  }

  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed);
  }
  if (trimmed.startsWith('<')) {
    return parseStringPromise(trimmed, {
      explicitArray: false,
      mergeAttrs: true,
      trim: true
    });
  }

  throw new Error('Unsupported SBOM file type');
}

async function parseSbomBuffer(buffer, fileName, mimeType) {
  const text = buffer.toString('utf8');
  const parsed = await Promise.resolve(detectStructuredPayload(text, fileName, mimeType));

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Failed to parse SBOM payload');
  }

  if (String(parsed.bomFormat || '').toLowerCase() === 'cyclonedx' || parsed.bom) {
    const payload = parsed.bom ? parsed.bom : parsed;
    return normalizeCycloneDx(payload);
  }

  if (parsed.spdxVersion || parsed.SPDXID || parsed.documentNamespace) {
    return normalizeSpdx(parsed);
  }

  if (parsed.SoftwareIdentity || parsed.softwareIdentity) {
    return normalizeSwid(parsed);
  }

  throw new Error('Unsupported SBOM format. Expected CycloneDX, SPDX, or SWID.');
}

function buildStableFindingKey(parts) {
  const base = parts.filter(Boolean).join('|');
  const digest = createHash('sha1').update(base).digest('hex');
  return digest.slice(0, 40);
}

function extractLicenseIds(component) {
  const licenses = toArray(component.licenses);
  const ids = [];
  for (const license of licenses) {
    if (!license) continue;
    const id = normalizeText(license.id || license.name || license.expression);
    if (id) ids.push(id.toUpperCase());
  }
  return Array.from(new Set(ids));
}

module.exports = {
  toArray,
  normalizeSeverity,
  parseSbomBuffer,
  buildStableFindingKey,
  extractLicenseIds
};
