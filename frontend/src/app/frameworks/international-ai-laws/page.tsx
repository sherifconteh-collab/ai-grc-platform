import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'International AI Laws Compliance | ControlWeave',
  description: 'Coverage of 10 major international AI law, privacy, and policy packs: EU AI Act, the UK AI regulatory framework, Canada AIDA proposal tracking, Brazil LGPD plus AI bill monitoring, Singapore PDPA/AIGF, Japan APPI, South Korea AI Basic Act, China CAC regulations, Australia privacy guidance, and India DPDP Act. Gov Cloud & Advisory add-on.', // ip-hygiene:ignore
  alternates: { canonical: 'https://controlweave.com/frameworks/international-ai-laws' },
  openGraph: {
    title: 'International AI Laws Compliance | ControlWeave',
    description: 'One workspace for major international AI law, privacy, and policy packs. ControlWeave maps 43 jurisdiction-specific controls plus 6 INTL-CORE baselines across 10 coverage packs to NIST AI RMF and EU AI Act so evidence collected once supports multiple markets.',
    url: 'https://controlweave.com/frameworks/international-ai-laws',
  },
};

const jurisdictions = [
  {
    code: 'EU',
    region: 'European Union',
    law: 'EU AI Act — Regulation 2024/1689',
    effective: 'August 1, 2024 (phased to August 2027)',
    category: 'Comprehensive AI Regulation',
    controls: 10,
    highlights: [
      'Prohibited AI practices: subliminal manipulation, social scoring, real-time biometric surveillance (Art. 5)',
      'High-risk AI classification using Annex III categories with mandatory registration (Art. 6)',
      'Risk management system required throughout the AI lifecycle (Art. 9)',
      'Data governance quality criteria for training, validation, and test datasets (Art. 10)',
      'Mandatory transparency and instructions for use for high-risk AI (Art. 13)',
      'Human oversight measures with override capability (Art. 14)',
      'GPAI model obligations including systemic-risk threshold at 10^25 FLOPs (Art. 53/55)',
      'Fundamental rights impact assessment before deployment in sensitive sectors (Art. 27)',
    ],
    color: 'blue',
    authority: 'European AI Office / National Market Surveillance Authorities',
    penalty: 'Up to €35M or 7% of global annual turnover',
  },
  {
    code: 'UK',
    region: 'United Kingdom',
    law: 'UK AI regulatory framework (DSIT + sector regulators)',
    effective: 'Guidance active since 2023; regulator implementation ongoing',
    category: 'Principles-Based Regulatory Guidance',
    controls: 5,
    highlights: [
      'Five cross-sector principles: safety, transparency, fairness, accountability, contestability',
      'Sector regulator implementation: ICO (privacy), FCA (financial), CMA (competition), Ofcom (media)',
      'Bias assessments covering nine protected characteristics under the UK Equality Act 2010',
      'AI complaints and appeals process with defined SLAs required for significant decisions',
      'FCA/PRA model risk management guidance (SS1/23) compliance for financial AI',
    ],
    color: 'indigo',
    authority: 'DSIT / ICO / FCA / CMA / Ofcom',
    penalty: 'Sector-specific (ICO: up to £17.5M or 4% of global turnover under UK GDPR)',
  },
  {
    code: 'CA',
    region: 'Canada',
    law: 'Artificial Intelligence and Data Act proposal (AIDA / Bill C-27)',
    effective: 'Not in force; bill did not pass before Parliament prorogation',
    category: 'Proposed High-Impact AI Regulation',
    controls: 4,
    highlights: [
      'Proposed high-impact AI system identification and inventory requirements for employment, services, health, and justice use cases',
      'Draft pre-deployment risk assessments with mitigation measures proportionate to identified risks',
      'Draft plain-language disclosure obligations for high-impact AI system purposes and decision types',
      'Proposal-derived record-keeping controls for training data, risk assessments, and monitoring outcomes',
    ],
    color: 'red',
    authority: 'Innovation, Science and Economic Development Canada (ISED)',
    penalty: 'Up to CAD $25 million or 3% of global revenue',
  },
  {
    code: 'BR',
    region: 'Brazil',
    law: 'LGPD Art. 20 + AI Bill PL 2338/2023',
    effective: 'LGPD in force; AI Bill still pending',
    category: 'Automated Decisions & High-Risk AI',
    controls: 4,
    highlights: [
      'Automated processing transparency: criteria, procedures, and plain-language explanation on request (LGPD Art. 20)',
      '15-day deadline for processing human review requests for automated decisions',
      'Algorithmic impact assessment required for high-risk AI before deployment (PL 2338 Art. 15)',
      'Periodic bias audits covering race, color, ethnicity, gender, sexual orientation, disability',
    ],
    color: 'green',
    authority: 'ANPD (National Data Protection Authority)',
    penalty: 'Up to BRL 50M or 2% of revenue (LGPD)',
  },
  {
    code: 'SG',
    region: 'Singapore',
    law: 'PDPA + Model AI Governance Framework 2.0',
    effective: 'February 2022',
    category: 'AI Governance & Data Protection',
    controls: 4,
    highlights: [
      'Senior leadership accountability and AI ethics principles governance structure (AIGF 2.0)',
      'Human oversight level defined by probability of harm and severity — mandatory review for high-risk decisions',
      'Operational controls: model documentation, pre-deployment validation, performance thresholds (AIGF 2.0)',
      'PDPA consent or valid legal basis required for all personal data processed by AI systems',
    ],
    color: 'red',
    authority: 'PDPC (Personal Data Protection Commission) / IMDA',
    penalty: 'Up to SGD $1M per breach under PDPA',
  },
  {
    code: 'JP',
    region: 'Japan',
    law: 'APPI + AI governance guidelines',
    effective: 'April 2022 (APPI amendment)',
    category: 'Data Protection & AI Principles',
    controls: 3,
    highlights: [
      'APPI compliance for AI: legitimate purpose, individual notification, security management proportionate to risk',
      '10 AI development principles (MIC/METI): safety, fairness, transparency, accountability, and privacy',
      'Generative AI content provenance, copyright compliance, and employee usage guidelines required (Cabinet 2024)',
    ],
    color: 'purple',
    authority: 'Personal Information Protection Commission (PPC) / METI',
    penalty: 'Up to ¥100M for APPI violations',
  },
  {
    code: 'KR',
    region: 'South Korea',
    law: 'AI Basic Act (Act No. 20469)',
    effective: 'January 2024 (enacted) / January 2026 (fully applicable)',
    category: 'High-Impact AI Governance',
    controls: 3,
    highlights: [
      'Pre-deployment impact assessment for high-impact AI in healthcare, employment, credit, education, justice',
      'User disclosure: AI identity, purpose, characteristics, recourse avenues, and provider identity',
      'AI safety officer appointment and internal AI ethics committee for high-impact systems',
    ],
    color: 'blue',
    authority: 'Korea Communications Commission (KCC) / MSIT',
    penalty: 'Up to KRW 30M per violation',
  },
  {
    code: 'CN',
    region: 'China',
    law: 'CAC Generative AI Measures (2023) + Algorithm Recommendation Regulation (2022)',
    effective: 'March 2022 — August 2023 (phased)',
    category: 'Generative AI & Algorithmic Transparency',
    controls: 4,
    highlights: [
      'Generative AI: user consent, visible and covert watermarks, content security review, 6-month log retention',
      'Algorithm recommendations: disclosure, disable-personalization option, prohibition on price discrimination by user characteristic',
      'AI content security: prohibited content categories, quarterly compliance reviews, regulatory inspection records',
      'Deep synthesis (deepfakes): technical markers on all synthetic media, consent for identifiable individuals, real-name registration',
    ],
    color: 'yellow',
    authority: 'Cyberspace Administration of China (CAC)',
    penalty: 'Up to CNY 10M for serious violations; service suspension',
  },
  {
    code: 'AU',
    region: 'Australia',
    law: 'Privacy Act 1988 (APPs) + AI ethics and assurance guidance',
    effective: '2019 (ethics framework) / ongoing Privacy Act reforms',
    category: 'Privacy & AI Ethics',
    controls: 3,
    highlights: [
      'Automated decision-making disclosure in APP 1 privacy policies and APP 5 collection notices',
      'Eight National AI Ethics Framework principles including fairness, transparency, contestability, and accountability',
      'Automated decision register aligned with APS guidance; human review for consequential decisions',
    ],
    color: 'orange',
    authority: 'OAIC (Office of the Australian Information Commissioner) / DISR',
    penalty: 'Up to AUD $50M per contravention for serious/repeated interference with privacy',
  },
  {
    code: 'IN',
    region: 'India',
    law: 'Digital Personal Data Protection (DPDP) Act 2023',
    effective: 'August 2023 enacted; implementation rules and obligations are still being phased in',
    category: 'Data Protection & AI',
    controls: 3,
    highlights: [
      'Lawful basis and consent for all AI systems processing personal digital data of Indian residents',
      'Data principal rights: access, correction, erasure of data used in AI models, 30-day grievance redressal',
      'Data localisation: no transfer of Indian resident personal data to government-restricted countries',
    ],
    color: 'purple',
    authority: 'Data Protection Board of India / MeitY',
    penalty: 'Up to INR 250 Crore per instance of breach',
  },
];

const crosswalkMappings = [
  { intl: 'EU-AIA-3', nistAiRmf: 'MEASURE-2', euAia: 'Art. 9', description: 'Risk management lifecycle' },
  { intl: 'EU-AIA-4', nistAiRmf: 'MEASURE-2', euAia: 'Art. 10', description: 'Data governance' },
  { intl: 'EU-AIA-8', nistAiRmf: 'MANAGE-3',  euAia: 'Art. 14', description: 'Human oversight' },
  { intl: 'EU-AIA-9', nistAiRmf: 'GOVERN-1',  euAia: 'Art. 53/55', description: 'GPAI governance' },
  { intl: 'EU-AIA-10',nistAiRmf: 'MAP-1',     euAia: 'Art. 27', description: 'Impact assessment' },
  { intl: 'UK-AI-1',  nistAiRmf: 'GOVERN-1',  euAia: 'Art. 9', description: 'Safety / risk management' },
  { intl: 'UK-AI-3',  nistAiRmf: 'MEASURE-1', euAia: 'Art. 27', description: 'Fairness / fundamental rights' },
  { intl: 'CA-AIDA-2',nistAiRmf: 'MEASURE-1', euAia: 'Art. 9',  description: 'Risk assessment' },
  { intl: 'SG-AI-2',  nistAiRmf: 'MANAGE-3',  euAia: 'Art. 14', description: 'Human involvement' },
  { intl: 'KR-AI-1',  nistAiRmf: 'MEASURE-1', euAia: 'Art. 27', description: 'Impact assessment' },
];

const colorMap: Record<string, string> = {
  blue:   'bg-blue-50 border-blue-200 text-blue-800',
  indigo: 'bg-indigo-50 border-indigo-200 text-indigo-800',
  red:    'bg-red-50 border-red-200 text-red-800',
  green:  'bg-green-50 border-green-200 text-green-800',
  purple: 'bg-purple-50 border-purple-200 text-purple-800',
  yellow: 'bg-yellow-50 border-yellow-200 text-yellow-800',
  orange: 'bg-orange-50 border-orange-200 text-orange-800',
};

const badgeMap: Record<string, string> = {
  blue:   'bg-blue-100 text-blue-700',
  indigo: 'bg-indigo-100 text-indigo-700',
  red:    'bg-red-100 text-red-700',
  green:  'bg-green-100 text-green-700',
  purple: 'bg-purple-100 text-purple-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  orange: 'bg-orange-100 text-orange-700',
};

export default function InternationalAiLawsPage() {
  const totalControls = jurisdictions.reduce((sum, j) => sum + j.controls, 0) + 6; // +6 INTL-CORE

  return (
    <div className="min-h-screen bg-white">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-900 text-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <span className="bg-indigo-600 text-white text-xs font-semibold px-3 py-1 rounded-full uppercase tracking-wider">
              🌍 Gov Cloud &amp; Advisory
            </span>
            <span className="bg-blue-800 text-blue-200 text-xs font-semibold px-3 py-1 rounded-full">
              NEW — 2025
            </span>
          </div>
          <h1 className="text-5xl font-bold mb-6 leading-tight">
            International AI Governance Laws
          </h1>
          <p className="text-xl text-blue-100 mb-8 max-w-3xl leading-relaxed">
            One workspace for major international AI law, privacy, and policy packs.{' '}
            <strong>{totalControls} total controls</strong> across{' '}
            <strong>10 major coverage packs</strong> — EU AI Act, UK, Canada AIDA proposal tracking, Brazil,
            Singapore, Japan, South Korea, China, Australia, and India — including 43 jurisdiction-specific
            controls plus 6 INTL-CORE baselines, all crosswalked to NIST AI RMF so evidence collected once
            supports requirements in multiple markets.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/register"
              className="bg-white text-slate-900 px-8 py-3 rounded-lg font-semibold hover:bg-blue-50 transition-colors"
            >
              Start Free Trial
            </Link>
            <Link
              href="/contact"
              className="border border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="bg-slate-800 text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
            <div>
              <div className="text-3xl font-bold text-blue-400">{totalControls}</div>
              <div className="text-sm text-slate-300 mt-1">Jurisdiction-Specific Controls</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-green-400">10</div>
              <div className="text-sm text-slate-300 mt-1">Coverage Packs</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-indigo-400">Dual</div>
              <div className="text-sm text-slate-300 mt-1">NIST AI RMF + EU AI Act Crosswalk</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-yellow-400">1</div>
              <div className="text-sm text-slate-300 mt-1">Evidence Collection, Many Jurisdictions</div>
            </div>
          </div>
        </div>
      </section>

      {/* Why it matters */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">
            Why International AI Compliance Matters Now
          </h2>
          <p className="text-lg text-slate-600 mb-10 max-w-3xl">
            The EU AI Act began phased application in February 2025. Other jurisdictions are moving at
            different speeds: some rely on enacted AI-specific laws, some use privacy law plus regulator
            guidance, and others are still finalizing proposal text. Cross-border teams need a single
            tracking model that reflects those differences instead of assuming every jurisdiction is already
            in force.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: '⚡',
                title: 'Overlapping Deadlines',
                body: 'EU AI Act prohibitions applied Feb 2025. GPAI obligations apply Aug 2025. High-risk AI rules apply Aug 2026. Canada proposal tracking, South Korea implementation, and India DPDP rollout all follow different timelines.',
              },
              {
                icon: '🔗',
                title: 'Evidence Reuse Across Jurisdictions',
                body: 'ControlWeave crosswalks map evidence to multiple frameworks simultaneously. One impact assessment workflow can support EU Article 27 readiness, Canadian proposal monitoring, and South Korea high-impact AI governance evidence.',
              },
              {
                icon: '🛡️',
                title: 'Consistent Risk Baseline',
                body: 'INTL-CORE controls establish a universal fairness, watermarking, incident response, and regulatory change-management baseline that supports all covered jurisdictions and policy packs.',
              },
            ].map((card) => (
              <div key={card.title} className="bg-slate-50 rounded-xl p-6 border border-slate-200">
                <div className="text-3xl mb-3">{card.icon}</div>
                <h3 className="font-semibold text-slate-900 mb-2">{card.title}</h3>
                <p className="text-slate-600 text-sm">{card.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jurisdiction coverage */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Jurisdiction-by-Jurisdiction Coverage
          </h2>
          <p className="text-slate-600 mb-10 max-w-2xl">
            Every control maps to a specific article, section, rule, or tracked proposal requirement
            rather than generic best-practice guidance.
          </p>
          <div className="space-y-6">
            {jurisdictions.map((j) => {
              const cardClass = colorMap[j.color] || colorMap.blue;
              const badgeClass = badgeMap[j.color] || badgeMap.blue;
              return (
                <div key={j.code} className={`rounded-xl border p-6 ${cardClass}`}>
                  <div className="flex flex-wrap items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded ${badgeClass}`}>
                          {j.code}
                        </span>
                        <span className="text-xs text-slate-500">{j.category}</span>
                      </div>
                      <h3 className="text-xl font-bold text-slate-900">{j.region}</h3>
                      <p className="text-sm text-slate-600 mt-0.5">{j.law}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-slate-900">{j.controls}</div>
                      <div className="text-xs text-slate-500">controls</div>
                      <div className="text-xs text-slate-400 mt-1">Effective: {j.effective}</div>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-2 mb-4">
                    {j.highlights.map((h, i) => (
                      <div key={i} className="flex items-start gap-2 text-sm text-slate-700">
                        <span className="text-green-500 mt-0.5 flex-shrink-0">✓</span>
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-4 text-xs text-slate-500">
                    <span>🏛 {j.authority}</span>
                    <span>⚠️ Penalty: {j.penalty}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cross-cutting INTL-CORE controls */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            INTL-CORE — Multi-Jurisdiction Baseline Controls
          </h2>
          <p className="text-slate-600 mb-8 max-w-2xl">
            Six cross-cutting controls establish a universal compliance foundation that supports
            the minimum requirements of all covered jurisdictions and monitoring packs simultaneously.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { id: 'INTL-CORE-1', title: 'Multi-Jurisdiction AI Compliance Program',        desc: 'Centralized compliance program with per-jurisdiction tracking, regulatory calendar, and designated owners.' },
              { id: 'INTL-CORE-2', title: 'Unified International AI System Register',       desc: 'Single register of all AI systems documenting deployment countries, applicable laws, and risk tiers.' },
              { id: 'INTL-CORE-3', title: 'Cross-Jurisdiction Algorithmic Fairness Baseline',desc: 'Protected-characteristic bias testing supporting EU, UK, Canada proposal tracking, Brazil, and South Korea simultaneously.' },
              { id: 'INTL-CORE-4', title: 'AI Content Provenance and Watermarking',         desc: 'Visible and non-visible markers supporting EU Art. 50, China CAC, and C2PA/ISO 42101-style provenance controls.' },
              { id: 'INTL-CORE-5', title: 'Global AI Incident Reporting and Response',      desc: 'Unified classification with jurisdiction-specific reporting timelines across the covered markets.' },
              { id: 'INTL-CORE-6', title: 'International AI Regulatory Change Management',  desc: 'Quarterly regulatory scan across covered markets with a 90-day policy update cycle.' },
            ].map((ctrl) => (
              <div key={ctrl.id} className="bg-gradient-to-br from-slate-50 to-indigo-50 rounded-xl border border-indigo-100 p-5">
                <div className="text-xs font-mono text-indigo-600 font-semibold mb-2">{ctrl.id}</div>
                <h3 className="font-semibold text-slate-900 text-sm mb-2">{ctrl.title}</h3>
                <p className="text-xs text-slate-600">{ctrl.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NIST AI RMF crosswalk */}
      <section className="py-16 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            NIST AI RMF + EU AI Act Crosswalk
          </h2>
          <p className="text-slate-600 mb-8 max-w-2xl">
            Every applicable control is pre-mapped to NIST AI RMF functions (GOVERN, MAP, MEASURE, MANAGE)
            and to the corresponding EU AI Act article. Evidence collected for one requirement
            automatically satisfies related requirements in other jurisdictions.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full bg-white rounded-xl border border-slate-200 text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">Control</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">NIST AI RMF</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">EU AI Act</th>
                  <th className="text-left px-4 py-3 text-slate-600 font-semibold">Compliance Area</th>
                </tr>
              </thead>
              <tbody>
                {crosswalkMappings.map((m, i) => (
                  <tr key={m.intl} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    <td className="px-4 py-3 font-mono text-indigo-700 font-semibold">{m.intl}</td>
                    <td className="px-4 py-3">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-semibold">{m.nistAiRmf}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs font-semibold">{m.euAia}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">{m.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* API endpoints */}
      <section className="py-16 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Dedicated REST API — <code className="text-indigo-600 text-2xl">/api/v1/international-ai-laws</code>
          </h2>
          <p className="text-slate-600 mb-8 max-w-2xl">
            All four endpoints are available to Gov Cloud &amp; Advisory organizations, rate-limited,
            and authenticated via JWT. Integrate directly into your governance tooling or ITSM workflows.
          </p>
          <div className="grid md:grid-cols-2 gap-4">
            {[
              {
                method: 'GET',
                path: '/api/v1/international-ai-laws/jurisdictions',
                desc: 'All 10 covered jurisdictions plus the shared INTL-CORE baseline with law name, authority, effective dates, penalty ranges, and official source URLs.',
                badge: 'bg-green-100 text-green-700',
              },
              {
                method: 'GET',
                path: '/api/v1/international-ai-laws/controls',
                desc: 'All 49 controls, including jurisdiction-specific and INTL-CORE baseline controls, filterable by jurisdiction, region, control_type, priority, or full-text search.',
                badge: 'bg-green-100 text-green-700',
              },
              {
                method: 'GET',
                path: '/api/v1/international-ai-laws/controls/:controlId',
                desc: 'Single control detail: statute citation, org implementation status, NIST AI RMF and EU AI Act crosswalk mappings.',
                badge: 'bg-green-100 text-green-700',
              },
              {
                method: 'GET',
                path: '/api/v1/international-ai-laws/summary',
                desc: 'Per-jurisdiction completion percentage for the authenticated org: implemented, in-progress, and not-started control counts.',
                badge: 'bg-green-100 text-green-700',
              },
            ].map((ep) => (
              <div key={ep.path} className="bg-slate-900 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded ${ep.badge}`}>{ep.method}</span>
                  <code className="text-green-400 text-xs font-mono">{ep.path}</code>
                </div>
                <p className="text-slate-400 text-sm">{ep.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-gradient-to-r from-indigo-600 to-blue-700 py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl font-bold text-white mb-4">
            Ready to Tackle International AI Compliance?
          </h2>
          <p className="text-indigo-100 text-lg mb-8">
            The International AI Laws Pack is included in the Gov Cloud &amp; Advisory add-on alongside
            US State AI Laws, EU AI Act, NERC CIP, and the broader 40-framework catalog.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <Link
              href="/register"
              className="bg-white text-indigo-700 px-8 py-3 rounded-lg font-semibold hover:bg-indigo-50 transition-colors"
            >
              Start Your Free Trial
            </Link>
            <Link
              href="/frameworks"
              className="border-2 border-white text-white px-8 py-3 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              View All Frameworks
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
