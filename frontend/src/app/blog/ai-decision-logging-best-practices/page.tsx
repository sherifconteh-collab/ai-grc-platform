import type { Metadata } from 'next';
import Link from 'next/link';
import { Database, CheckCircle, ShieldCheck } from 'lucide-react';
import Breadcrumbs from '@/components/Breadcrumbs';
import RelatedArticles from '@/components/RelatedArticles';
import Schema from '@/components/Schema';

export const metadata: Metadata = {
  title: 'AI Decision Logging: Best Practices & Implementation Guide (2025)',
  description: 'Learn AI decision logging best practices for compliance and governance. What to log, how to structure data, and tools for automated logging.',
  keywords: [
    'AI decision logging',
    'AI governance',
    'EU AI Act Article 12',
    'NIST AI RMF',
    'AI audit trail',
    'AI compliance',
    'AI decision audit',
    'compliance automation',
    'evidence-based compliance',
  ],
  alternates: {
    canonical: 'https://controlweave.com/blog/ai-decision-logging-best-practices',
  },
  openGraph: {
    title: 'AI Decision Logging: Best Practices & Implementation Guide (2025)',
    description: 'Learn AI decision logging best practices for compliance and governance. What to log, how to structure data, and tools for automated logging.',
    url: 'https://controlweave.com/blog/ai-decision-logging-best-practices',
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

export default function AIDecisionLoggingBestPracticesPage() {
  return (
    <>
      <Schema
        type="article"
        headline="AI Decision Logging: Best Practices for Governance & Compliance"
        description="Learn AI decision logging best practices for compliance and governance. What to log, how to structure data, and tools for automated logging."
        datePublished="2025-02-13"
        url="https://controlweave.com/blog/ai-decision-logging-best-practices"
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
          <Breadcrumbs items={[{ label: 'Blog', href: '/blog' }, { label: 'AI Decision Logging Best Practices' }]} />

          <header className="mb-12">
            <div className="inline-flex items-center gap-2 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold mb-4">
              AI Governance · Technical Guide
            </div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-4 leading-tight">
              AI Decision Logging: Best Practices for Governance &amp; Compliance
            </h1>
            <div className="flex items-center gap-4 text-sm text-gray-500 mb-6">
              <span>By <strong className="text-gray-700">Jaja Conteh</strong></span>
              <span>·</span>
              <time dateTime="2025-02-13">February 13, 2025</time>
              <span>·</span>
              <span>10 min read</span>
            </div>
            <p className="text-xl text-gray-600 leading-relaxed">
              AI decision logging is the practice of systematically recording AI system inputs, outputs, and contextual information to enable auditability, accountability, and compliance. This guide covers what to log, how to structure AI decision logs, and best practices for governance and regulatory compliance.
            </p>
          </header>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">1. What is AI Decision Logging?</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              AI decision logging is the systematic capture and storage of information about AI system decisions — including the inputs provided to the AI system, the outputs it produced, the model version used, and the context in which the decision was made. AI decision logs create an immutable audit trail that allows organizations to retrospectively examine, explain, and verify AI system behavior.
            </p>
            <p className="text-gray-600 leading-relaxed mb-4">
              Effective AI decision logging is distinct from general application logging. While application logs record system events (errors, performance metrics, user actions), AI decision logs focus specifically on the decision-making process — capturing the information needed to understand why an AI system produced a particular output, not just that it did.
            </p>
            <p className="text-gray-600 leading-relaxed">
              AI decision logging is increasingly required by regulation. EU AI Act Article 12 mandates that high-risk AI systems automatically generate logs of their operation, with logging capabilities that ensure traceability of system outputs throughout the AI system&apos;s lifecycle. NIST AI RMF MEASURE function subcategories similarly require evidence that AI systems operate as intended — and AI decision logs are the primary evidence source.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">2. Why AI Decision Logging Matters: Regulatory Requirements</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              AI decision logging is no longer optional for organizations deploying AI in regulated environments. Several major regulations and frameworks explicitly require it:
            </p>
            <div className="space-y-4 mb-6">
              {[
                {
                  framework: 'EU AI Act — Article 12',
                  requirement: 'High-risk AI systems must have logging capabilities that automatically generate logs during operation. Logs must record the period each high-risk AI system is in use, the reference database used, input data, and where relevant, the identity of natural persons who participated in verification of results.',
                  color: 'border-blue-200 bg-blue-50',
                },
                {
                  framework: 'NIST AI RMF — MEASURE Function',
                  requirement: 'The MEASURE function requires organizations to evaluate AI system behavior and performance. AI decision logs are the primary evidence source for demonstrating that AI systems perform within acceptable bounds and that anomalies are detected and addressed.',
                  color: 'border-purple-200 bg-purple-50',
                },
                {
                  framework: 'EU AI Act — Article 17 (Quality Management)',
                  requirement: 'Article 17 quality management requirements include post-market monitoring and incident detection. AI decision logs are the foundational data source for post-market surveillance — enabling detection of performance drift, bias, and anomalous behavior.',
                  color: 'border-green-200 bg-green-50',
                },
                {
                  framework: 'GDPR — Article 22 (Automated Decision-Making)',
                  requirement: 'When AI systems make decisions with significant effects on individuals, GDPR Article 22 requires meaningful information about the logic involved. AI decision logs provide the underlying data needed to fulfill subject access requests and explainability obligations.',
                  color: 'border-orange-200 bg-orange-50',
                },
              ].map((item) => (
                <div key={item.framework} className={`rounded-xl border p-5 ${item.color.split(' ')[0]} ${item.color.split(' ')[1]}`}>
                  <h3 className="font-bold text-gray-900 mb-2 text-sm">{item.framework}</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{item.requirement}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">3. What to Log: The Complete AI Decision Log Schema</h2>
            <p className="text-gray-600 leading-relaxed mb-6">
              A complete AI decision log should capture the following categories of information. The specific fields required depend on the AI system type, its risk level, and applicable regulatory requirements.
            </p>

            <div className="space-y-6">
              {[
                {
                  category: 'System & Session Context',
                  icon: <Database size={18} className="text-purple-600" />,
                  fields: ['decision_id: Unique identifier for this decision event', 'timestamp: ISO 8601 timestamp with timezone', 'system_id: Identifier of the AI system', 'model_version: Exact model version or hash', 'deployment_environment: production/staging/test', 'session_id: Session identifier for multi-step processes'],
                },
                {
                  category: 'Input Data',
                  icon: <Database size={18} className="text-blue-600" />,
                  fields: ['input_type: Type of input (text, image, tabular, etc.)', 'input_hash: Cryptographic hash of input data', 'input_metadata: Descriptive metadata without PII', 'data_source: Origin of input data', 'preprocessing_steps: Transformations applied to input'],
                },
                {
                  category: 'Decision Output',
                  icon: <Database size={18} className="text-green-600" />,
                  fields: ['output_value: The AI decision or recommendation', 'output_type: Classification/regression/generation/ranking', 'confidence_score: Model confidence/probability', 'alternative_outputs: Top-N alternatives considered', 'decision_rationale: Feature importance or explanation (where available)'],
                },
                {
                  category: 'Human Oversight',
                  icon: <ShieldCheck size={18} className="text-orange-600" />,
                  fields: ['human_review_required: Boolean — was human review triggered', 'human_reviewer_id: Anonymized reviewer identifier', 'human_decision: Human override value if review occurred', 'review_reason: Why review was triggered', 'review_timestamp: When human review completed'],
                },
              ].map((section) => (
                <div key={section.category} className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
                    {section.icon}
                    <h3 className="font-semibold text-gray-900">{section.category}</h3>
                  </div>
                  <div className="p-5">
                    <div className="bg-gray-900 rounded-xl p-4 font-mono text-sm overflow-x-auto">
                      {section.fields.map((field) => {
                        const [name, desc] = field.split(': ');
                        return (
                          <div key={field} className="text-green-400 mb-1">
                            <span className="text-blue-300">&quot;{name}&quot;</span>
                            <span className="text-gray-400">: </span>
                            <span className="text-gray-400 text-xs">{'// '}{desc}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">4. How to Structure AI Decision Logs</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              A complete AI decision log entry in JSON format looks like this:
            </p>
            <div className="bg-gray-900 rounded-2xl p-6 mb-6 overflow-x-auto">
              <pre className="text-sm text-green-400 font-mono leading-relaxed">
{`{
  "decision_id": "dec_01JKZM...",
  "timestamp": "2025-02-13T14:30:00Z",
  "system_id": "credit-risk-model-v3",
  "model_version": "sha256:a1b2c3...",
  "deployment_environment": "production",
  
  "input": {
    "input_hash": "sha256:f4e5d6...",
    "input_type": "tabular",
    "feature_count": 47,
    "data_source": "loan-application-api"
  },
  
  "output": {
    "decision": "approve",
    "confidence_score": 0.87,
    "risk_tier": "low",
    "decision_rationale": {
      "top_features": [
        {"feature": "payment_history", "importance": 0.42},
        {"feature": "debt_ratio", "importance": 0.28}
      ]
    }
  },
  
  "human_oversight": {
    "review_required": false,
    "review_trigger": null
  },
  
  "compliance": {
    "eu_ai_act_article12": true,
    "retention_until": "2030-02-13"
  }
}`}
              </pre>
            </div>
            <p className="text-gray-600 leading-relaxed">
              Note that input data is hashed rather than stored in full — this protects individual privacy while maintaining auditability. The hash allows verification that a specific input was used without storing the potentially sensitive input data itself. This approach satisfies EU AI Act Article 12 logging requirements while remaining compatible with GDPR data minimization principles.
            </p>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">5. Storage and Retention</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              AI decision log retention requirements depend on the applicable regulatory framework and the nature of the AI system:
            </p>
            <div className="overflow-x-auto mb-6">
              <table className="w-full border-collapse border border-gray-200 text-sm">
                <thead>
                  <tr className="bg-gray-900 text-white">
                    <th className="text-left px-4 py-3 font-semibold">Regulation</th>
                    <th className="text-left px-4 py-3 font-semibold">Minimum Retention</th>
                    <th className="text-left px-4 py-3 font-semibold">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { reg: 'EU AI Act (general)', retention: '10 years post-lifecycle', notes: 'Technical documentation and logs for high-risk AI systems' },
                    { reg: 'EU AI Act (biometric)', retention: '6 months', notes: 'Shorter retention for biometric identification systems' },
                    { reg: 'GDPR', retention: 'Purpose limitation', notes: 'Retain only as long as necessary for the processing purpose' },
                    { reg: 'NIST AI RMF', retention: 'Organization-defined', notes: 'Sufficient to demonstrate MEASURE function evidence' },
                    { reg: 'Financial services AI', retention: '5-7 years', notes: 'Varies by jurisdiction and instrument type' },
                  ].map((row, i) => (
                    <tr key={row.reg} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-3 font-medium text-purple-700 border-b border-gray-100">{row.reg}</td>
                      <td className="px-4 py-3 text-gray-700 border-b border-gray-100">{row.retention}</td>
                      <td className="px-4 py-3 text-gray-500 border-b border-gray-100 text-xs">{row.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="space-y-3">
              {[
                { tier: 'Hot storage (0-12 months)', desc: 'Full log retention in queryable database (PostgreSQL, BigQuery). Active compliance monitoring and real-time alerting.' },
                { tier: 'Warm storage (1-3 years)', desc: 'Compressed logs in object storage (S3, Azure Blob). Queryable within hours for audit requests and incident investigation.' },
                { tier: 'Cold storage (3-10 years)', desc: 'Archived logs in cost-optimized cold storage. Retrievable for regulatory requests within 48 hours.' },
              ].map((item) => (
                <div key={item.tier} className="flex gap-3 p-4 rounded-xl border border-gray-200">
                  <Database size={16} className="text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="font-semibold text-gray-900 text-sm">{item.tier}: </span>
                    <span className="text-gray-600 text-sm">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mb-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">6. ControlWeave&apos;s Approach to AI Decision Logging</h2>
            <p className="text-gray-600 leading-relaxed mb-4">
              ControlWeave provides built-in AI decision logging as part of its AI governance platform — capturing the information required for EU AI Act Article 12 compliance, NIST AI RMF MEASURE function evidence, and Article 17 post-market surveillance in a unified audit trail.
            </p>
            <div className="bg-gray-900 text-white rounded-2xl p-6 mb-6">
              <h3 className="font-bold mb-4">ControlWeave AI Decision Logging Features</h3>
              <div className="space-y-3">
                {[
                  'Automatic capture of AI inputs (hashed), outputs, and model versions',
                  'Human oversight event tracking — overrides, reviews, and escalations',
                  'Confidence score and decision rationale logging',
                  'Tamper-evident storage with cryptographic integrity verification',
                  'Compliance-mapped schema for EU AI Act Article 12 and NIST AI RMF',
                  'Automated retention management with tiered storage',
                  'Real-time anomaly detection on decision patterns',
                  'Audit-ready export for regulatory submissions',
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckCircle size={16} className="text-green-400 mt-0.5 flex-shrink-0" />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/register" className="bg-purple-600 text-white px-6 py-3 rounded-xl font-semibold hover:bg-purple-700 transition-colors text-center">
                Start Free Trial
              </Link>
              <Link href="/frameworks/eu-ai-act" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors text-center">
                EU AI Act Compliance Platform
              </Link>
            </div>
          </section>

          <section className="bg-green-50 border border-green-200 rounded-2xl p-8 mb-12">
            <h2 className="text-xl font-bold text-gray-900 mb-3">AI Decision Logging Compliance Checklist</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                'Log schema defined and documented',
                'All EU AI Act Article 12 fields captured',
                'Input data hashed (privacy-preserving)',
                'Model version recorded for every decision',
                'Human oversight events captured',
                'Confidence scores logged',
                'Tamper-evident storage implemented',
                'Retention policy defined and automated',
                'Anomaly detection active',
                'Audit export capability tested',
                'Compliance mapping documented',
                'Incident response process connected to log anomalies',
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="w-4 h-4 border border-green-400 rounded bg-white flex-shrink-0"></span>
                  {item}
                </div>
              ))}
            </div>
          </section>

          <RelatedArticles articles={relatedArticles} />
        </article>
      </div>
    </>
  );
}
