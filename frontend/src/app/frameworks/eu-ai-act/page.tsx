import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, AlertTriangle, CheckCircle, Clock, BookOpen, ArrowRight } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import RiskClassificationTool from '@/components/RiskClassificationTool';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'EU AI Act Compliance Software | High-Risk AI Systems Governance',
  description: 'Complete EU AI Act compliance platform. Risk classification, Article 17 quality management (prEN 18286), human oversight, and bias testing. Get compliant before 2027.',
  keywords: [
    'EU AI Act compliance',
    'EU AI Act Article 17',
    'prEN 18286',
    'high-risk AI compliance',
    'AI governance platform',
    'EU AI Act software',
    'quality management AI systems',
    'AI decision logging',
    'EU AI Act 2026',
  ],
  alternates: {
    canonical: 'https://controlweave.com/frameworks/eu-ai-act',
  },
  openGraph: {
    title: 'EU AI Act Compliance Software | High-Risk AI Systems Governance',
    description: 'Complete EU AI Act compliance platform. Risk classification, Article 17 quality management (prEN 18286), human oversight, and bias testing. Get compliant before 2027.',
    url: 'https://controlweave.com/frameworks/eu-ai-act',
  },
};

const articleRequirements = [
  {
    id: 'article-9',
    title: 'Article 9: Risk Management System',
    description: 'Establish and maintain a continuous risk management system throughout the AI system lifecycle. ControlWeave provides structured risk registers, automated risk scoring, and audit-ready documentation that satisfies Article 9 requirements.',
    icon: <AlertTriangle size={20} className="text-orange-600" />,
    color: 'border-orange-200 bg-orange-50',
  },
  {
    id: 'article-10',
    title: 'Article 10: Data Governance',
    description: 'Implement data governance practices including training data examination, bias detection, and data quality management. ControlWeave\'s CMDB tracks data assets with SBOM support, linking directly to AI governance controls.',
    icon: <ShieldCheck size={20} className="text-blue-600" />,
    color: 'border-blue-200 bg-blue-50',
  },
  {
    id: 'article-11',
    title: 'Article 11: Technical Documentation',
    description: 'Maintain comprehensive technical documentation including system purpose, architecture, training data, and performance metrics. ControlWeave generates and maintains audit-ready technical documentation automatically.',
    icon: <BookOpen size={20} className="text-indigo-600" />,
    color: 'border-indigo-200 bg-indigo-50',
  },
  {
    id: 'article-12',
    title: 'Article 12: Record-Keeping & AI Decision Logging',
    description: 'Log AI decisions automatically to ensure traceability. This is a core ControlWeave differentiator — our AI decision logging captures inputs, outputs, model versions, and human oversight events in an immutable audit trail.',
    icon: <CheckCircle size={20} className="text-green-600" />,
    color: 'border-green-200 bg-green-50',
    highlight: true,
  },
  {
    id: 'article-13',
    title: 'Article 13: Transparency & Explainability',
    description: 'Provide clear information to deployers and users about the AI system\'s capabilities, limitations, and decision logic. ControlWeave\'s transparency templates and control library map directly to Article 13 obligations.',
    icon: <CheckCircle size={20} className="text-teal-600" />,
    color: 'border-teal-200 bg-teal-50',
  },
  {
    id: 'article-14',
    title: 'Article 14: Human Oversight',
    description: 'Design AI systems with effective human oversight mechanisms. ControlWeave tracks human review workflows, override capabilities, and oversight evidence — giving auditors proof that humans remain in control.',
    icon: <ShieldCheck size={20} className="text-purple-600" />,
    color: 'border-purple-200 bg-purple-50',
  },
  {
    id: 'article-15',
    title: 'Article 15: Accuracy, Robustness, Cybersecurity',
    description: 'Demonstrate AI system accuracy, resilience to adversarial inputs, and cybersecurity measures. ControlWeave integrates vulnerability tracking with CVSS scoring directly into your AI governance program.',
    icon: <ShieldCheck size={20} className="text-red-600" />,
    color: 'border-red-200 bg-red-50',
  },
];

const relatedArticles = [
  {
    title: 'How to Comply with EU AI Act Article 17',
    href: '/blog/how-to-comply-eu-ai-act-article-17',
    description: 'Complete guide to EU AI Act Article 17 compliance for high-risk AI systems, including prEN 18286 implementation.',
  },
  {
    title: 'NIST AI RMF Compliance Platform',
    href: '/frameworks/nist-ai-rmf',
    description: 'Implement the NIST AI Risk Management Framework with Govern, Map, Measure, and Manage functions.',
  },
  {
    title: 'How to Comply with EU AI Act: Step-by-Step Guide',
    href: '/blog/how-to-comply-eu-ai-act',
    description: 'Step-by-step guide to EU AI Act compliance with risk classification, documentation requirements, and timeline.',
  },
];

export default function EUAiActPage() {
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
              <Link href="/frameworks/nist-ai-rmf" className="text-sm text-gray-600 hover:text-purple-600">NIST AI RMF</Link>
              <Link href="/frameworks/soc-2" className="text-sm text-gray-600 hover:text-purple-600">SOC 2</Link>
              <Link href="/register" className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </nav>

        {/* Hero */}
        <section className="bg-gradient-to-b from-blue-50 to-white py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <Breadcrumbs items={[{ label: 'Frameworks', href: '/frameworks' }, { label: 'EU AI Act' }]} />
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
              <ShieldCheck size={14} />
              EU AI Act — High-Risk AI Systems
            </div>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 mb-6">
              EU AI Act Compliance Platform
            </h1>
            <p className="text-xl text-gray-600 mb-8 leading-relaxed">
              Complete EU AI Act compliance for high-risk AI systems. Automate risk classification, Article 17 quality management (prEN 18286), AI decision logging, and human oversight — all in one evidence-based compliance platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="bg-purple-600 text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-purple-700 transition-colors text-center">
                Start Free Trial
              </Link>
              <Link href="/contact" className="border border-gray-300 text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors text-center">
                Book Enterprise Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Overview */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">Overview of the EU AI Act</h2>
            <div className="prose prose-gray max-w-none">
              <p className="text-gray-600 leading-relaxed mb-4">
                The EU AI Act (Regulation (EU) 2024/1689) is the world&apos;s first comprehensive legal framework for artificial intelligence. Published in the Official Journal of the European Union on July 12, 2024, it entered into force on August 1, 2024, establishing a risk-based approach to AI governance across the European Union.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                The regulation applies to AI system providers and deployers whose systems affect people in the EU — regardless of where the provider is based. This means any organization operating AI systems that impact EU residents must achieve EU AI Act compliance, including US-headquartered companies deploying AI in European markets.
              </p>
              <p className="text-gray-600 leading-relaxed mb-4">
                The EU AI Act classifies AI systems into four risk categories: prohibited, high-risk, limited risk, and minimal risk. High-risk AI systems — which include AI in employment, critical infrastructure, law enforcement, education, and financial services — carry the most extensive compliance obligations, including requirements for risk management, data governance, technical documentation, AI decision logging, human oversight, and quality management under Article 17.
              </p>
              <p className="text-gray-600 leading-relaxed">
                Non-compliance with EU AI Act provisions for high-risk AI systems can result in fines of up to €30 million or 6% of global annual turnover — whichever is higher. Organizations that deploy AI in Europe must begin their compliance journey now to meet the August 2026 deadline for high-risk AI system requirements.
              </p>
            </div>
          </div>
        </section>

        {/* Risk Classification */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Risk Classification Tool</h2>
            <p className="text-gray-600 mb-10">
              Identify your AI system&apos;s EU AI Act risk category with our interactive classification tool. Understanding your risk level determines which compliance obligations apply to your organization.
            </p>
            <RiskClassificationTool />
          </div>
        </section>

        {/* Requirements for High-Risk AI */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Requirements for High-Risk AI Systems</h2>
            <p className="text-gray-600 mb-10">
              High-risk AI systems under EU AI Act Annex III must comply with Articles 9–17. ControlWeave maps each article to automated controls, evidence collection, and audit-ready documentation — so you can prove compliance, not just claim it.
            </p>
            <div className="space-y-6">
              {articleRequirements.map((article) => (
                <div key={article.id} className={`rounded-xl border p-6 ${article.color}`}>
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 mt-0.5">{article.icon}</div>
                    <div>
                      <h3 className="text-lg font-bold text-gray-900 mb-2">{article.title}</h3>
                      <p className="text-gray-700 text-sm leading-relaxed">{article.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Article 17 Deep Dive */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-purple-950 text-white">
          <div className="max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-purple-800 text-purple-200 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
              ⭐ Competitive Advantage
            </div>
            <h2 className="text-3xl font-bold text-white mb-4">Article 17: Quality Management System</h2>
            <p className="text-purple-200 text-lg leading-relaxed mb-8">
              Article 17 requires providers of high-risk AI systems to establish a quality management system. ControlWeave includes built-in Article 17 and prEN 18286-aligned templates, workflows, and evidence tracking so teams do not have to assemble the process manually.
            </p>

            <div className="bg-purple-900 rounded-2xl p-8 mb-8 border border-purple-700">
              <h3 className="text-xl font-bold text-white mb-4">What Article 17 Requires</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  'Quality management policies and procedures',
                  'Compliance monitoring procedures',
                  'Post-market monitoring system',
                  'Incident reporting and corrective actions',
                  'Data management and record-keeping',
                  'Cybersecurity measures documentation',
                ].map((req) => (
                  <div key={req} className="flex items-start gap-3">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✓</span>
                    <span className="text-purple-100 text-sm">{req}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-purple-900 rounded-2xl p-8 mb-8 border border-purple-700">
              <h3 className="text-xl font-bold text-white mb-3">The prEN 18286 Standard</h3>
              <p className="text-purple-200 text-sm leading-relaxed mb-4">
                The European Union created prEN 18286 as a harmonized standard to help organizations implement Article 17 requirements. Think of it as the &quot;how-to manual&quot; for Article 17 compliance — providing specific, auditable criteria for quality management systems in AI providers.
              </p>
              <p className="text-purple-200 text-sm leading-relaxed">
                While prEN 18286 is still in draft (pre-normative) status, compliance with it is expected to satisfy Article 17 obligations when it achieves harmonized standard status. Organizations that implement prEN 18286 now will have a significant head start when the August 2026 deadline arrives.
              </p>
            </div>

            <div className="bg-gradient-to-r from-purple-800 to-indigo-800 rounded-2xl p-8 border border-purple-600">
              <h3 className="text-xl font-bold text-white mb-4">Why ControlWeave is Different</h3>
              <p className="text-purple-100 text-sm leading-relaxed mb-6">
                ControlWeave includes built-in prEN 18286-aligned workflows and evidence automation. Instead of relying on generic spreadsheets or manual process documents, teams can use:
              </p>
              <div className="space-y-3 mb-6">
                {[
                  'Quality management templates (prEN 18286 compliant)',
                  'Compliance monitoring dashboards with real-time evidence scoring',
                  'Post-market surveillance tracking with automated alerts',
                  'Automated incident reporting workflows with corrective action tracking',
                  'Audit-ready documentation generated automatically',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✅</span>
                    <span className="text-purple-100 text-sm">{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-purple-200 text-sm font-medium mb-6">
                This helps teams stand up Article 17 quality management faster and with cleaner audit evidence.
              </p>
              <Link
                href="/contact"
                className="inline-flex items-center gap-2 bg-white text-purple-700 px-6 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors"
              >
                Book Enterprise Demo for Article 17 / prEN 18286
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </section>

        {/* Compliance Timeline */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-10">EU AI Act Compliance Timeline</h2>
            <div className="relative">
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-purple-200"></div>
              <div className="space-y-8">
                {[
                  {
                    date: 'August 2024',
                    event: 'EU AI Act entered into force',
                    status: 'completed',
                    description: 'Regulation (EU) 2024/1689 published in the Official Journal and entered into force.',
                  },
                  {
                    date: 'February 2025',
                    event: 'Prohibited AI practices ban (Article 5)',
                    status: 'completed',
                    description: 'Prohibited AI practices — including social scoring systems and real-time biometric surveillance — banned across the EU.',
                  },
                  {
                    date: 'August 2026',
                    event: 'High-risk AI requirements (Articles 9–17)',
                    status: 'upcoming',
                    description: 'Full compliance required for high-risk AI systems including risk management, data governance, AI decision logging, human oversight, and Article 17 quality management (prEN 18286).',
                  },
                  {
                    date: 'August 2027',
                    event: 'Full enforcement',
                    status: 'future',
                    description: 'Complete EU AI Act enforcement including all remaining provisions. All AI systems in scope must be fully compliant.',
                  },
                ].map((item) => (
                  <div key={item.date} className="flex gap-6">
                    <div className={`relative flex-shrink-0 w-12 h-12 rounded-full border-4 flex items-center justify-center z-10 ${
                      item.status === 'completed' ? 'bg-green-500 border-green-300' :
                      item.status === 'upcoming' ? 'bg-purple-600 border-purple-300' :
                      'bg-gray-200 border-gray-100'
                    }`}>
                      {item.status === 'completed' ? (
                        <span className="text-white text-xs font-bold">✓</span>
                      ) : (
                        <Clock size={16} className={item.status === 'upcoming' ? 'text-white' : 'text-gray-500'} />
                      )}
                    </div>
                    <div className="pt-2 pb-4">
                      <div className="text-sm font-bold text-purple-600 mb-1">{item.date}</div>
                      <div className="text-lg font-semibold text-gray-900 mb-1">{item.event}</div>
                      <div className="text-gray-600 text-sm leading-relaxed">{item.description}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Full Coverage */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-3xl font-bold text-gray-900 mb-6">How ControlWeave Provides Full EU AI Act Coverage</h2>
            <p className="text-gray-600 mb-10 leading-relaxed">
              ControlWeave&apos;s AI governance platform maps every EU AI Act obligation to automated controls, evidence collection workflows, and audit-ready documentation. Our evidence-based compliance approach means you can prove EU AI Act compliance — not just assert it.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {[
                {
                  title: 'AI Decision Logging',
                  description: 'Automatically capture AI inputs, outputs, model versions, confidence scores, and human oversight events — satisfying Article 12 record-keeping requirements.',
                },
                {
                  title: 'Real-Time AI Monitoring',
                  description: 'Continuous AI system monitoring with configurable rules, anomaly detection, and bias detection. Live event stream with automated human review workflows — directly satisfying Article 14 human oversight obligations.',
                },
                {
                  title: 'Risk Management Workflows',
                  description: 'Structured risk registers and automated risk scoring for continuous risk management throughout the AI system lifecycle (Article 9).',
                },
                {
                  title: 'Quality Management (Article 17)',
                  description: 'Built-in prEN 18286-aligned templates, compliance monitoring dashboards, and post-market surveillance workflows for Article 17 programs.',
                },
                {
                  title: 'Human Oversight Tracking',
                  description: 'Document and evidence human review workflows, override capabilities, and oversight events — giving auditors proof of Article 14 compliance.',
                },
                {
                  title: 'Predictive Risk Intelligence',
                  description: 'Multi-factor risk scoring with 30/60/90-day forecasting, AI-powered regulatory impact analysis, and smart remediation plans to stay ahead of compliance deadlines.',
                },
                {
                  title: 'Technical Documentation',
                  description: 'Automatically maintain system documentation including architecture, training data, performance metrics, and accuracy testing (Articles 11, 15).',
                },
                {
                  title: 'NIST AI RMF & ISO 42001 Crosswalk',
                  description: 'Crosswalk EU AI Act controls to NIST AI RMF and ISO 42001 simultaneously — implement once, satisfy all three frameworks.', // ip-hygiene:ignore
                },
              ].map((item) => (
                <div key={item.title} className="bg-white rounded-xl border border-gray-200 p-6 hover:border-purple-300 transition-colors">
                  <h3 className="text-base font-bold text-gray-900 mb-2">{item.title}</h3>
                  <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Get Compliant Before August 2026</h2>
            <p className="text-purple-100 text-lg mb-8">
              Start your EU AI Act compliance journey today. Free tier available — no credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link href="/register" className="bg-white text-purple-700 px-8 py-4 rounded-xl text-lg font-semibold hover:bg-purple-50 transition-colors">
                Start Free Trial
              </Link>
              <Link href="/contact" className="border-2 border-white text-white px-8 py-4 rounded-xl text-lg font-semibold hover:bg-white/10 transition-colors">
                Book Enterprise Demo
              </Link>
            </div>
          </div>
        </section>

        {/* Related Articles */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <RelatedArticles articles={relatedArticles} />
          </div>
        </section>
      </div>
    </>
  );
}
