import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, BarChart2, Map, Settings, GitMerge } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'NIST AI RMF Compliance Software | AI Risk Management Framework Tool',
  description: 'Implement NIST AI Risk Management Framework with ControlWeave. Track Govern, Map, Measure, Manage functions. Automated evidence collection and AI decision logging.',
  keywords: [
    'NIST AI RMF',
    'NIST AI RMF compliance',
    'AI risk management framework',
    'AI governance platform',
    'AI decision logging',
    'NIST AI RMF tool',
    'AI governance software',
    'compliance automation',
    'evidence-based compliance',
  ],
  alternates: {
    canonical: 'https://controlweave.com/frameworks/nist-ai-rmf',
  },
  openGraph: {
    title: 'NIST AI RMF Compliance Software | AI Risk Management Framework Tool',
    description: 'Implement NIST AI Risk Management Framework with ControlWeave. Track Govern, Map, Measure, Manage functions. Automated evidence collection and AI decision logging.',
    url: 'https://controlweave.com/frameworks/nist-ai-rmf',
  },
};

const functions = [
  {
    id: 'govern',
    name: 'GOVERN',
    color: 'bg-purple-600',
    lightColor: 'bg-purple-50 border-purple-200',
    textColor: 'text-purple-700',
    icon: <ShieldCheck size={24} />,
    description: 'Establish and maintain organizational culture, policies, processes, and structures for AI risk management.',
    howControlWeaveHelps: 'ControlWeave maps your AI governance policies to GOVERN function subcategories, tracking control implementation and evidence across your entire AI portfolio. Automated gap analysis identifies missing governance controls before your next assessment.',
    subcategories: [
      'GV.OC: Organizational Context',
      'GV.RM: Risk Management Strategy',
      'GV.RR: Roles, Responsibilities, and Authorities',
      'GV.PO: Policies, Processes, and Procedures',
      'GV.OV: Oversight',
      'GV.SC: Supply Chain Risk Management',
    ],
  },
  {
    id: 'map',
    name: 'MAP',
    color: 'bg-blue-600',
    lightColor: 'bg-blue-50 border-blue-200',
    textColor: 'text-blue-700',
    icon: <Map size={24} />,
    description: 'Categorize and identify context, risk exposure, and potential impacts of AI systems throughout the organization.',
    howControlWeaveHelps: 'ControlWeave\'s CMDB tracks every AI agent, model, and environment with AIBOM support. Each asset is mapped to its applicable NIST AI RMF MAP subcategories, making context documentation automatic and audit-ready.',
    subcategories: [
      'MP.AA: AI System Asset Identification',
      'MP.ID: Impact Assessment',
      'MP.PO: Policies, Processes, and Procedures',
      'MP.TR: Third-Party Risk',
    ],
  },
  {
    id: 'measure',
    name: 'MEASURE',
    color: 'bg-green-600',
    lightColor: 'bg-green-50 border-green-200',
    textColor: 'text-green-700',
    icon: <BarChart2 size={24} />,
    description: 'Analyze and assess AI risks using quantitative and qualitative methods to evaluate effectiveness of risk controls.',
    howControlWeaveHelps: 'ControlWeave\'s evidence scoring engine automatically rates control health and freshness, providing real-time metrics for MEASURE function reporting. AI gap analysis identifies where evidence is weak or missing before your auditor does.',
    subcategories: [
      'MS.AI: AI Risk Measurement',
      'MS.EV: Evaluation and Testing',
      'MS.MC: Monitoring and Continuous Evaluation',
      'MS.PO: Policies, Processes, and Procedures',
    ],
  },
  {
    id: 'manage',
    name: 'MANAGE',
    color: 'bg-orange-600',
    lightColor: 'bg-orange-50 border-orange-200',
    textColor: 'text-orange-700',
    icon: <Settings size={24} />,
    description: 'Prioritize and implement risk responses, monitor ongoing AI risk, and adjust risk management practices based on new information.',
    howControlWeaveHelps: 'ControlWeave\'s POA&M (Plan of Action & Milestones) module manages risk response workflows, tracks remediation progress, and provides audit-ready evidence of MANAGE function activities. Real-time dashboards show risk posture at a glance.',
    subcategories: [
      'MG.AI: AI Risk Responses',
      'MG.TR: Third-Party Risk Management',
      'MG.PO: Policies, Processes, and Procedures',
      'MG.MO: Risk Monitoring',
    ],
  },
];

const relatedArticles = [
  {
    title: 'EU AI Act Compliance Platform',
    href: '/frameworks/eu-ai-act',
    description: 'Complete EU AI Act compliance for high-risk AI systems, including Article 17 quality management and prEN 18286.',
  },
  {
    title: 'AI Governance Platform: Complete Guide',
    href: '/blog/ai-governance-platform-guide',
    description: 'What is an AI governance platform? Learn about frameworks, features, and how to choose the right solution.',
  },
  {
    title: 'AI Decision Logging Best Practices',
    href: '/blog/ai-decision-logging-best-practices',
    description: 'Best practices for AI decision logging for compliance and governance, including what to log and how to structure data.',
  },
];

export default function NISTAiRMFPage() {
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
              <Link href="/frameworks/soc-2" className="text-sm text-gray-600 hover:text-purple-600">SOC 2</Link>
              <Link href="/register" className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="bg-gradient-to-b from-purple-50 to-white py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Breadcrumbs items={[{ label: 'Frameworks', href: '/frameworks' }, { label: 'NIST AI RMF' }]} />
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
              <ShieldCheck size={14} />
              NIST AI Risk Management Framework
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6">
              NIST AI RMF Compliance Platform
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Implement the NIST AI Risk Management Framework with automated evidence collection, AI decision logging, and compliance automation across all four functions: Govern, Map, Measure, and Manage.
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

        {/* Overview */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">What is NIST AI RMF?</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              The NIST Artificial Intelligence Risk Management Framework (AI RMF 1.0) is a voluntary guidance document published by the National Institute of Standards and Technology in January 2023. It provides organizations with a structured approach to managing AI risks throughout the AI system lifecycle — from design and development through deployment and ongoing monitoring.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Unlike prescriptive compliance frameworks, NIST AI RMF is flexible and adaptable, designed to work alongside existing risk management practices and other AI governance frameworks including the EU AI Act and ISO 42001. Organizations in US federal agencies, critical infrastructure, financial services, healthcare, and technology sectors increasingly use NIST AI RMF as the foundation for their AI governance programs.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              The framework is organized around four core functions — GOVERN, MAP, MEASURE, and MANAGE — each with subcategories that define specific practices for managing AI risks. Together, these functions create a comprehensive lifecycle approach to AI risk management and compliance automation.
            </p>
            <p className="text-gray-600 leading-relaxed">
              ControlWeave&apos;s NIST AI RMF compliance platform maps every subcategory to automated controls, evidence collection workflows, and AI decision logging — so your organization can demonstrate evidence-based compliance with NIST AI RMF at any time.
            </p>
          </div>
        </section>

        {/* Four Functions */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">The Four NIST AI RMF Functions</h2>
            <p className="text-gray-600 mb-10">
              ControlWeave implements all four NIST AI RMF functions with automated evidence collection, control tracking, and AI decision logging built in.
            </p>
            <div className="space-y-8">
              {functions.map((fn) => (
                <div key={fn.id} className={`rounded-2xl border p-8 ${fn.lightColor}`}>
                  <div className="flex items-start gap-4 mb-6">
                    <div className={`w-12 h-12 ${fn.color} rounded-xl flex items-center justify-center text-white flex-shrink-0`}>
                      {fn.icon}
                    </div>
                    <div>
                      <span className={`text-xs font-bold ${fn.textColor} uppercase tracking-wider`}>Function</span>
                      <h3 className="text-2xl font-bold text-gray-900">{fn.name}</h3>
                    </div>
                  </div>
                  <p className="text-gray-700 mb-6 leading-relaxed">{fn.description}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-6">
                    {fn.subcategories.map((sub) => (
                      <div key={sub} className="flex items-center gap-2 text-sm text-gray-600">
                        <span className={`w-1.5 h-1.5 rounded-full ${fn.color} flex-shrink-0`}></span>
                        {sub}
                      </div>
                    ))}
                  </div>
                  <div className="bg-white rounded-xl p-4 border border-gray-200">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">How ControlWeave Helps</p>
                    <p className="text-gray-700 text-sm leading-relaxed">{fn.howControlWeaveHelps}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Crosswalk */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="flex items-start gap-4 mb-6">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center text-purple-700 flex-shrink-0">
                <GitMerge size={24} />
              </div>
              <div>
                <h2 className="text-3xl font-bold text-gray-900">NIST AI RMF vs. EU AI Act vs. ISO 42001</h2>
                <p className="text-gray-600 mt-2">Implement once, satisfy all three AI governance frameworks simultaneously.</p>
              </div>
            </div>
            <p className="text-gray-600 leading-relaxed mb-8">
              ControlWeave&apos;s crosswalk intelligence automatically maps NIST AI RMF subcategories to equivalent EU AI Act articles and ISO 42001 controls. When you implement a control for NIST AI RMF, ControlWeave automatically satisfies the corresponding requirements in the other frameworks — eliminating duplicate work and reducing compliance automation costs.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-gray-200 rounded-xl overflow-hidden text-sm">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left px-4 py-3 font-semibold">NIST AI RMF</th>
                    <th className="text-left px-4 py-3 font-semibold">EU AI Act</th>
                    <th className="text-left px-4 py-3 font-semibold">ISO 42001</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { nist: 'GV.RM — Risk Management Strategy', eu: 'Article 9: Risk Management System', iso: 'Clause 6.1: Actions to Address Risks' },
                    { nist: 'MP.ID — Impact Assessment', eu: 'Article 9: Risk Management System', iso: 'Clause 8.4: AI Impact Assessment' },
                    { nist: 'MS.MC — Monitoring & Continuous Evaluation', eu: 'Article 12: Record-Keeping', iso: 'Clause 9.1: Monitoring & Measurement' },
                    { nist: 'MG.AI — AI Risk Responses', eu: 'Article 17: Quality Management', iso: 'Clause 10: Improvement' },
                    { nist: 'GV.OV — Oversight', eu: 'Article 14: Human Oversight', iso: 'Clause 5.1: Leadership' },
                  ].map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 text-purple-700 font-medium border-b border-gray-100">{row.nist}</td>
                      <td className="px-4 py-3 text-blue-700 border-b border-gray-100">{row.eu}</td>
                      <td className="px-4 py-3 text-green-700 border-b border-gray-100">{row.iso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Implement NIST AI RMF Today</h2>
            <p className="text-purple-100 text-lg mb-8">
              Start your NIST AI RMF compliance journey with automated evidence collection and AI decision logging. Free tier available.
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
