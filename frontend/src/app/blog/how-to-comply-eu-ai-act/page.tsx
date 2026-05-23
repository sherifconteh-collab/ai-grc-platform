import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CheckCircle, Clock } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'How to Comply with EU AI Act: Step-by-Step Guide (2025-2027)',
  description: 'Step-by-step guide to EU AI Act compliance. Risk classification, documentation requirements, prEN 18286, and timeline. Get compliant before deadlines.',
  keywords: [
    'how to comply with EU AI Act',
    'EU AI Act compliance',
    'EU AI Act 2026',
    'EU AI Act high-risk AI',
    'prEN 18286',
    'EU AI Act Article 17',
    'AI compliance',
    'compliance automation',
  ],
  alternates: {
    canonical: 'https://controlweave.com/blog/how-to-comply-eu-ai-act',
  },
  openGraph: {
    title: 'How to Comply with EU AI Act: Step-by-Step Guide (2025-2027)',
    description: 'Step-by-step guide to EU AI Act compliance. Risk classification, documentation requirements, prEN 18286, and timeline. Get compliant before deadlines.',
    url: 'https://controlweave.com/blog/how-to-comply-eu-ai-act',
    type: 'article',
  },
};

const relatedArticles = [
  {
    title: 'EU AI Act Compliance Platform',
    href: '/frameworks/eu-ai-act',
    description: 'Complete EU AI Act compliance for high-risk AI systems, including Article 17 quality management and prEN 18286.',
  },
  {
    title: 'How to Comply with EU AI Act Article 17',
    href: '/blog/how-to-comply-eu-ai-act-article-17',
    description: 'Complete guide to EU AI Act Article 17 compliance for high-risk AI systems, including prEN 18286 implementation.',
  },
  {
    title: 'AI Governance Platform: Complete Guide',
    href: '/blog/ai-governance-platform-guide',
    description: 'What is an AI governance platform? Learn about frameworks, features, and how to choose the right solution.',
  },
];

export default function HowToComplyEUAiActPage() {
  return (
    <>
      <Schema
        type="article"
        headline="How to Comply with EU AI Act: Complete Implementation Guide"
        description="Step-by-step guide to EU AI Act compliance. Risk classification, documentation requirements, prEN 18286, and timeline. Get compliant before deadlines."
        datePublished="2025-02-13"
        url="https://controlweave.com/blog/how-to-comply-eu-ai-act"
      />
      <div className="min-h-screen bg-white text-gray-900">
        {/* Nav */}
        <nav className="border-b border-gray-100 bg-white sticky top-0 z-10">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
            <Link href="/" className="flex items-center gap-2 font-bold text-gray-900 text-lg">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/branding/controlweave-emblem.svg" alt="ControlWeave" className="h-8 w-8" />
              ControlWeave
            </Link>
            <div className="flex items-center gap-4">
              <Link href="/frameworks/eu-ai-act" className="text-sm text-gray-600 hover:text-purple-600">EU AI Act</Link>
              <Link href="/register" className="text-sm bg-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-purple-700 transition-colors">
                Start Free Trial
              </Link>
            </div>
          </div>
        </nav>

        <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12">
          <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: 'How to Comply with EU AI Act' }]} />

          <header className="mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
              EU AI Act · Implementation Guide
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              How to Comply with EU AI Act: Complete Implementation Guide
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
              <span>By <strong className="text-gray-700">Jaja Conteh</strong></span>
              <span>·</span>
              <time dateTime="2025-02-13">February 13, 2025</time>
              <span>·</span>
              <span>13 min read</span>
            </div>
            <p className="text-xl text-gray-600 leading-relaxed">
              EU AI Act compliance is mandatory for organizations deploying high-risk AI systems that affect people in the EU. This step-by-step guide explains how to comply with the EU AI Act — from risk classification through documentation, prEN 18286 implementation, and ongoing compliance monitoring.
            </p>
          </header>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. EU AI Act Overview</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              The EU AI Act (Regulation (EU) 2024/1689) is the world&apos;s first comprehensive legal framework for artificial intelligence. It establishes a risk-based regulatory approach — requiring the most stringent compliance obligations for AI systems that pose the greatest risk, while leaving lower-risk AI largely unregulated.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              The EU AI Act applies to any organization that provides, deploys, imports, distributes, or uses AI systems that affect people in the EU — regardless of where the organization is headquartered. This means US, UK, and Asian organizations deploying AI in European markets must achieve EU AI Act compliance just as European organizations do.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Non-compliance penalties are significant: up to €30 million or 6% of global annual turnover for the most serious violations. More practically, organizations without documented EU AI Act compliance will find themselves unable to win enterprise contracts in Europe — where procurement teams are already requiring EU AI Act compliance evidence.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. EU AI Act Timeline and Deadlines</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              The EU AI Act implements its requirements in phases. Understanding the timeline is critical for prioritizing your compliance efforts:
            </p>
            <div className="space-y-4 mb-6">
              {[
                {
                  date: 'August 2024',
                  status: 'completed',
                  title: 'EU AI Act entered into force',
                  description: 'The regulation became legally binding. The countdown to compliance deadlines began.',
                },
                {
                  date: 'February 2025',
                  status: 'completed',
                  title: 'Prohibited AI practices banned (Article 5)',
                  description: 'AI systems that pose unacceptable risks — including social scoring systems, real-time biometric surveillance in public spaces, and AI that exploits human vulnerabilities — became prohibited. Any organization operating these systems must have ceased immediately.',
                },
                {
                  date: 'August 2025',
                  status: 'upcoming',
                  title: 'GPAI model obligations (Article 51-56)',
                  description: 'General-purpose AI model providers (like foundation model developers) must comply with transparency and safety obligations. Organizations using GPAI models must ensure their providers are compliant.',
                },
                {
                  date: 'August 2026',
                  status: 'critical',
                  title: 'High-risk AI requirements (Articles 9-17)',
                  description: 'The most significant deadline for most organizations. High-risk AI systems must comply with all Articles 9-17 obligations — including risk management, data governance, technical documentation, AI decision logging, human oversight, and Article 17 quality management (prEN 18286).',
                },
                {
                  date: 'August 2027',
                  status: 'future',
                  title: 'Full enforcement',
                  description: 'Remaining provisions including high-risk AI systems already in service before August 2026 must be brought into compliance.',
                },
              ].map((item) => (
                <div key={item.date} className={`flex gap-4 p-5 rounded-xl border ${item.status === 'critical' ? 'border-red-300 bg-red-50' : item.status === 'completed' ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${item.status === 'critical' ? 'bg-red-500' : item.status === 'completed' ? 'bg-green-500' : 'bg-gray-300'}`}>
                    {item.status === 'completed' ? (
                      <span className="text-white text-xs font-bold">✓</span>
                    ) : (
                      <Clock size={16} className="text-white" />
                    )}
                  </div>
                  <div>
                    <div className={`text-sm font-bold mb-1 ${item.status === 'critical' ? 'text-red-600' : item.status === 'completed' ? 'text-green-600' : 'text-gray-500'}`}>{item.date}</div>
                    <div className="font-semibold text-gray-900 mb-1">{item.title}</div>
                    <div className="text-sm text-gray-600 leading-relaxed">{item.description}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-amber-50 border border-amber-300 rounded-xl p-4">
              <p className="text-amber-800 text-sm font-medium">
                ⚠️ With the August 2026 deadline for high-risk AI requirements, organizations that delay their EU AI Act program have very little runway left for documentation, evidence collection, and system changes.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Step 1: EU AI Act Risk Classification</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              Before you can comply with EU AI Act, you must understand which of your AI systems fall into which risk category. The EU AI Act uses four risk tiers, and your compliance obligations depend entirely on where your AI systems land:
            </p>
            <div className="space-y-4 mb-6">
              {[
                { tier: 'Prohibited (Banned)', color: 'border-red-300 bg-red-50 text-red-700', description: 'AI systems banned under Article 5. These cannot be deployed in the EU. Deadline: February 2025 (already in effect).' },
                { tier: 'High-Risk', color: 'border-orange-300 bg-orange-50 text-orange-700', description: 'AI in Annex III domains (employment, education, law enforcement, critical infrastructure, etc.). Full Articles 9-17 compliance required. Deadline: August 2026.' },
                { tier: 'Limited Risk', color: 'border-yellow-300 bg-yellow-50 text-yellow-700', description: 'Chatbots, deepfake generators, and certain emotion recognition systems. Transparency and disclosure obligations only.' },
                { tier: 'Minimal Risk', color: 'border-green-300 bg-green-50 text-green-700', description: 'Spam filters, AI in video games, recommendation engines. No mandatory EU AI Act requirements.' },
              ].map((tier) => (
                <div key={tier.tier} className={`rounded-xl border p-4 ${tier.color.split(' ')[0]} ${tier.color.split(' ')[1]}`}>
                  <div className={`font-bold text-sm mb-1 ${tier.color.split(' ')[2]}`}>{tier.tier}</div>
                  <p className="text-gray-700 text-sm leading-relaxed">{tier.description}</p>
                </div>
              ))}
            </div>
            <p className="text-gray-600 leading-relaxed mb-4">
              The most common mistake organizations make in EU AI Act risk classification is underestimating their high-risk AI scope. Annex III is deliberately broad, and many AI systems that organizations consider "internal tools" (HR analytics, credit risk models, customer service AI) fall within high-risk categories.
            </p>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-4">
              <p className="text-sm text-purple-800">
                Use our <Link href="/frameworks/eu-ai-act" className="font-semibold underline hover:no-underline">interactive risk classification tool</Link> to classify each of your AI systems against EU AI Act Annex III criteria.
              </p>
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. Step 2: Documentation Requirements</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              High-risk AI systems require extensive documentation under the EU AI Act. Article 11 requires providers to maintain technical documentation that demonstrates compliance with all applicable requirements. This documentation must be kept up-to-date and available to national authorities on request.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Article 11 technical documentation must cover the following:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
              {[
                'General description of the AI system and its intended purpose',
                'System design specifications and architecture',
                'Training, validation, and testing datasets used',
                'Performance metrics and testing results',
                'Known risks and mitigation measures',
                'Changes made to the system over its lifecycle',
                'Post-market monitoring plan (Article 72)',
                'EU Declaration of Conformity (Article 47)',
              ].map((item) => (
                <div key={item} className="flex items-start gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50">
                  <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-sm text-gray-700">{item}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-600 leading-relaxed">
              ControlWeave generates and maintains Article 11 technical documentation automatically — linking evidence artifacts, assessment results, and control implementations to create a continuously updated compliance record that is always ready for regulatory inspection.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Step 3: prEN 18286 Implementation</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              prEN 18286 is the European pre-normative standard developed to support implementation of EU AI Act Article 17 quality management requirements. Implementing prEN 18286 is the most effective way to demonstrate compliance with Article 17 — and organizations that implement it now will have a significant advantage when it achieves harmonized standard status.
            </p>
            <div className="bg-gray-900 text-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold mb-4">prEN 18286 Implementation Checklist</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  'Quality Management Policy documented',
                  'AI system quality objectives defined',
                  'Design and development procedures documented',
                  'Data governance procedures implemented',
                  'Compliance monitoring schedules established',
                  'Post-market surveillance system operational',
                  'Incident reporting procedures documented',
                  'Corrective action tracking in place',
                  'Record retention policy defined',
                  'Internal audit schedule established',
                ].map((item) => (
                  <div key={item} className="flex items-center gap-2 text-sm">
                    <span className="w-4 h-4 border border-gray-600 rounded flex-shrink-0"></span>
                    <span className="text-gray-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <p className="text-gray-600 leading-relaxed">
              ControlWeave includes built-in prEN 18286-aligned templates and workflows, which can reduce the effort required to stand up Article 17 quality management from scratch. <Link href="/blog/how-to-comply-eu-ai-act-article-17" className="text-purple-600 hover:underline font-medium">Read our complete Article 17 implementation guide →</Link>
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Step 4: Ongoing EU AI Act Compliance</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              EU AI Act compliance is not a one-time certification — it is an ongoing program that must be maintained throughout the AI system lifecycle. Key ongoing compliance obligations include:
            </p>
            <div className="space-y-3 mb-6">
              {[
                { title: 'Post-market monitoring', desc: 'Continuously monitor AI system performance against the metrics defined in your Article 72 post-market monitoring plan. Report serious incidents to national authorities within 15 days (Article 73).' },
                { title: 'Evidence freshness maintenance', desc: 'EU AI Act compliance evidence expires. Evidence linking to specific model versions, data sets, and testing results must be updated when systems change. Automate evidence freshness tracking to avoid compliance gaps.' },
                { title: 'Change management triggers', desc: 'Significant changes to AI systems — including retraining, architecture changes, or new deployment contexts — may trigger reassessment of risk classification and compliance obligations. Document and assess all material changes.' },
                { title: 'Supply chain monitoring', desc: 'Article 25 requires deployers to monitor their AI providers\' compliance. If you use third-party AI systems, you need evidence of their EU AI Act compliance — and processes for responding when that compliance changes.' },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 p-5 rounded-xl border border-gray-200">
                  <ShieldCheck size={18} className="text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. How ControlWeave Helps with EU AI Act Compliance</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              ControlWeave provides end-to-end EU AI Act compliance automation — from initial risk classification through Article 17 quality management, AI decision logging, and ongoing compliance monitoring.
            </p>
            <div className="space-y-3 mb-6">
              {[
                'Interactive EU AI Act risk classification tool',
                'Pre-built controls for all Articles 9-17 requirements',
                'Built-in Article 17 / prEN 18286 quality management templates',
                'Automated AI decision logging for Article 12 compliance',
                'Evidence freshness scoring with expiration alerts',
                'Post-market surveillance tracking with automated alerts',
                'Audit-ready documentation generation',
                'Crosswalk to NIST AI RMF and ISO 42001',
              ].map((item) => (
                <div key={item} className="flex items-center gap-3">
                  <CheckCircle size={16} className="text-green-500 flex-shrink-0" />
                  <span className="text-gray-700 text-sm">{item}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors text-center">
                Start Free Trial
              </Link>
              <Link href="/frameworks/eu-ai-act" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors text-center">
                Explore EU AI Act Platform
              </Link>
            </div>
          </section>

          <section className="bg-blue-50 border border-blue-200 rounded-2xl p-8 mb-12">
            <h2 className="text-xl font-bold text-gray-900 mb-3">EU AI Act Compliance — Start Now</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              With the August 2026 deadline for high-risk AI requirements, the time to start EU AI Act compliance is now rather than at the last minute. Organizations that begin their risk classification, documentation, and quality management implementation early preserve the best chance of reaching the deadline cleanly.
            </p>
            <p className="text-gray-700 leading-relaxed">
              Organizations that wait until 2026 will find themselves competing for limited AI governance consulting resources, compressing implementation timelines, and accepting compliance risk that could have been avoided. The cost of proactive compliance is a fraction of the cost of reactive remediation — or regulatory enforcement.
            </p>
          </section>

          <RelatedArticles articles={relatedArticles} />
        </article>
      </div>
    </>
  );
}
