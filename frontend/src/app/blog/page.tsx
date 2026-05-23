import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'AI Governance & GRC Blog | ControlWeave',
  description: 'Expert guides on EU AI Act compliance, NIST AI RMF, SOC 2, AI decision logging, and evidence-based GRC. Practical advice for compliance teams.', // ip-hygiene:ignore
  alternates: { canonical: 'https://controlweave.com/blog' },
  openGraph: {
    title: 'AI Governance & GRC Blog | ControlWeave',
    description: 'Expert guides on EU AI Act compliance, NIST AI RMF, SOC 2, AI decision logging, and evidence-based GRC.',
    url: 'https://controlweave.com/blog',
  },
};

const posts = [
  {
    href: '/blog/how-to-comply-eu-ai-act-article-17',
    title: 'How to Comply with EU AI Act Article 17: Quality Management Guide',
    description: 'Complete guide to EU AI Act Article 17 compliance for high-risk AI systems. Learn quality management requirements and prEN 18286 implementation.',
    tag: 'EU AI Act',
    date: '2025-02-13',
  },
  {
    href: '/blog/ai-governance-platform-guide',
    title: 'AI Governance Platform: The Complete Guide (2025)',
    description: 'What is an AI governance platform? Learn about NIST AI RMF, EU AI Act, and ISO 42001 frameworks, key features, and how to choose the right tool.', // ip-hygiene:ignore
    tag: 'AI Governance',
    date: '2025-02-13',
  },
  {
    href: '/blog/how-to-comply-eu-ai-act',
    title: 'How to Comply with EU AI Act: Step-by-Step Guide (2025–2027)',
    description: 'Step-by-step EU AI Act compliance guide covering risk classification, documentation requirements, prEN 18286 implementation, and deadlines.',
    tag: 'EU AI Act',
    date: '2025-02-13',
  },
  {
    href: '/blog/ai-decision-logging-best-practices',
    title: 'AI Decision Logging: Best Practices & Implementation Guide (2025)',
    description: 'Learn AI decision logging best practices for compliance. What to log, how to structure data, retention policies, and automated logging tools.',
    tag: 'AI Governance',
    date: '2025-02-13',
  },
];

export default function BlogIndex() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <section className="bg-gradient-to-br from-purple-900 via-indigo-900 to-purple-900 text-white py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <div className="text-xs font-semibold uppercase tracking-widest text-purple-300 mb-4">ControlWeave Blog</div>
          <h1 className="text-3xl sm:text-4xl font-bold mb-4">AI Governance &amp; GRC Insights</h1>
          <p className="text-lg text-purple-200 max-w-2xl mx-auto">
            Practical guides on EU AI Act compliance, NIST AI RMF, SOC 2, and evidence-based GRC — written for compliance teams who need to get things done.
          </p>
        </div>
      </section>

      {/* Post grid */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="grid gap-8">
            {posts.map((post) => (
              <article key={post.href} className="bg-white rounded-2xl border border-gray-200 p-8 hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-3 mb-3">
                  <span className="bg-purple-100 text-purple-700 text-xs font-semibold px-3 py-1 rounded-full">{post.tag}</span>
                  <time className="text-xs text-gray-400" dateTime={post.date}>{new Date(/^\d{4}-\d{2}-\d{2}$/.test(post.date) ? post.date + 'T00:00:00' : post.date).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</time>
                </div>
                <h2 className="text-xl font-bold text-gray-900 mb-3">
                  <Link href={post.href} className="hover:text-purple-700 transition-colors">{post.title}</Link>
                </h2>
                <p className="text-gray-600 mb-4">{post.description}</p>
                <Link href={post.href} className="text-purple-600 font-semibold text-sm hover:underline">Read article →</Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 px-4 sm:px-6 lg:px-8 bg-white border-t border-gray-200">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Ready to automate your compliance program?</h2>
          <p className="text-gray-600 mb-6">Start free and scale as your program grows. No setup fees, no credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
              Start Free Trial
            </Link>
            <Link href="/frameworks/eu-ai-act" className="border border-purple-600 text-purple-600 px-8 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors">
              Explore EU AI Act Coverage
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
