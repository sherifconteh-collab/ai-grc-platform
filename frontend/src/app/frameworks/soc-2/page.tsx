import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, ClipboardCheck, Clock, CheckCircle, BarChart2 } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'SOC 2 Compliance Software | Automate Type 2 Audit Preparation',
  description: 'Pass your SOC 2 Type 2 audit faster. Automated evidence collection, control tracking, and audit-ready reports. Built for SaaS companies. Start free trial.', // ip-hygiene:ignore
  keywords: [
    'SOC 2 compliance',
    'SOC 2 Type 2',
    'SOC 2 audit preparation',
    'SOC 2 automation',
    'compliance automation',
    'evidence-based compliance',
    'SOC 2 software',
    'GRC software',
    'audit-ready compliance',
  ],
  alternates: {
    canonical: 'https://controlweave.com/frameworks/soc-2',
  },
  openGraph: {
    title: 'SOC 2 Compliance Software | Automate Type 2 Audit Preparation',
    description: 'Pass your SOC 2 Type 2 audit faster. Automated evidence collection, control tracking, and audit-ready reports. Built for SaaS companies. Start free trial.', // ip-hygiene:ignore
    url: 'https://controlweave.com/frameworks/soc-2',
  },
};

const trustCriteria = [
  {
    code: 'CC',
    name: 'Common Criteria (Security)',
    description: 'Controls related to logical and physical access, change management, risk mitigation, and monitoring. Required for all SOC 2 reports.', // ip-hygiene:ignore
    controls: ['CC1: Control Environment', 'CC2: Communication & Information', 'CC3: Risk Assessment', 'CC4: Monitoring Activities', 'CC5: Control Activities', 'CC6: Logical Access', 'CC7: System Operations', 'CC8: Change Management', 'CC9: Risk Mitigation'],
    required: true,
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    textColor: 'text-purple-700',
  },
  {
    code: 'A',
    name: 'Availability',
    description: 'Controls ensuring the system is available for operation and use as committed or agreed, including performance monitoring and incident response.',
    controls: ['A1.1: Current processing capacity', 'A1.2: Environment threats', 'A1.3: Recovery procedures'],
    required: false,
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    textColor: 'text-blue-700',
  },
  {
    code: 'C',
    name: 'Confidentiality',
    description: 'Controls ensuring information designated as confidential is protected, including data classification, encryption, and disposal.',
    controls: ['C1.1: Confidential information identification', 'C1.2: Confidential information disposal'],
    required: false,
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    textColor: 'text-green-700',
  },
  {
    code: 'PI',
    name: 'Processing Integrity',
    description: 'Controls ensuring system processing is complete, valid, accurate, timely, and authorized, including error detection and data validation.',
    controls: ['PI1.1: Complete and accurate processing', 'PI1.2: Outputs are complete', 'PI1.3: System inputs are accurate'],
    required: false,
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    textColor: 'text-orange-700',
  },
  {
    code: 'P',
    name: 'Privacy',
    description: 'Controls ensuring personal information is collected, used, retained, disclosed, and disposed of in accordance with commitments and applicable law.',
    controls: ['P1: Privacy Notice & Communication', 'P2: Choice & Consent', 'P3: Collection', 'P4: Use, Retention & Disposal', 'P5: Access', 'P6: Disclosure', 'P7: Quality', 'P8: Monitoring & Enforcement'],
    required: false,
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    textColor: 'text-red-700',
  },
];

const relatedArticles = [
  {
    title: 'EU AI Act Compliance Platform',
    href: '/frameworks/eu-ai-act',
    description: 'Complete EU AI Act compliance for high-risk AI systems, including Article 17 quality management and prEN 18286.',
  },
  {
    title: 'NIST AI RMF Compliance Platform',
    href: '/frameworks/nist-ai-rmf',
    description: 'Implement the NIST AI Risk Management Framework with Govern, Map, Measure, and Manage functions.',
  },
  {
    title: 'AI Governance Platform: Complete Guide',
    href: '/blog/ai-governance-platform-guide',
    description: 'What is an AI governance platform? Learn about frameworks, features, and how to choose the right solution.',
  },
];

export default function SOC2Page() {
  return (
    <>
      <div className="min-h-screen bg-white text-gray-900">
        {/* Nav */}
        <nav className="border-b border-gray-100 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 font-bold text-gray-900 text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/branding/controlweave-emblem.svg" alt="ControlWeave" className="h-8 w-8" />
              ControlWeave
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/frameworks/eu-ai-act" className="text-sm text-gray-600 hover:text-purple-600">EU AI Act</Link>
              <Link href="/frameworks/nist-ai-rmf" className="text-sm text-gray-600 hover:text-purple-600">NIST AI RMF</Link>
              <Link href="/register" className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="bg-gradient-to-b from-indigo-50 to-white py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Breadcrumbs items={[{ label: 'Frameworks', href: '/frameworks' }, { label: 'SOC 2' }]} />
            <div className="inline-flex items-center gap-2 bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
              <ClipboardCheck size={14} />
              SOC 2 Compliance Automation
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6">
              SOC 2 Compliance Automation
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Pass your SOC 2 Type 2 audit faster with automated evidence collection, control tracking, and audit-ready reports. Built for SaaS companies that need to prove compliance, not just assert it.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="bg-purple-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-purple-700 transition-colors text-center">
                Start Free Trial
              </Link>
              <Link href="/contact" className="border border-gray-300 text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors text-center">
                Book Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Type 1 vs Type 2 */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">SOC 2 Type 1 vs. SOC 2 Type 2</h2>
            <p className="text-gray-600 leading-relaxed mb-8">
              SOC 2 reports are issued by independent auditors and assess how a service organization manages customer data. The two main report types differ in their scope and the strength of assurance they provide.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
              <div className="rounded-2xl border border-gray-200 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    <ShieldCheck size={20} className="text-gray-600" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-900">SOC 2 Type 1</h3>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  A point-in-time assessment that evaluates whether your security controls are <strong>suitably designed</strong> as of a specific date. Type 1 establishes baseline compliance but provides limited assurance about ongoing effectiveness.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Faster to achieve (2–4 months)</li>
                  <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Good starting point for new programs</li>
                  <li className="flex items-center gap-2"><span className="text-yellow-500">◐</span> Point-in-time only, limited market value</li>
                </ul>
              </div>
              <div className="rounded-2xl border border-purple-300 bg-purple-50 p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center">
                    <CheckCircle size={20} className="text-purple-700" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">SOC 2 Type 2</h3>
                    <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">Recommended</span>
                  </div>
                </div>
                <p className="text-gray-600 text-sm leading-relaxed mb-4">
                  A period-based assessment (typically 6–12 months) that evaluates whether your controls are <strong>operating effectively over time</strong>. Type 2 is the gold standard and what most enterprise customers and enterprise sales teams require.
                </p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Industry-standard assurance for enterprise deals</li>
                  <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Covers controls over a period (6–12 months)</li>
                  <li className="flex items-center gap-2"><span className="text-green-500">✓</span> Required by most enterprise customers</li>
                </ul>
              </div>
            </div>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
              <p className="text-sm text-purple-800">
                <strong>ControlWeave tip:</strong> Start SOC 2 Type 1 while building your evidence collection for Type 2. ControlWeave&apos;s evidence freshness scoring helps you maintain continuous Type 2-quality evidence — so the audit period passes with confidence, not panic.
              </p>
            </div>
          </div>
        </section>

        {/* Trust Service Criteria */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">The 5 SOC 2 Trust Service Criteria</h2>
            <p className="text-gray-600 mb-10">
              SOC 2 is organized around five Trust Service Criteria (TSC). Security (Common Criteria) is required for all SOC 2 reports. The others are optional and selected based on your organization&apos;s commitments to customers.
            </p>
            <div className="space-y-6">
              {trustCriteria.map((tc) => (
                <div key={tc.code} className={`rounded-2xl border p-6 ${tc.bgColor} ${tc.borderColor}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-wider ${tc.textColor} px-2 py-0.5 rounded-full ${tc.bgColor} border ${tc.borderColor} inline-block mb-2`}>{tc.code}</span>
                      <h3 className="text-lg font-bold text-gray-900">{tc.name}</h3>
                    </div>
                    {tc.required && (
                      <span className="text-xs font-bold text-white bg-purple-600 px-3 py-1 rounded-full flex-shrink-0">Required</span>
                    )}
                  </div>
                  <p className="text-gray-700 text-sm leading-relaxed mb-4">{tc.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {tc.controls.map((control) => (
                      <div key={control} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-400 flex-shrink-0"></span>
                        {control}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Implementation Timeline */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">SOC 2 Implementation Timeline</h2>
            <p className="text-gray-600 mb-10">
              A typical SOC 2 Type 2 journey takes 6–18 months. ControlWeave compresses this timeline with compliance automation and evidence-based compliance tracking.
            </p>
            <div className="space-y-6">
              {[
                {
                  phase: 'Month 1–2',
                  title: 'Scope & Gap Assessment',
                  description: 'Define your SOC 2 scope, select Trust Service Criteria, and complete gap analysis against current controls. ControlWeave\'s AI gap analysis identifies missing controls immediately.', // ip-hygiene:ignore
                  icon: <Clock size={20} className="text-purple-600" />,
                },
                {
                  phase: 'Month 2–4',
                  title: 'Control Implementation',
                  description: 'Implement missing controls, document policies and procedures, and begin evidence collection. ControlWeave\'s 500+ control library accelerates implementation with pre-built SOC 2 controls.', // ip-hygiene:ignore
                  icon: <ShieldCheck size={20} className="text-blue-600" />,
                },
                {
                  phase: 'Month 4–5',
                  title: 'Readiness Assessment',
                  description: 'Conduct internal readiness assessment, identify any remaining gaps, and validate evidence quality. ControlWeave\'s evidence freshness scoring shows exactly where you stand.',
                  icon: <ClipboardCheck size={20} className="text-green-600" />,
                },
                {
                  phase: 'Month 5–6',
                  title: 'SOC 2 Type 1 (Optional)',
                  description: 'If needed, achieve SOC 2 Type 1 as a milestone while building the evidence base for Type 2. ControlWeave generates audit packages for your auditor on demand.', // ip-hygiene:ignore
                  icon: <CheckCircle size={20} className="text-teal-600" />,
                },
                {
                  phase: 'Month 6–18',
                  title: 'Observation Period (Type 2)',
                  description: 'Operate controls during the audit period and continuously collect evidence. ControlWeave automates evidence collection and alerts you when evidence is at risk of expiring.',
                  icon: <BarChart2 size={20} className="text-orange-600" />,
                },
                {
                  phase: 'Month 12–18',
                  title: 'SOC 2 Type 2 Audit',
                  description: 'Share audit-ready evidence packages with your auditor. ControlWeave generates formatted evidence exports directly from your control library.',
                  icon: <CheckCircle size={20} className="text-green-600" />,
                },
              ].map((step, i) => (
                <div key={i} className="flex gap-6">
                  <div className="flex-shrink-0 w-10 h-10 bg-gray-100 rounded-xl flex items-center justify-center">
                    {step.icon}
                  </div>
                  <div>
                    <div className="text-sm font-bold text-purple-600 mb-1">{step.phase}</div>
                    <div className="text-lg font-semibold text-gray-900 mb-1">{step.title}</div>
                    <div className="text-gray-600 text-sm leading-relaxed">{step.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Start Your SOC 2 Journey Today</h2>
            <p className="text-purple-100 text-lg mb-8">
              Automate evidence collection and pass your SOC 2 Type 2 audit faster. Free tier available — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="bg-white text-purple-700 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-purple-50 transition-colors">
                Start Free Trial
              </Link>
              <Link href="/contact" className="border-2 border-white text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/10 transition-colors">
                Book Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Related */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <RelatedArticles articles={relatedArticles} />
          </div>
        </section>
      </div>
    </>
  );
}
