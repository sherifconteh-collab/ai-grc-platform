import type { Metadata } from 'next';
import Link from 'next/link';
import MarketingNav from '@/components/MarketingNav';

export const metadata: Metadata = {
  title: 'Compliance Framework Coverage | ControlWeave',
  description: 'ControlWeave supports a broad compliance catalog spanning EU AI Act, NIST AI RMF, US State AI Laws, International AI Laws, FINRA, SEC AI Risk, SR 11-7, SOC 2, ISO 27001, HIPAA, GDPR, and more. Evidence-driven GRC for every regulation.', // ip-hygiene:ignore
  alternates: { canonical: 'https://controlweave.com/frameworks' },
  openGraph: {
    title: 'Compliance Framework Coverage | ControlWeave',
    description: 'ControlWeave supports a broad compliance catalog including EU AI Act, NIST AI RMF, US State AI Laws, FINRA, SEC AI Risk, SR 11-7, and more.',
    url: 'https://controlweave.com/frameworks',
  },
};

const frameworks = [
  {
    href: '/frameworks/eu-ai-act',
    name: 'EU AI Act',
    description: 'Complete EU AI Act compliance platform. Risk classification, Article 17 quality management (prEN 18286), human oversight, and bias testing.',
    tag: 'AI Regulation',
    highlight: true,
  },
  {
    href: '/frameworks/nist-ai-rmf',
    name: 'NIST AI RMF',
    description: 'Implement the NIST AI Risk Management Framework. Cover all four functions: GOVERN, MAP, MEASURE, and MANAGE with automated evidence collection.',
    tag: 'AI Governance',
    highlight: false,
  },
  {
    href: '/frameworks/soc-2',
    name: 'SOC 2',
    description: 'Pass your SOC 2 Type 2 audit faster with automated evidence collection, control tracking, and audit-ready reports.',
    tag: 'Security & Trust',
    highlight: false,
  },
];

const additionalFrameworks = [
  'NIST 800-53 Rev 5', 'NIST 800-171 Rev 3', 'ISO 27001:2022', 'HIPAA (2024 Update)', 'GDPR',
  'NIST CSF 2.0', 'FedRAMP', 'CMMC 2.0', 'ISO 42001:2023', 'DISA STIG',
  'CCPA/CPRA 2023', 'PCI DSS', 'NERC CIP', 'FFIEC', 'FISCAM',
  'US State AI Laws', 'International AI Laws',
];

const financialServicesFrameworks = [
  {
    name: 'FINRA Supervisory Controls for AI',
    subtitle: 'Notice 24-09',
    description: 'End-to-end supervisory framework for AI-generated communications, Reg BI best-interest alignment, algorithmic trading surveillance, and third-party AI vendor due diligence.',
    controls: 10,
  },
  {
    name: 'SEC AI Risk Management',
    subtitle: 'RIAs & Broker-Dealers',
    description: 'Fiduciary duty, conflicts-of-interest disclosure, robo-advisory governance, and explainability requirements for SEC-registered investment advisers and broker-dealers deploying AI.',
    controls: 10,
  },
  {
    name: 'SR 11-7 Model Risk Management',
    subtitle: 'Fed Reserve / OCC Guidance',
    description: 'Full model risk lifecycle: inventory, tiering, development standards, independent validation, conceptual soundness, outcomes analysis, ongoing monitoring, and vendor model oversight.',
    controls: 14,
  },
];

export default function FrameworksIndex() {
  return (
    <div className="min-h-screen bg-gray-50">
      <MarketingNav />
      {/* Hero */}
      <section className="bg-linear-to-br from-purple-900 via-indigo-900 to-purple-900 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-purple-300 mb-4">Framework Coverage</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">Frameworks, Standards &amp; Regulations — One Platform</h1>
          <p className="text-lg text-purple-200 max-w-2xl mx-auto">
            ControlWeave provides evidence-driven compliance automation for every major security, privacy, financial services, and AI governance framework &mdash; with intelligent crosswalk mappings that eliminate duplicate work.
          </p>
        </div>
      </section>

      {/* Featured frameworks */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-2xl font-bold text-gray-900 mb-8 text-center">Featured Framework Guides</h2>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {frameworks.map((fw) => (
              <div
                key={fw.href}
                className={`rounded-2xl border p-8 hover:shadow-lg transition-shadow flex flex-col ${fw.highlight ? 'border-purple-400 bg-purple-50' : 'border-gray-200 bg-white'}`}
              >
                <div className="flex items-center gap-2 mb-4">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${fw.highlight ? 'bg-purple-200 text-purple-800' : 'bg-gray-100 text-gray-600'}`}>{fw.tag}</span>
                  {fw.highlight && <span className="text-xs font-semibold bg-green-100 text-green-700 px-2 py-0.5 rounded-full">&#11088; Key differentiator</span>}
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">{fw.name}</h2>
                <p className="text-gray-600 mb-6 flex-1">{fw.description}</p>
                <Link
                  href={fw.href}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${fw.highlight ? 'bg-linear-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90' : 'border border-purple-600 text-purple-600 hover:bg-purple-50'}`}
                >
                  View {fw.name} Coverage &rarr;
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Financial Services AI Governance Pack — Premium / Gov Cloud & Advisory Tier */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-linear-to-br from-amber-50 to-yellow-50 border-t border-amber-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">Financial Services AI Governance Pack</h2>
            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-300">
              ⭐ Gov Cloud & Advisory Add-On
            </span>
          </div>
          <p className="text-gray-600 mb-8 max-w-3xl">
            Purpose-built for RIAs, broker-dealers, asset managers, and banks deploying AI. This premium pack delivers FINRA, SEC, and Federal Reserve model risk governance in one unified platform &mdash; with automated crosswalk mappings to NIST AI RMF so evidence is never collected twice.
          </p>
          <div className="grid gap-6 sm:grid-cols-3">
            {financialServicesFrameworks.map((fw) => (
              <div key={fw.name} className="bg-white rounded-2xl border border-amber-200 p-6 shadow-sm hover:shadow-md transition-shadow flex flex-col">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">{fw.subtitle}</div>
                    <h3 className="text-base font-bold text-gray-900">{fw.name}</h3>
                  </div>
                  <span className="shrink-0 text-xs bg-amber-50 border border-amber-200 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{fw.controls} controls</span>
                </div>
                <p className="text-gray-600 text-sm flex-1">{fw.description}</p>
                <div className="mt-4 pt-4 border-t border-amber-100">
                  <span className="text-xs text-amber-600 font-medium">✓ Crosswalked to NIST AI RMF</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-block bg-linear-to-r from-amber-500 to-yellow-500 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity text-center"
            >
              Talk to Sales — Financial Services Pack
            </Link>
            <Link
              href="/register"
              className="inline-block border border-amber-500 text-amber-700 px-8 py-3 rounded-xl font-semibold hover:bg-amber-50 transition-colors text-center"
            >
              Start Free Trial
            </Link>
          </div>
        </div>
      </section>

      {/* All frameworks */}
      <section className="py-12 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-200">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">All Supported Frameworks</h2>
          <p className="text-gray-600 mb-8">Full coverage with intelligent crosswalk mappings &mdash; work done for one framework automatically satisfies overlapping requirements across others.</p>
          <div className="flex flex-wrap gap-3 justify-center">
            {additionalFrameworks.map((fw) => (
              <span key={fw} className="bg-gray-100 text-gray-700 text-sm font-medium px-4 py-2 rounded-full">{fw}</span>
            ))}
          </div>
        </div>
      </section>

      {/* State AI Laws Pack */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-linear-to-br from-indigo-50 to-blue-50 border-t border-indigo-200">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-gray-900">US State AI Laws Pack</h2>
            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-300">
              ⭐ Gov Cloud & Advisory Add-On
            </span>
          </div>
          <p className="text-gray-600 mb-8 max-w-3xl">
            Jurisdiction-specific controls for major enacted US state and local AI rules, plus high-priority emerging measures &mdash; Colorado SB 205, Illinois AI Video Interview Act, NYC Local Law 144, California AI disclosure and transparency measures, Texas TRAIGA, Utah SB 149, Tennessee ELVIS Act, Washington proposals, and more. All 47 controls are pre-mapped to NIST AI RMF so evidence is never collected twice.
          </p>
          <div className="grid gap-4 sm:grid-cols-3 mb-8">
            {[
              { stat: '12', label: 'Tracked Jurisdictions', note: 'State and local AI rules' },
              { stat: '47', label: 'Specific Controls', note: 'Jurisdiction-accurate citations' },
              { stat: 'Crosswalked', label: 'NIST AI RMF Aligned', note: 'Evidence reuse across jurisdictions' },
            ].map((item) => (
              <div key={item.stat} className="bg-white rounded-xl border border-indigo-200 p-5 text-center">
                <div className="text-2xl font-bold text-indigo-700 mb-0.5">{item.stat}</div>
                <div className="text-sm font-semibold text-gray-800">{item.label}</div>
                <div className="text-xs text-gray-500 mt-0.5">{item.note}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/frameworks/state-ai-laws"
              className="inline-block bg-linear-to-r from-indigo-600 to-blue-600 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity text-center"
            >
              View State AI Laws Coverage
            </Link>
            <Link
              href="/contact"
              className="inline-block border border-indigo-500 text-indigo-700 px-8 py-3 rounded-xl font-semibold hover:bg-indigo-50 transition-colors text-center"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* International AI Laws Pack */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-linear-to-br from-slate-900 via-blue-950 to-indigo-900 border-t border-blue-800">
        <div className="max-w-5xl mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
            <h2 className="text-2xl font-bold text-white">🌍 International AI Laws Pack</h2>
            <span className="inline-flex items-center gap-1.5 bg-amber-100 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-full border border-amber-300">
              ⭐ Gov Cloud & Advisory Add-On
            </span>
            <span className="inline-flex items-center gap-1.5 bg-blue-700 text-blue-100 text-xs font-semibold px-3 py-1.5 rounded-full">
              NEW 2025
            </span>
          </div>
          <p className="text-blue-200 mb-8 max-w-3xl">
            43 jurisdiction-specific controls plus 6 INTL-CORE baselines across 10 major international AI law, privacy, and policy packs &mdash; EU AI Act, the UK AI regulatory framework, Canada AIDA proposal tracking, Brazil LGPD plus AI bill monitoring, Singapore PDPA + AI governance guidance, Japan APPI, South Korea AI Basic Act, China CAC generative AI and algorithm rules, Australia privacy and AI guidance, and India DPDP Act. All controls are crosswalked to NIST AI RMF and EU AI Act so evidence collected once supports multiple markets.
          </p>
          <div className="grid gap-4 sm:grid-cols-4 mb-8">
            {[
              { stat: '10', label: 'Jurisdictions Covered', note: 'EU, UK, CA, BR, SG, JP, KR, CN, AU, IN' },
              { stat: '43', label: 'Specific Controls', note: 'Statute-cited, not generic guidance' },
              { stat: 'Dual', label: 'Crosswalk Targets', note: 'NIST AI RMF + EU AI Act' },
              { stat: '6',   label: 'INTL-CORE Baselines', note: 'Multi-jurisdiction foundation controls' },
            ].map((item) => (
              <div key={item.stat} className="bg-white/10 backdrop-blur rounded-xl border border-white/20 p-5 text-center">
                <div className="text-2xl font-bold text-white mb-0.5">{item.stat}</div>
                <div className="text-sm font-semibold text-blue-200">{item.label}</div>
                <div className="text-xs text-blue-400 mt-0.5">{item.note}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/frameworks/international-ai-laws"
              className="inline-block bg-white text-slate-900 px-8 py-3 rounded-xl font-semibold hover:bg-blue-50 transition-colors text-center"
            >
              View International AI Laws Coverage
            </Link>
            <Link
              href="/contact"
              className="inline-block border border-white text-white px-8 py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors text-center"
            >
              Talk to Sales
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Start your compliance program today</h2>
          <p className="text-gray-600 mb-6">Free tier includes 2 frameworks, core controls, and AI-assisted assessments. No credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-linear-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
              Get Started Free
            </Link>
            <Link href="/contact" className="border border-purple-600 text-purple-600 px-8 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors">
              Book Enterprise Demo
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
