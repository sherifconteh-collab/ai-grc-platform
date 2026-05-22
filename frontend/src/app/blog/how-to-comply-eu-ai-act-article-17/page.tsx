import type { Metadata } from 'next';
import Link from 'next/link';
import { ShieldCheck, CheckCircle } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'How to Comply with EU AI Act Article 17: Quality Management Guide',
  description: 'Complete guide to EU AI Act Article 17 compliance for high-risk AI systems. Learn quality management requirements, prEN 18286 implementation, and best practices.',
  keywords: [
    'EU AI Act Article 17',
    'EU AI Act compliance',
    'Article 17 quality management',
    'prEN 18286',
    'high-risk AI compliance',
    'AI quality management system',
    'EU AI Act 2026',
    'compliance automation',
  ],
  alternates: {
    canonical: 'https://controlweave.com/blog/how-to-comply-eu-ai-act-article-17',
  },
  openGraph: {
    title: 'How to Comply with EU AI Act Article 17: Quality Management Guide',
    description: 'Complete guide to EU AI Act Article 17 compliance for high-risk AI systems. Learn quality management requirements, prEN 18286 implementation, and best practices.',
    url: 'https://controlweave.com/blog/how-to-comply-eu-ai-act-article-17',
    type: 'article',
  },
};

const relatedArticles = [
  {
    title: 'EU AI Act Compliance Platform',
    href: '/frameworks/eu-ai-act',
    description: 'Complete EU AI Act compliance platform with risk classification, Article 17 quality management, and AI decision logging.',
  },
  {
    title: 'How to Comply with EU AI Act: Step-by-Step Guide',
    href: '/blog/how-to-comply-eu-ai-act',
    description: 'Step-by-step guide to EU AI Act compliance with risk classification, documentation requirements, and timeline.',
  },
  {
    title: 'AI Decision Logging Best Practices',
    href: '/blog/ai-decision-logging-best-practices',
    description: 'Best practices for AI decision logging for governance and compliance, including what to log and how to structure data.',
  },
];

export default function HowToComplyEUAiActArticle17Page() {
  return (
    <>
      <Schema
        type="article"
        headline="How to Comply with EU AI Act Article 17: Quality Management for High-Risk AI"
        description="Complete guide to EU AI Act Article 17 compliance for high-risk AI systems. Learn quality management requirements, prEN 18286 implementation, and best practices."
        datePublished="2025-02-13"
        url="https://controlweave.com/blog/how-to-comply-eu-ai-act-article-17"
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
          <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: 'EU AI Act Article 17' }]} />

          {/* Header */}
          <header className="mb-12">
            <div className="inline-flex items-center gap-2 bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
              EU AI Act · Article 17
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              How to Comply with EU AI Act Article 17: Quality Management for High-Risk AI
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
              <span>By <strong className="text-gray-700">Jaja Conteh</strong></span>
              <span>·</span>
              <time dateTime="2025-02-13">February 13, 2025</time>
              <span>·</span>
              <span>12 min read</span>
            </div>
            <p className="text-xl text-gray-600 leading-relaxed">
              EU AI Act Article 17 requires providers of high-risk AI systems to establish and maintain a quality management system. This guide explains exactly what Article 17 requires, how the prEN 18286 standard helps implement it, and a step-by-step approach to achieving compliance before the August 2026 deadline.
            </p>
          </header>

          {/* Section 1 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. What is EU AI Act Article 17?</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              EU AI Act Article 17 establishes the quality management system requirements for providers of high-risk AI systems. It is one of the most operationally significant provisions in the EU AI Act — requiring organizations to put in place systematic, documented, and auditable processes for ensuring their AI systems remain compliant throughout their lifecycle.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Article 17 sits within Chapter III, Section 2 of the EU AI Act, which governs obligations for providers of high-risk AI systems. Unlike some provisions that apply at deployment, Article 17 quality management requirements must be in place <strong>before</strong> a high-risk AI system is placed on the EU market or put into service — meaning compliance preparation must begin well before the August 2026 deadline.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              The EU AI Act defines high-risk AI systems in Annex III as systems deployed in areas including employment, education, critical infrastructure, law enforcement, biometric identification, administration of justice, essential public services, and certain medical devices. If your organization uses AI in any of these domains and that AI affects people in the EU, EU AI Act Article 17 applies to you.
            </p>
            <p className="text-gray-600 leading-relaxed">
              Non-compliance with Article 17 can result in EU AI Act enforcement action, including fines of up to €15 million or 3% of global annual turnover (or up to €30 million / 6% for more serious violations). More importantly, organizations without documented quality management systems will struggle to demonstrate compliance during regulatory inspections — even if their AI systems perform correctly.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. What EU AI Act Article 17 Requires</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Article 17(1) specifies that providers of high-risk AI systems must establish, implement, document, and maintain a quality management system that covers all aspects of compliance with the EU AI Act. The quality management system must be documented in a systematic and orderly manner and include at minimum the following elements:
            </p>
            <div className="space-y-4 mb-6">
              {[
                {
                  title: 'Quality management policies and procedures',
                  description: 'Written policies and procedures that describe how the organization ensures EU AI Act compliance across the AI system lifecycle — from design through post-market monitoring.',
                },
                {
                  title: 'Techniques, procedures and systematic actions for system design',
                  description: 'Documented approaches for designing high-risk AI systems that comply with EU AI Act requirements, including data governance (Article 10) and accuracy/robustness standards (Article 15).',
                },
                {
                  title: 'Compliance monitoring procedures',
                  description: 'Systematic procedures for monitoring ongoing compliance with EU AI Act obligations, including regular internal reviews and assessments of whether quality management controls remain effective.',
                },
                {
                  title: 'Post-market monitoring system',
                  description: 'A systematic process for collecting, reviewing, and acting on information about the AI system\'s performance after it has been deployed — including incident detection, user feedback, and performance drift.',
                },
                {
                  title: 'Incident reporting and corrective actions',
                  description: 'Documented procedures for reporting serious incidents to national authorities as required under Article 73, and for implementing corrective actions to prevent recurrence.',
                },
                {
                  title: 'Data management and record-keeping',
                  description: 'Processes for maintaining records of quality management activities, including documentation of decisions, testing results, and evidence of compliance with other Article 17 requirements.',
                },
              ].map((item) => (
                <div key={item.title} className="flex gap-4 p-5 rounded-xl border border-gray-200 bg-gray-50">
                  <CheckCircle size={20} className="text-green-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-1">{item.title}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-gray-600 leading-relaxed">
              Article 17(2) further requires that the quality management system be proportionate to the size and nature of the provider&apos;s organization and the type of high-risk AI system being provided. This means that while the requirements are substantive, the EU AI Act does not mandate a one-size-fits-all approach — smaller organizations can implement scaled quality management systems that still meet the Article 17 obligations.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. Understanding prEN 18286</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              The prEN 18286 standard is a pre-normative European Standard being developed by CEN/CENELEC to support implementation of EU AI Act Article 17. Think of prEN 18286 as the technical &quot;how-to manual&quot; for Article 17 compliance — it translates the regulation&apos;s high-level requirements into specific, auditable criteria that organizations can implement and verify.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              The &quot;prEN&quot; prefix indicates this is currently a pre-normative draft, meaning it has not yet achieved the status of a published European Standard. However, once prEN 18286 is finalized and listed as a harmonized standard in the EU Official Journal, compliance with it will create a presumption of conformity with Article 17 — meaning that if you implement prEN 18286, regulators will presume your quality management system meets Article 17 requirements without requiring you to prove compliance separately.
            </p>
            <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-4">
              <h3 className="font-bold text-purple-900 mb-3">Why prEN 18286 Matters for Article 17 Compliance</h3>
              <ul className="space-y-2">
                {[
                  'Provides specific, auditable criteria for Article 17 quality management systems',
                  'Expected to create a presumption of conformity with Article 17 once harmonized',
                  'Reduces regulatory uncertainty by providing clear implementation requirements',
                  'Enables organizations to demonstrate EU AI Act compliance to notified bodies',
                  'Aligns with existing quality management standards (ISO 9001) for easier integration',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-purple-800">
                    <ShieldCheck size={16} className="mt-0.5 flex-shrink-0 text-purple-600" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Organizations that begin aligning to prEN 18286 before it achieves harmonized standard status can reduce implementation uncertainty later. Teams that wait for the final standard will have less time to operationalize Article 17 before applicable deadlines.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">4. Step-by-Step EU AI Act Article 17 Implementation Guide</h2>

            <div className="space-y-8">
              {[
                {
                  step: '01',
                  title: 'Step 1: Establish Quality Management Policies',
                  description: 'Begin by documenting your organization\'s AI quality management policies. These policies should articulate your commitment to EU AI Act compliance, define scope (which AI systems are covered), and establish accountability — identifying who owns quality management for each high-risk AI system.',
                  actions: [
                    'Document an AI Quality Management Policy signed by senior leadership',
                    'Define scope: identify all high-risk AI systems in scope of Article 17',
                    'Assign quality management ownership for each high-risk AI system',
                    'Map your existing quality management practices (ISO 9001 if applicable) to Article 17 requirements',
                    'Identify gaps between current practices and Article 17 obligations',
                  ],
                },
                {
                  step: '02',
                  title: 'Step 2: Set Up Compliance Monitoring Procedures',
                  description: 'Article 17 requires ongoing compliance monitoring — not just a point-in-time assessment. Your compliance monitoring program should include scheduled internal reviews, control effectiveness testing, and mechanisms for identifying when AI system changes might trigger new compliance obligations.',
                  actions: [
                    'Define monitoring frequency (at minimum quarterly for high-risk systems)',
                    'Create compliance checklists mapped to each Article 17 requirement',
                    'Establish a change management process that triggers EU AI Act reassessment',
                    'Implement automated evidence collection where possible (reduces manual burden)',
                    'Set up dashboards showing compliance posture in real time',
                  ],
                },
                {
                  step: '03',
                  title: 'Step 3: Implement Post-Market Surveillance',
                  description: 'Article 17(1)(e) requires providers to implement a post-market monitoring system — a systematic process for tracking AI system performance after deployment. This connects directly to Article 72\'s post-market monitoring plan requirements and must be documented and operationalized before deployment.',
                  actions: [
                    'Define performance metrics and thresholds for each high-risk AI system',
                    'Establish feedback mechanisms to collect data from deployers and users',
                    'Create procedures for reviewing AI decision logs for performance drift',
                    'Set up incident detection and classification procedures',
                    'Document escalation procedures for performance issues and incidents',
                  ],
                },
                {
                  step: '04',
                  title: 'Step 4: Create Incident Reporting Process',
                  description: 'Article 17 quality management must include documented incident reporting and corrective action procedures. Under Article 73, providers must report serious incidents and malfunctions to national market surveillance authorities. Your quality management system must have these reporting workflows documented, tested, and ready to execute.',
                  actions: [
                    'Define what constitutes a "serious incident" under EU AI Act Article 3(49)',
                    'Create incident reporting templates aligned to Article 73 requirements',
                    'Identify the competent national authority for each EU jurisdiction where you operate',
                    'Document timelines: Article 73 requires reporting within 15 days for serious incidents',
                    'Implement corrective action tracking to document remediation and prevent recurrence',
                  ],
                },
              ].map((step) => (
                <div key={step.step} className="rounded-2xl border border-gray-200 p-6">
                  <div className="text-4xl font-extrabold text-purple-100 mb-2">{step.step}</div>
                  <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                  <p className="text-gray-600 leading-relaxed mb-4">{step.description}</p>
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Key Actions</p>
                    <ul className="space-y-2">
                      {step.actions.map((action) => (
                        <li key={action} className="flex items-start gap-2 text-sm text-gray-700">
                          <CheckCircle size={14} className="text-green-500 mt-0.5 flex-shrink-0" />
                          {action}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Section 5 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Common Article 17 Implementation Challenges</h2>
            <div className="space-y-4">
              {[
                {
                  challenge: 'Defining "high-risk" scope correctly',
                  solution: 'Many organizations underestimate their EU AI Act high-risk AI scope. Use ControlWeave\'s risk classification tool to systematically assess each AI system against Annex III criteria. When in doubt, apply the more conservative interpretation — regulators will be skeptical of organizations that have defined themselves out of high-risk obligations.',
                },
                {
                  challenge: 'Building quality management documentation from scratch',
                  solution: 'Organizations without existing quality management systems (e.g., those not ISO 9001 certified) face significant documentation burden. ControlWeave\'s prEN 18286 templates provide a starting framework — instead of building from blank documents, you start with templates that already map to Article 17 requirements.',
                },
                {
                  challenge: 'Making compliance monitoring sustainable',
                  solution: 'Manual compliance monitoring is unsustainable at scale. Organizations with multiple high-risk AI systems will find it impossible to manually track evidence for every Article 17 requirement. Compliance automation — using platforms like ControlWeave — is the only practical path to sustainable, evidence-based compliance.',
                },
                {
                  challenge: 'Integrating Article 17 with existing governance processes',
                  solution: 'Article 17 quality management must integrate with existing risk management (Article 9), technical documentation (Article 11), and record-keeping (Article 12) obligations. ControlWeave\'s crosswalk engine maps all EU AI Act articles to a unified control library — so implementing one article automatically populates evidence for related requirements.',
                },
              ].map((item) => (
                <div key={item.challenge} className="rounded-xl border border-amber-200 bg-amber-50 p-5">
                  <h3 className="font-semibold text-amber-900 mb-2">⚠️ Challenge: {item.challenge}</h3>
                  <p className="text-amber-800 text-sm leading-relaxed"><strong>Solution:</strong> {item.solution}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Section 6 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. Tools & Resources for Article 17 Compliance</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Several official EU resources provide guidance for EU AI Act Article 17 compliance. We recommend bookmarking these official sources alongside your implementation program:
            </p>
            <ul className="space-y-3 mb-8">
              {[
                { title: 'EU AI Act full text (Official Journal)', href: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1689', desc: 'The authoritative text of Regulation (EU) 2024/1689 — Article 17 starts at paragraph 1.' },
                { title: 'European AI Office', href: 'https://digital-strategy.ec.europa.eu/en/policies/european-ai-office', desc: 'The EU body responsible for supervising AI regulation and publishing implementation guidance.' },
                { title: 'CEN/CENELEC AI standards work programme', href: 'https://www.cencenelec.eu/areas-of-work/cenelec-sectors/digital-society-cenelec/artificial-intelligence/', desc: 'Source for prEN 18286 and other harmonized standards under the EU AI Act.' },
              ].map((resource) => (
                <li key={resource.title} className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 bg-gray-50">
                  <ShieldCheck size={16} className="text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <a href={resource.href} className="font-medium text-purple-600 hover:underline text-sm" target="_blank" rel="noopener noreferrer">{resource.title}</a>
                    <p className="text-gray-600 text-xs mt-0.5">{resource.desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">7. How ControlWeave Supports Built-In Article 17 / prEN 18286 Workflows</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Most GRC platforms treat EU AI Act compliance as an extension of their existing control libraries. ControlWeave was designed with AI governance at its core, and includes Article 17 quality management workflows directly in the platform.
            </p>
            <div className="bg-purple-950 text-white rounded-2xl p-8 mb-6">
              <h3 className="text-xl font-bold mb-4">ControlWeave Article 17 / prEN 18286 Capabilities</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  'Pre-built prEN 18286 quality management templates',
                  'Compliance monitoring dashboards with real-time evidence scoring',
                  'Post-market surveillance tracking with automated alerts',
                  'Incident reporting workflows with corrective action tracking',
                  'AI decision logging for Article 12 record-keeping',
                  'Crosswalk from Article 17 to NIST AI RMF and ISO 42001',
                  'Audit-ready documentation generated automatically',
                  'Pre-built templates and evidence workflows for faster implementation',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-2">
                    <span className="text-green-400 mt-0.5 flex-shrink-0">✅</span>
                    <span className="text-purple-100 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors text-center">
                Start Free Trial
              </Link>
              <Link href="/contact" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors text-center">
                Book Enterprise Demo for Article 17 / prEN 18286
              </Link>
            </div>
          </section>

          {/* Section 8 - Conclusion & Checklist */}
          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">8. Article 17 Implementation Checklist</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              Use this checklist to track your EU AI Act Article 17 quality management implementation. Each item corresponds to a specific Article 17 requirement:
            </p>
            <div className="rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-900 text-white px-6 py-4">
                <h3 className="font-bold">EU AI Act Article 17 Compliance Checklist</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {[
                  { category: 'Quality Management Policy', items: ['AI Quality Management Policy documented and signed', 'Scope defined (which AI systems are in scope)', 'Accountability assigned for each high-risk AI system', 'Gap assessment against Article 17 requirements complete'] },
                  { category: 'Compliance Monitoring', items: ['Monitoring frequency defined', 'Compliance checklists created and mapped to Article 17', 'Change management process triggers EU AI Act reassessment', 'Evidence collection automated where possible', 'Compliance dashboards operational'] },
                  { category: 'Post-Market Surveillance', items: ['Performance metrics and thresholds defined', 'Feedback mechanisms in place (deployers, users)', 'AI decision log review scheduled', 'Incident detection procedures documented', 'Escalation procedures tested'] },
                  { category: 'Incident Reporting', items: ['Serious incident definition documented', 'Incident reporting templates created', 'National authorities identified for each EU jurisdiction', 'Article 73 reporting timelines known and documented', 'Corrective action tracking operational'] },
                  { category: 'Record-Keeping', items: ['Quality management records retention policy documented', 'Article 11 technical documentation complete and linked', 'Article 12 AI decision logging operational', 'Audit trail of quality management activities maintained'] },
                ].map((section) => (
                  <div key={section.category} className="px-6 py-4">
                    <h4 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wider text-purple-600">{section.category}</h4>
                    <ul className="space-y-2">
                      {section.items.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                          <span className="w-4 h-4 border border-gray-300 rounded flex-shrink-0 mt-0.5"></span>
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* Conclusion */}
          <section className="bg-blue-50 border border-blue-200 rounded-2xl p-8 mb-12">
            <h2 className="text-xl font-bold text-gray-900 mb-3">Conclusion</h2>
            <p className="text-gray-700 leading-relaxed mb-4">
              EU AI Act Article 17 quality management compliance is not optional for providers of high-risk AI systems — it is a prerequisite for placing those systems on the EU market. With the August 2026 deadline approaching, organizations that start their Article 17 implementation now will have the evidence history and operational processes ready for regulatory inspections and customer audits.
            </p>
            <p className="text-gray-700 leading-relaxed">
              The prEN 18286 standard provides the most detailed available guidance for implementing Article 17 requirements. Organizations that adopt prEN 18286 now — before it achieves harmonized standard status — are positioning themselves for the strongest possible compliance posture when the regulation comes into full effect.
            </p>
          </section>

          <RelatedArticles articles={relatedArticles} />
        </article>
      </div>
    </>
  );
}
