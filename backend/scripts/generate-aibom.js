#!/usr/bin/env node
/**
 * AIBOM (AI Bill of Materials) generator — CycloneDX 1.6.
 *
 * Replaces the previous inline Python heredoc in .github/workflows/sbom.yml,
 * which hardcoded a parallel copy of the provider/model list that could drift
 * from the real integration. This script instead derives the provider and
 * model inventory directly from services/ai/providerConfig.js (PROVIDERS),
 * the actual source of truth the LLM service resolves models from. Only the
 * curated prose (descriptions, use cases, limitations, website) — content
 * that isn't naturally expressed in code — stays hand-authored, keyed by the
 * same provider ids so a provider removed from providerConfig.js disappears
 * from the AIBOM automatically instead of silently going stale here.
 *
 * SDK-backed vs. service-only providers are deliberately NOT both emitted as
 * `components`: only claude/openai are real npm dependencies physically
 * shipped in package.json/node_modules, so only those two are
 * machine-learning-model *components* (CycloneDX's term for material bundled
 * with the application). gemini/grok/groq/ollama have no SDK at all — they're
 * called over plain HTTP if and only if an operator supplies a BYOK key for
 * them — so they're modeled as CycloneDX `services` (external things the
 * software can call, not things it embeds). Every provider here reflects
 * supported integration surface in the code, not runtime usage by any given
 * deployment — a build-time SBOM has no visibility into which providers an
 * operator has actually configured a key for.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PROVIDERS } = require('../src/services/ai/providerConfig');

const REPO_ROOT = path.join(__dirname, '..', '..');

const PROVIDER_METADATA = {
  claude: {
    supplier: 'Anthropic',
    website: 'https://anthropic.com',
    sdk_dep: '@anthropic-ai/sdk',
    description:
      'Anthropic Claude LLM accessed via @anthropic-ai/sdk (BYOK). Used for gap analysis, ' +
      'policy generation, compliance forecasting, and AI Copilot features.',
    use_cases: [
      'Compliance gap analysis',
      'Policy generation',
      'Compliance forecast',
      'Remediation playbook generation',
      'AI Copilot conversations',
      'Crosswalk optimization',
    ],
    limitations: [
      'Requires operator-supplied Anthropic API key (BYOK)',
      'Subject to Anthropic usage policies and rate limits',
      'Model version controlled by operator configuration',
    ],
  },
  openai: {
    supplier: 'OpenAI',
    website: 'https://openai.com',
    sdk_dep: 'openai',
    description:
      'OpenAI GPT models accessed via the `openai` npm package (BYOK). Used for all AI ' +
      'analysis features as an alternative provider.',
    use_cases: [
      'Compliance gap analysis',
      'Policy generation',
      'Compliance forecast',
      'Remediation playbook generation',
      'AI Copilot conversations',
    ],
    limitations: [
      'Requires operator-supplied OpenAI API key (BYOK)',
      'Subject to OpenAI usage policies and rate limits',
      'Model version controlled by operator configuration',
    ],
  },
  gemini: {
    supplier: 'Google',
    website: 'https://ai.google.dev',
    sdk_dep: null,
    endpoint: 'https://generativelanguage.googleapis.com',
    description:
      'Google Gemini accessed via Google AI REST API (BYOK). Used as an alternative LLM ' +
      'provider for all AI analysis features.',
    use_cases: [
      'Compliance gap analysis',
      'Policy generation',
      'Compliance forecast',
      'AI Copilot conversations',
    ],
    limitations: [
      'Requires operator-supplied Google AI API key (BYOK)',
      'Subject to Google AI usage policies',
      'Model version controlled by operator configuration',
    ],
  },
  grok: {
    supplier: 'xAI',
    website: 'https://x.ai',
    sdk_dep: null,
    endpoint: 'https://api.x.ai',
    description: 'xAI Grok accessed via REST API (BYOK). Alternative LLM provider for AI analysis features.',
    use_cases: ['AI Copilot conversations', 'Compliance gap analysis'],
    limitations: [
      'Requires operator-supplied xAI API key (BYOK)',
      'Subject to xAI usage policies',
    ],
  },
  groq: {
    supplier: 'Groq',
    website: 'https://groq.com',
    sdk_dep: null,
    endpoint: 'https://api.groq.com',
    description:
      'Groq LPU inference service accessed via REST API (BYOK). Provides high-speed inference ' +
      'for open-weight models as an alternative provider.',
    use_cases: ['AI Copilot conversations', 'Compliance gap analysis'],
    limitations: [
      'Requires operator-supplied Groq API key (BYOK)',
      'Subject to Groq usage policies',
      "Model availability depends on Groq's hosted catalogue",
    ],
  },
  ollama: {
    supplier: 'Ollama (open-source)',
    website: 'https://ollama.com',
    sdk_dep: null,
    endpoint: 'http://localhost:11434 (operator-configurable, self-hosted)',
    description:
      'Ollama local inference server accessed via REST API. Allows fully on-premises LLM ' +
      'deployment with no data leaving the operator network.',
    use_cases: [
      'Air-gapped / on-premises AI analysis',
      'AI Copilot conversations',
      'Compliance gap analysis',
    ],
    limitations: [
      'Requires operator to run a local Ollama server',
      'Performance depends on operator hardware',
      "No API key required — network access control is the operator's responsibility",
    ],
  },
};

function getPackageVersion(packageJsonPath, packageName) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, packageJsonPath), 'utf8'));
    return (pkg.dependencies && pkg.dependencies[packageName]) ||
      (pkg.devDependencies && pkg.devDependencies[packageName]) ||
      'unknown';
  } catch (error) {
    console.warn(`Warning: could not read version for ${packageName} from ${packageJsonPath}: ${error.message}`);
    return 'unknown';
  }
}

function buildAiComponent(providerId, provider, meta) {
  const versionLabel = provider.models.join(', ');
  const comp = {
    type: 'machine-learning-model',
    'bom-ref': `ai:${providerId}`,
    name: provider.name,
    version: versionLabel,
    description: meta.description,
    supplier: { name: meta.supplier, contact: [] },
    externalReferences: [{ type: 'website', url: meta.website }],
    modelCard: {
      modelParameters: {
        task: 'natural-language-processing',
        architectureFamily: 'transformer',
        inputs: [{ format: 'text' }],
        outputs: [{ format: 'text' }],
      },
      considerations: {
        useCases: meta.use_cases,
        limitations: meta.limitations,
        ethicalConsiderations: [
          {
            name: 'Human oversight required',
            description:
              'AI-generated compliance analysis must be reviewed by qualified GRC ' +
              'practitioners before use in formal assessments.',
          },
          {
            name: 'Data minimisation',
            description:
              'Only the minimum data required for analysis is sent to the AI provider. ' +
              'Sensitive PII should be redacted before analysis.',
          },
        ],
        fairnessAssessments: [],
      },
      governance: {
        owners: [{ organization: { name: meta.supplier, url: meta.website } }],
        custodians: [{ organization: { name: 'ControlWeave (operator)', url: 'https://controlweave.com' } }],
      },
    },
  };
  if (meta.sdk_dep) {
    comp.externalReferences.push({
      type: 'distribution',
      url: `https://www.npmjs.com/package/${meta.sdk_dep}`,
      comment: `npm SDK used for integration: ${meta.sdk_dep}`,
    });
  }
  return comp;
}

function buildAiService(providerId, provider, meta) {
  return {
    'bom-ref': `ai-service:${providerId}`,
    name: provider.name,
    description: meta.description,
    provider: { name: meta.supplier, url: meta.website },
    endpoints: [meta.endpoint],
    data: [{ flow: 'bi-directional', classification: 'organization-compliance-data' }],
    externalReferences: [{ type: 'website', url: meta.website }],
    properties: [
      { name: 'ai:models', value: provider.models.join(', ') },
      { name: 'ai:integration', value: 'HTTP API (no bundled SDK) — BYOK, opt-in per organization' },
      { name: 'ai:use-cases', value: meta.use_cases.join('; ') },
      { name: 'ai:limitations', value: meta.limitations.join('; ') },
    ],
  };
}

function buildAibom() {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'backend/package.json'), 'utf8'));
  const appVersion = pkg.version || '0.0.0';
  const appName = 'ControlWeave';
  const timestamp = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

  const providerIds = Object.keys(PROVIDERS).filter((id) => PROVIDER_METADATA[id]);
  const missingMetadata = Object.keys(PROVIDERS).filter((id) => !PROVIDER_METADATA[id]);
  if (missingMetadata.length > 0) {
    console.warn(`Warning: no curated AIBOM metadata for provider(s): ${missingMetadata.join(', ')} — omitted from AIBOM`);
  }
  // Only providers with a real npm SDK dependency are "components" (material
  // actually bundled with the application). Providers reachable only over
  // plain HTTP have no shipped artifact and belong in `services` instead.
  const sdkProviderIds = providerIds.filter((id) => PROVIDER_METADATA[id].sdk_dep);
  const httpProviderIds = providerIds.filter((id) => !PROVIDER_METADATA[id].sdk_dep);

  const sdkComponent = {
    type: 'library',
    'bom-ref': 'sdk:controlweave-external-ai-logger',
    name: '@controlweave/external-ai-logger',
    version: '1.0.0',
    description:
      'ControlWeave SDK for logging external AI decisions into the platform audit trail. ' +
      'Enables third-party AI systems to emit governance records.',
    licenses: [{ license: { id: 'AGPL-3.0-only' } }],
    externalReferences: [{ type: 'vcs', url: 'https://github.com/sherifconteh-collab/ai-grc-platform' }],
  };

  const aiComponents = sdkProviderIds.map((id) =>
    buildAiComponent(id, PROVIDERS[id], {
      ...PROVIDER_METADATA[id],
      version: getPackageVersion('backend/package.json', PROVIDER_METADATA[id].sdk_dep),
    })
  );

  const aiServices = httpProviderIds.map((id) =>
    buildAiService(id, PROVIDERS[id], PROVIDER_METADATA[id])
  );

  const components = [sdkComponent, ...aiComponents];

  return {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp,
      tools: [{ vendor: 'ControlWeave', name: 'aibom-generator', version: '2.0.0' }],
      component: {
        type: 'application',
        name: appName,
        version: appVersion,
        description:
          'Open-source AI-powered GRC platform with multi-framework compliance management, ' +
          'crosswalk intelligence, and BYOK AI analysis. Community edition — AGPL-3.0 licensed.',
        licenses: [{ license: { id: 'AGPL-3.0-only' } }],
        externalReferences: [
          { type: 'vcs', url: 'https://github.com/sherifconteh-collab/ai-grc-platform' },
          {
            type: 'documentation',
            url: 'https://github.com/sherifconteh-collab/ai-grc-platform/blob/main/RELEASE_NOTES.md',
            comment: 'Release notes',
          },
        ],
      },
      properties: [
        { name: 'ControlWeave:edition', value: 'open' },
        { name: 'ControlWeave:ai-integration', value: 'BYOK (Bring Your Own Key)' },
        {
          name: 'ControlWeave:ai-integration-note',
          value:
            'All AI providers listed here are opt-in, BYOK integrations disabled until an ' +
            'operator supplies an API key. This AIBOM reflects the code\'s supported AI ' +
            'integration surface, not which providers any given deployment has actually ' +
            'configured or is actively using at runtime.',
        },
        { name: 'ControlWeave:ai-sdk-providers', value: sdkProviderIds.join(',') || 'none' },
        { name: 'ControlWeave:ai-service-providers', value: httpProviderIds.join(',') || 'none' },
        { name: 'ControlWeave:governance-framework', value: 'NIST AI RMF 1.0, EU AI Act, ISO 42001' },
      ],
    },
    components,
    services: aiServices,
    dependencies: [
      {
        ref: `app:${appName.toLowerCase().replace(/\s+/g, '-')}`,
        dependsOn: [...components.map((c) => c['bom-ref']), ...aiServices.map((s) => s['bom-ref'])],
      },
    ],
  };
}

function main() {
  const aibom = buildAibom();
  const outDir = path.join(process.cwd(), 'sbom-output');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'aibom.cdx.json');
  fs.writeFileSync(outPath, JSON.stringify(aibom, null, 2));

  console.log(`AIBOM generated -> ${outPath}`);
  console.log(`  Application : ${aibom.metadata.component.name} v${aibom.metadata.component.version}`);
  console.log(`  Components  : ${aibom.components.length} total (${aibom.components.length - 1} SDK-backed AI providers + 1 internal SDK)`);
  console.log(`  Services    : ${aibom.services.length} total (HTTP-only BYOK AI providers, no bundled SDK)`);
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = { buildAibom };
