import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'US State AI Laws Compliance | ControlWeave',
  description: 'Coverage of 12 US state and local AI law trackers, including Colorado SB 205, Illinois AI Video Interview Act, NYC Local Law 144, California AI transparency measures, Texas TRAIGA, Utah SB 149, Tennessee ELVIS Act, and other fast-moving AI governance rules. Gov Cloud & Advisory add-on.', // ip-hygiene:ignore
  alternates: { canonical: 'https://controlweave.com/frameworks/state-ai-laws' },
  openGraph: {
    title: 'US State AI Laws Compliance | ControlWeave',
    description: 'One workspace for US state and local AI law tracking. ControlWeave maps 47 jurisdiction-specific controls across 12 tracked jurisdictions to NIST AI RMF so evidence collected once supports multiple obligations.',
    url: 'https://controlweave.com/frameworks/state-ai-laws',
  },
};

const jurisdictions = [
  {
    code: 'CO',
    state: 'Colorado',
    law: 'SB 205 — Colorado AI Act',
    effective: 'Feb 1, 2026',
    category: 'High-Risk AI / Impact Assessment',
    controls: 5,
    highlights: [
      'Mandatory impact assessments for high-risk AI systems before deployment',
      'Plain-language consumer disclosure for consequential decisions',
      'Algorithmic discrimination prevention with pre-deployment bias testing',
      'Consumer right to appeal AI decisions through human review',
      'Developer documentation and disclosure obligations',
    ],
    color: 'blue',
  },
  {
    code: 'IL',
    state: 'Illinois',
    law: 'AI Video Interview Act + 2026 amendments (HB 3773)',
    effective: '2019 act / 2026 amendments',
    category: 'Employment AI',
    controls: 4,
    highlights: [
      'Written consent required before AI-analyzed video interviews',
      'Video data destruction within 30 days of request',
      'Prohibition on AI as the sole screening basis for interview exclusion',
      'Two-year audit log retention for AI employment decisions',
    ],
    color: 'indigo',
  },
  {
    code: 'NYC',
    state: 'New York City',
    law: 'Local Law 144 — Automated Employment Decision Tools',
    effective: 'July 5, 2023',
    category: 'Employment AI / Bias Audit',
    controls: 4,
    highlights: [
      'Annual independent bias audit of all AEDTs — mandatory before first use',
      'Public website publication of audit results with impact ratios',
      '10-business-day advance notice to NYC-based candidates',
      'Three-year retention of bias audit reports and supporting data',
    ],
    color: 'purple',
  },
  {
    code: 'CA',
    state: 'California',
    law: 'Selected California AI and privacy measures (SB 942, SB 896, AB 2013, AB 2885, AB 1008)',
    effective: '2024-2026 phased',
    category: 'GenAI Transparency / Privacy',
    controls: 6,
    highlights: [
      'C2PA watermarking for AI-generated content (SB 942)',
      'Public training data documentation for post-2022 datasets (AB 2013)',
      'GenAI risk assessments for state agency contracts (SB 896)',
      'AI-derived inferences treated as personal information under CCPA (AB 1008)',
    ],
    color: 'green',
  },
  {
    code: 'TX',
    state: 'Texas',
    law: 'Texas Responsible AI Governance Act (TRAIGA)',
    effective: 'September 1, 2025',
    category: 'High-Risk AI / Impact Assessment',
    controls: 3,
    highlights: [
      'Consumer disclosure when high-risk AI influences consequential decisions',
      'Documented algorithmic bias risk management program required',
      'Deployer oversight obligations including monitoring and audit records',
    ],
    color: 'red',
  },
  {
    code: 'VA',
    state: 'Virginia',
    law: 'HB 2048 — Proposed AI Impact Assessment bill',
    effective: 'July 1, 2026',
    category: 'High-Risk AI / Consumer Rights',
    controls: 3,
    highlights: [
      'Pre-deployment impact assessment for high-risk AI systems',
      'Consumer right to opt-out of AI profiling for significant decisions',
      'Human review option required for automated consequential decisions',
    ],
    color: 'orange',
  },
  {
    code: 'CT',
    state: 'Connecticut',
    law: 'SB 2 — Proposed Connecticut AI Act',
    effective: 'January 1, 2026',
    category: 'High-Risk AI / Governance',
    controls: 3,
    highlights: [
      'Developer duty of reasonable care against algorithmic discrimination',
      'Deployer impact assessment and consumer appeals process',
      'Annual compliance disclosure to the Attorney General',
    ],
    color: 'teal',
  },
  {
    code: 'TN',
    state: 'Tennessee',
    law: 'ELVIS Act — Ensuring Likeness Voice and Image Security',
    effective: 'July 1, 2024',
    category: 'AI Voice / Likeness / Content',
    controls: 3,
    highlights: [
      'Explicit consent required before AI replication of voice or likeness',
      'Takedown and removal process for unauthorized AI-generated replications',
      'Platform safe harbor compliance through designated agent registration',
    ],
    color: 'pink',
  },
  {
    code: 'UT',
    state: 'Utah',
    law: 'SB 149 — Utah AI Policy Act',
    effective: 'May 1, 2024',
    category: 'AI Disclosure / Regulated Occupations',
    controls: 3,
    highlights: [
      'GenAI disclosure in legal, healthcare, and financial services',
      'AI chatbot must disclose its nature when sincerely asked',
      'Consumer Protection Division reporting obligations',
    ],
    color: 'amber',
  },
  {
    code: 'WA',
    state: 'Washington',
    law: 'SB 5838 / HB 1951 — Proposed Automated Decision Systems rules',
    effective: 'July 27, 2025',
    category: 'Employment AI / Automated Decisions',
    controls: 3,
    highlights: [
      'Automated decision system inventory with risk classification',
      'Public impact assessment summaries for housing, employment, credit, healthcare',
      'Candidate disclosure when AI materially contributes to hiring decisions',
    ],
    color: 'cyan',
  },
  {
    code: 'MD',
    state: 'Maryland',
    law: 'HB 1281 — Proposed Automated Decision Tools bill',
    effective: 'October 1, 2025',
    category: 'Employment AI / Bias Audit',
    controls: 2,
    highlights: [
      'Independent bias audit for employment AEDTs before use',
      'Consumer complaint resolution within 30 days',
    ],
    color: 'violet',
  },
  {
    code: 'NY',
    state: 'New York State',
    law: 'Tracked AI transparency proposals',
    effective: 'Tracked 2025+ legislative cycle',
    category: 'AI Transparency / High-Stakes Decisions',
    controls: 2,
    highlights: [
      'Plain-language explanation of automated system decision logic',
      'Annual algorithmic bias evaluation for high-stakes decisions',
    ],
    color: 'slate',
  },
];

const crossCuttingControls = [
  { id: 'SAI-CORE-1', title: 'Multi-State AI Compliance Program', desc: 'Centralized program with compliance calendar, regulatory watch, and per-jurisdiction owners' },
  { id: 'SAI-CORE-2', title: 'Unified AI System Register', desc: 'Single register spanning all AI systems with applicable laws, risk tier, and assessment status' },
  { id: 'SAI-CORE-3', title: 'Cross-State Algorithmic Fairness Controls', desc: 'Baseline controls satisfying CO, TX, VA, CT, and WA discrimination prohibitions simultaneously' },
  { id: 'SAI-CORE-4', title: 'AI Training Data Provenance', desc: 'Documented data lineage satisfying CA, VA, and CT transparency requirements' },
  { id: 'SAI-CORE-5', title: 'State-Level Consumer Rights Fulfillment', desc: 'Workflows for AI-specific rights: appeal (CO/VA/CT), human review (NYC/WA), opt-out (VA/CO), likeness control (TN/CA)' },
  { id: 'SAI-CORE-6', title: 'Regulatory Change Management', desc: 'Quarterly state AI law tracking log with 90-day policy update SLA' },
];

const colorMap: Record<string, { bg: string; border: string; badge: string; dot: string }> = {
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-100 text-blue-800',   dot: 'bg-blue-500' },
  indigo: { bg: 'bg-indigo-50', border: 'border-indigo-200', badge: 'bg-indigo-100 text-indigo-800', dot: 'bg-indigo-500' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-100 text-purple-800', dot: 'bg-purple-500' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-100 text-green-800',  dot: 'bg-green-500' },
  red:    { bg: 'bg-red-50',    border: 'border-red-200',    badge: 'bg-red-100 text-red-800',      dot: 'bg-red-500' },
  orange: { bg: 'bg-orange-50', border: 'border-orange-200', badge: 'bg-orange-100 text-orange-800', dot: 'bg-orange-500' },
  teal:   { bg: 'bg-teal-50',   border: 'border-teal-200',   badge: 'bg-teal-100 text-teal-800',   dot: 'bg-teal-500' },
  pink:   { bg: 'bg-pink-50',   border: 'border-pink-200',   badge: 'bg-pink-100 text-pink-800',   dot: 'bg-pink-500' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  cyan:   { bg: 'bg-cyan-50',   border: 'border-cyan-200',   badge: 'bg-cyan-100 text-cyan-800',   dot: 'bg-cyan-500' },
  violet: { bg: 'bg-violet-50', border: 'border-violet-200', badge: 'bg-violet-100 text-violet-800', dot: 'bg-violet-500' },
  slate:  { bg: 'bg-slate-50',  border: 'border-slate-200',  badge: 'bg-slate-100 text-slate-700', dot: 'bg-slate-500' },
};

export default function StateAiLawsPage() {
  const totalControls = jurisdictions.reduce((sum, j) => sum + j.controls, 0) + crossCuttingControls.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <MarketingNav />

      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 mb-4">
            <span className="text-xs font-semibold uppercase tracking-widest text-purple-300">Gov Cloud &amp; Advisory</span>
            <span className="text-xs font-semibold bg-amber-400 text-amber-900 px-2.5 py-0.5 rounded-full">⭐ Add-On</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">US State AI Governance Laws</h1>
          <p className="text-lg text-purple-200 max-w-2xl mx-auto mb-6">
            {jurisdictions.length} jurisdictions. {totalControls} controls. All crosswalked to NIST AI RMF.
            One workspace to track major enacted and emerging US state AI rules — from Colorado SB 205 to NYC Local Law 144.
          </p>
          <div className="flex flex-wrap justify-center gap-4 text-sm">
            <span className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full">
              🗺️ {jurisdictions.length} State/Local Jurisdictions
            </span>
            <span className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full">
              🔒 {totalControls} Specific Controls
            </span>
            <span className="bg-white/10 text-white border border-white/20 px-4 py-2 rounded-full">
              🔗 NIST AI RMF Crosswalk
            </span>
          </div>
        </div>
      </section>

      {/* Why this matters */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto">
          <div className="grid sm:grid-cols-3 gap-6 text-center">
            {[
              { stat: '12', label: 'Tracked Jurisdictions', note: 'State and local AI measures' },
              { stat: 'Tracked', label: 'Emerging Measures', note: 'High-priority bills and agency actions' },
              { stat: '47', label: 'Jurisdiction-Specific Controls', note: 'Mapped to NIST AI RMF' },
            ].map((item) => (
              <div key={item.stat} className="p-4">
                <div className="text-3xl font-bold text-purple-700 mb-1">{item.stat}</div>
                <div className="text-sm font-semibold text-gray-800">{item.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.note}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Jurisdiction-by-Jurisdiction Coverage */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">State-by-State Coverage</h2>
          <p className="text-gray-600 mb-10 text-center max-w-2xl mx-auto">
            Each jurisdiction record captures current enacted rules or high-priority tracked measures. ControlWeave maps them into citation-aware controls and a unified evidence model.
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {jurisdictions.map((j) => {
              const colors = colorMap[j.color] || colorMap.slate;
              return (
                <div
                  key={j.code}
                  className={`rounded-2xl border ${colors.border} ${colors.bg} p-6 flex flex-col`}
                >
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full ${colors.dot} shrink-0`} />
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{j.code}</span>
                        <span className="text-xs text-gray-400">• timeline {j.effective}</span>
                      </div>
                      <h3 className="text-base font-bold text-gray-900">{j.state}</h3>
                      <div className="text-xs text-gray-600 mt-0.5 font-medium">{j.law}</div>
                    </div>
                    <span className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${colors.badge}`}>
                      {j.controls} controls
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 font-medium mb-3 uppercase tracking-wide">{j.category}</div>
                  <ul className="space-y-1.5 flex-1">
                    {j.highlights.map((h) => (
                      <li key={h} className="flex items-start gap-2 text-sm text-gray-700">
                        <span className="text-green-500 shrink-0 mt-0.5">✓</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Cross-Cutting Controls */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-200">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-2 text-center">Cross-Cutting Multi-State Controls</h2>
          <p className="text-gray-600 mb-8 text-center max-w-2xl mx-auto">
            Six foundational controls that satisfy requirements across multiple jurisdictions simultaneously — reducing compliance overhead by up to 60%.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {crossCuttingControls.map((ctrl) => (
              <div key={ctrl.id} className="bg-gray-50 border border-gray-200 rounded-xl p-5">
                <div className="text-xs font-mono font-bold text-purple-600 mb-2">{ctrl.id}</div>
                <div className="text-sm font-semibold text-gray-900 mb-1">{ctrl.title}</div>
                <div className="text-xs text-gray-600">{ctrl.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* NIST AI RMF Crosswalk */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-indigo-50 to-purple-50 border-t border-indigo-100">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Built-In NIST AI RMF Crosswalk</h2>
          <p className="text-gray-600 mb-8 max-w-2xl mx-auto">
            Every state AI law control is pre-mapped to the NIST AI RMF GOVERN, MAP, MEASURE, and MANAGE functions.
            Evidence collected for one requirement automatically satisfies overlapping obligations across jurisdictions.
          </p>
          <div className="grid sm:grid-cols-4 gap-4">
            {[
              { fn: 'GOVERN', color: 'bg-blue-100 text-blue-800', desc: 'Compliance program, risk policies, accountability' },
              { fn: 'MAP', color: 'bg-green-100 text-green-800', desc: 'AI system context, impact assessments, categorization' },
              { fn: 'MEASURE', color: 'bg-orange-100 text-orange-800', desc: 'Bias audits, training data transparency, metrics' },
              { fn: 'MANAGE', color: 'bg-purple-100 text-purple-800', desc: 'Consumer rights, appeals, takedowns, disclosure' },
            ].map((fn) => (
              <div key={fn.fn} className="bg-white rounded-xl border border-gray-200 p-4 text-left">
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${fn.color} block w-fit mb-2`}>{fn.fn}</span>
                <p className="text-xs text-gray-600">{fn.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* API Access */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-900 text-white">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold mb-4 text-center">State AI Laws API</h2>
          <p className="text-gray-300 mb-8 text-center max-w-2xl mx-auto">
            Gov Cloud &amp; Advisory organizations get dedicated REST API endpoints to programmatically access jurisdiction metadata,
            control definitions, implementation status, and NIST AI RMF crosswalk mappings.
          </p>
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              { method: 'GET', path: '/api/v1/state-ai-laws/jurisdictions', desc: 'List all 12+ supported state/local jurisdictions with law metadata and effective dates' },
              { method: 'GET', path: '/api/v1/state-ai-laws/controls', desc: 'Query all 50 state AI law controls with filters for jurisdiction, type, priority, or keyword search' },
              { method: 'GET', path: '/api/v1/state-ai-laws/controls/:id', desc: 'Fetch a single control with org implementation status and NIST AI RMF crosswalk mappings' },
              { method: 'GET', path: '/api/v1/state-ai-laws/summary', desc: 'Per-jurisdiction compliance summary with implementation progress and completion percentage' },
            ].map((endpoint) => (
              <div key={endpoint.path} className="bg-gray-800 rounded-xl p-5 border border-gray-700">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold bg-green-900 text-green-300 px-2 py-0.5 rounded">{endpoint.method}</span>
                  <code className="text-xs text-purple-300 font-mono">{endpoint.path}</code>
                </div>
                <p className="text-xs text-gray-400">{endpoint.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-amber-50 to-yellow-50 border-t border-amber-200">
        <div className="max-w-2xl mx-auto text-center">
          <div className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-300 mb-4">
            ⭐ Gov Cloud &amp; Advisory Add-On
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Stay Ahead of State AI Legislation</h2>
          <p className="text-gray-600 mb-6">
            New state AI laws are enacted every quarter. ControlWeave keeps your compliance program current with
            automatic control updates, regulatory alerts, and built-in crosswalk intelligence.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-block bg-gradient-to-r from-amber-500 to-yellow-500 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity text-center"
            >
              Talk to Sales — Gov Cloud &amp; Advisory
            </Link>
            <Link
              href="/register"
              className="inline-block border border-amber-500 text-amber-700 px-8 py-3 rounded-xl font-semibold hover:bg-amber-50 transition-colors text-center"
            >
              Start Free Trial
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-4">
            Also available: <Link href="/frameworks" className="text-purple-600 hover:underline">Financial Services AI Governance Pack</Link> and{' '}
            <Link href="/frameworks/eu-ai-act" className="text-purple-600 hover:underline">EU AI Act compliance</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
