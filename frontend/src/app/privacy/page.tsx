import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy & Data Protection — ControlWeave',
  description:
    'How ControlWeave protects your data: AES-256-GCM encryption at rest, TLS 1.2+ in transit, NIST Privacy Framework alignment, and a strict no-data-sale policy.',
};

const LAST_UPDATED = 'March 2026';
const EFFECTIVE_DATE = 'February 21, 2026';

const protections = [
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    ),
    title: 'AES-256-GCM Encryption at Rest',
    body: 'User PII (email addresses) is encrypted using AES-256-GCM before writing to the database. HMAC-SHA-384 search indexes let us look up records without ever exposing plaintext. Symmetric keys are rotated independently and never stored in source code.',
    badge: 'CNSA Suite 1.0',
  },
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <polyline points="9 12 11 14 15 10"/>
      </svg>
    ),
    title: 'TLS 1.2+ Enforced in Transit',
    body: 'All data in motion is protected by TLS 1.2 or higher — enforced globally via Node.js tls.DEFAULT_MIN_VERSION. API channels reject plaintext HTTP connections in production. No credentials travel unencrypted.',
    badge: 'STIG APSC-DV-000240',
  },
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18"/>
      </svg>
    ),
    title: 'NIST Privacy Framework Aligned',
    body: 'ControlWeave maps its internal data-handling practices to NIST Privacy Framework controls — including PR-P.01 (Data Protection Safeguards) and CT-P.02 (Data Access Managed). The same framework you can track for your customers, we track for ourselves.',
    badge: 'NIST PF 1.0',
  },
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10"/>
        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
      </svg>
    ),
    title: 'We Never Sell Your Data',
    body: 'Your personal data and your compliance artifacts are never sold, shared for advertising, or used to train third-party AI models. Period. Your governance data belongs to you — always.',
    badge: 'No Data Sales',
  },
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    ),
    title: 'Runtime Encryption Audit',
    body: 'On every server start, six automated checks verify: algorithm is AES-256-GCM, key length ≥ 256 bits, HMAC uses SHA-384+, TLS floor is active, and a live encrypt/decrypt round-trip passes. The server refuses to start if any check fails.',
    badge: 'STIG APSC-DV-000230',
  },
  {
    icon: (
      <svg aria-hidden="true" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
    ),
    title: 'Per-Tenant Data Isolation',
    body: 'Every query is scoped to your organization_id. No cross-tenant data leakage is possible by design — access controls are enforced at the database query level, not just the application layer.',
    badge: 'Multi-Tenant',
  },
];

const rights = [
  { label: 'Access', desc: 'Request a copy of the personal data we hold about you.' },
  { label: 'Rectification', desc: 'Correct inaccurate or incomplete data at any time.' },
  { label: 'Erasure', desc: 'Request deletion of your personal data ("right to be forgotten").' },
  { label: 'Portability', desc: 'Export your data in a machine-readable format from Settings → Export.' },
  { label: 'Opt-Out', desc: 'Unsubscribe from marketing emails at any time — one click, no friction.' },
  { label: 'No Sale', desc: 'We do not sell your personal information. California CCPA opt-out is moot by design.' },
];

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">

      {/* ── Marketing Hero ─────────────────────────────────────────────── */}
      <div className="bg-gradient-to-br from-purple-700 via-indigo-700 to-indigo-800 text-white">
        <div className="max-w-5xl mx-auto px-6 py-16 sm:py-20">
          <Link href="/" className="inline-flex items-center gap-1.5 text-purple-200 hover:text-white text-sm mb-8 transition-colors">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg>
            Back to ControlWeave
          </Link>

          <div className="inline-flex items-center gap-2 bg-white/15 text-white px-3 py-1 rounded-full text-xs font-semibold mb-5 uppercase tracking-wide">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            Privacy &amp; Security
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold leading-tight mb-4">
            Your Data, Protected<br className="hidden sm:block" /> at Every Layer.
          </h1>
          <p className="text-lg text-purple-100 max-w-2xl mb-8">
            ControlWeave is a compliance platform — so we hold ourselves to the same standards we help
            you achieve. AES-256-GCM encryption, TLS 1.2+ enforcement, NIST Privacy Framework alignment,
            and zero data sales. Here&apos;s exactly how we protect you.
          </p>

          {/* Quick-stats strip */}
          <div className="flex flex-wrap gap-3">
            {['AES-256-GCM at Rest', 'TLS 1.2+ in Transit', 'HMAC-SHA-384 Indexes', 'CNSA Suite 1.0', 'NIST Privacy Framework', 'GDPR + CCPA Ready'].map((tag) => (
              <span key={tag} className="bg-white/15 border border-white/20 text-white text-xs font-medium px-3 py-1 rounded-full">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* ── Six Protections Grid ───────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-16">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">How We Protect Your Data</h2>
        <p className="text-gray-500 mb-10 max-w-2xl">
          Six layers of protection — not just policy, but verifiable technical controls.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {protections.map((p) => (
            <div key={p.title} className="border border-gray-100 rounded-2xl p-6 hover:shadow-md transition-shadow bg-white">
              <div className="mb-4">{p.icon}</div>
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-base font-semibold text-gray-900 leading-snug">{p.title}</h3>
                <span className="shrink-0 text-xs font-medium bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full border border-purple-100">
                  {p.badge}
                </span>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Your Rights ───────────────────────────────────────────────── */}
      <section className="bg-gray-50 border-y border-gray-100">
        <div className="max-w-5xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Privacy Rights</h2>
          <p className="text-gray-500 mb-8 max-w-2xl">
            GDPR, CCPA, and common-sense defaults — you have full control over your data.
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {rights.map((r) => (
              <div key={r.label} className="flex gap-3 bg-white rounded-xl p-5 border border-gray-100">
                <svg className="shrink-0 mt-0.5" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"/></svg>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{r.label}</p>
                  <p className="text-sm text-gray-500 mt-0.5">{r.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-8 text-sm text-gray-500">
            To exercise any right, email{' '}
            <a href="mailto:contehconsulting@gmail.com" className="text-purple-600 hover:underline">
              contehconsulting@gmail.com
            </a>
            . We respond within 30 days (or within the timeframe required by applicable law).
          </p>
        </div>
      </section>

      {/* ── Post-Quantum Readiness ────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-14">
        <div className="bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-100 rounded-2xl p-8 flex flex-col sm:flex-row gap-6 items-start">
          <div className="shrink-0">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Post-Quantum Ready</h2>
            <p className="text-gray-600 text-sm leading-relaxed max-w-2xl">
              AES-256-GCM and HMAC-SHA-384 are symmetric algorithms — they are already quantum-resistant.
              Our primary future gap (TLS key exchange, ECDH → ML-KEM per CNSA Suite 2.0) is addressed at
              the platform infrastructure level. We track the CNSA Suite 2.0 transition timeline and will
              publish updates as standards evolve.
            </p>
          </div>
        </div>
      </section>

      {/* ── Legal Policy ──────────────────────────────────────────────── */}
      <div className="border-t border-gray-100 bg-gray-50">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">Privacy Policy</h2>
          <p className="text-sm text-gray-500 mb-8">
            Effective: {EFFECTIVE_DATE} &nbsp;·&nbsp; Last updated: {LAST_UPDATED}
          </p>

          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-10 space-y-10 text-gray-700 leading-relaxed">

            {/* Intro */}
            <section>
              <p>
                Conteh Consulting, LLC (&quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), doing business as{' '}
                <strong>ControlWeave</strong>, operates the ControlWeave platform and website at{' '}
                <strong>controlweave.com</strong>. This Privacy Policy explains how we collect, use, disclose,
                and protect information about you when you use our services. By accessing or using ControlWeave,
                you agree to the practices described in this policy.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 1 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">1. Information We Collect</h3>

              <h4 className="font-semibold text-gray-900 mb-2">Account Information</h4>
              <p className="mb-4">
                When you register for ControlWeave, we collect your name, email address, organization name,
                job title, and a password (stored as a salted bcrypt hash — we never store plaintext passwords).
                Your email address is additionally encrypted at rest using AES-256-GCM.
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">Compliance and Governance Data</h4>
              <p className="mb-4">
                ControlWeave is a compliance management platform. As part of normal use, you may upload or
                create: security policies, control evidence, audit artifacts, risk assessments, vendor
                questionnaires, asset inventories, and other governance documents. This data belongs to you
                and your organization. We process it solely to provide the service.
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">Usage and Technical Data</h4>
              <p className="mb-4">
                We automatically collect log data including IP address, browser type, pages visited, features
                used, timestamps, and error reports. This helps us operate, secure, and improve the platform.
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">Payment Information</h4>
              <p>
                Billing and payment processing is handled entirely by <strong>Stripe, Inc.</strong> We do not
                store your full credit card number, CVV, or bank account details. We receive only a Stripe
                customer ID and subscription status. Stripe&apos;s privacy policy governs their handling of
                payment data.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 2 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">2. How We Use Your Information</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Provide, operate, and maintain the ControlWeave platform</li>
                <li>Process transactions and manage your subscription</li>
                <li>Send transactional emails (account confirmation, password reset, subscription receipts)</li>
                <li>Respond to support requests and inquiries</li>
                <li>Detect, investigate, and prevent security incidents and fraud</li>
                <li>Improve the platform through aggregated, anonymized usage analytics</li>
                <li>Comply with legal obligations</li>
                <li>Send product updates and announcements (you may opt out at any time)</li>
              </ul>
              <p className="mt-4">
                We do <strong>not</strong> sell your personal data or your compliance data to third parties.
                We do not use your compliance artifacts to train AI models without explicit consent.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 3 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">3. How We Share Your Information</h3>
              <p className="mb-4">
                We share information only as necessary to provide the service or as required by law:
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">Service Providers</h4>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li>
                  <strong>Stripe, Inc.</strong> — payment processing. Stripe is PCI-DSS Level 1 certified.
                </li>
                <li>
                  <strong>Railway (Railway Corp.)</strong> — cloud infrastructure and hosting. Your data
                  resides on Railway&apos;s infrastructure.
                </li>
                <li>
                  <strong>Email providers</strong> — transactional email delivery (e.g. password resets,
                  notifications).
                </li>
              </ul>

              <h4 className="font-semibold text-gray-900 mb-2">Legal Requirements</h4>
              <p className="mb-4">
                We may disclose information if required by law, subpoena, court order, or to protect the
                rights, property, or safety of ControlWeave, our users, or the public.
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">Business Transfers</h4>
              <p>
                If ControlWeave is involved in a merger, acquisition, or asset sale, your information may be
                transferred. We will provide notice before your personal data is transferred and becomes
                subject to a different privacy policy.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 4 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">4. Data Retention</h3>
              <p className="mb-4">
                We retain your account data for as long as your account is active or as needed to provide
                services. Evidence and compliance artifacts are retained according to your subscription tier:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong>Community:</strong> 90-day evidence retention</li>
                <li><strong>Pro:</strong> 1-year evidence retention</li>
                <li><strong>Enterprise:</strong> 3-year evidence retention</li>
                <li><strong>Gov Cloud &amp; Advisory:</strong> Configurable per agreement</li>
              </ul>
              <p>
                Upon account deletion or cancellation, we will delete or anonymize your personal data within
                30 days, except where we are required to retain it for legal or regulatory purposes.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 5 — updated to reflect AES-256-GCM */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">5. Data Security</h3>
              <p className="mb-4">
                We implement layered security controls aligned with NIST 800-53, CNSA Suite 1.0, and SOC 2
                principles. Technical measures include:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>
                  <strong>Encryption at rest</strong> — User PII (email addresses) encrypted with{' '}
                  <strong>AES-256-GCM</strong>; HMAC-SHA-384 search indexes; keys managed independently
                  via environment-level secrets
                </li>
                <li>
                  <strong>Encryption in transit</strong> — TLS 1.2+ enforced globally
                  (<code className="text-xs bg-gray-100 px-1 py-0.5 rounded">tls.DEFAULT_MIN_VERSION</code>);
                  API channels reject plaintext HTTP in production
                </li>
                <li>Per-tenant data isolation — every database query is scoped to your organization</li>
                <li>bcrypt (12 rounds) password hashing — plaintext passwords are never stored or logged</li>
                <li>Continuous static analysis (CodeQL SAST) and dynamic testing (OWASP ZAP DAST)</li>
                <li>Automated secrets detection in CI/CD pipelines</li>
                <li>Zero-tolerance policy for critical and high vulnerabilities before deployment</li>
                <li>Software Bill of Materials (SBOM and AIBOM) published with every release</li>
                <li>Runtime encryption audit on every server start — server refuses to launch if any check fails</li>
              </ul>
              <p className="mt-4">
                No method of transmission over the Internet is 100% secure. We cannot guarantee absolute
                security, but we are committed to protecting your data using reasonable and appropriate measures.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 6 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">6. Cookies and Tracking</h3>
              <p className="mb-4">
                ControlWeave uses cookies and similar technologies for:
              </p>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong>Authentication:</strong> Session tokens to keep you logged in</li>
                <li><strong>Preferences:</strong> Storing UI settings (e.g. dismissed banners)</li>
                <li><strong>Analytics:</strong> Aggregated, anonymized usage metrics to improve the product</li>
              </ul>
              <p>
                We do not use third-party advertising cookies or sell cookie data to advertisers. You can
                disable cookies in your browser settings, though this may affect platform functionality.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 7 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">7. Your Rights (GDPR &amp; CCPA)</h3>
              <p className="mb-4">
                Depending on your location, you may have the following rights regarding your personal data:
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">For EU/EEA Residents (GDPR)</h4>
              <ul className="list-disc pl-6 space-y-2 mb-4">
                <li><strong>Right of access:</strong> Request a copy of the personal data we hold about you</li>
                <li><strong>Right to rectification:</strong> Correct inaccurate or incomplete data</li>
                <li><strong>Right to erasure:</strong> Request deletion of your personal data (&quot;right to be forgotten&quot;)</li>
                <li><strong>Right to restrict processing:</strong> Ask us to limit how we use your data</li>
                <li><strong>Right to data portability:</strong> Receive your data in a machine-readable format</li>
                <li><strong>Right to object:</strong> Object to processing based on legitimate interests</li>
                <li><strong>Right to withdraw consent:</strong> Where processing is based on consent, withdraw it at any time</li>
              </ul>
              <p className="mb-4">
                Our lawful bases for processing under GDPR are: (a) performance of a contract (providing the
                service you subscribed to); (b) legitimate interests (security, fraud prevention, product
                improvement); and (c) compliance with legal obligations.
              </p>

              <h4 className="font-semibold text-gray-900 mb-2">For California Residents (CCPA)</h4>
              <p className="mb-4">
                California residents have the right to know what personal information is collected, the right
                to delete personal information, and the right to opt out of the sale of personal information.
                We do not sell personal information.
              </p>

              <p>
                To exercise any of these rights, contact us at{' '}
                <a href="mailto:contehconsulting@gmail.com" className="text-purple-600 hover:underline">
                  contehconsulting@gmail.com
                </a>
                . We will respond within 30 days (or within the timeframe required by applicable law).
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 8 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">8. International Data Transfers</h3>
              <p>
                ControlWeave is operated from the United States. If you access the platform from outside the
                United States, your data may be transferred to and processed in the United States, where data
                protection laws may differ from those in your jurisdiction. By using the platform, you consent
                to this transfer. For EU users, we rely on Standard Contractual Clauses where required as a
                lawful transfer mechanism.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 9 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">9. Children&apos;s Privacy</h3>
              <p>
                ControlWeave is not directed at children under 16 years of age. We do not knowingly collect
                personal information from children under 16. If you believe we have inadvertently collected
                such information, please contact us immediately at{' '}
                <a href="mailto:contehconsulting@gmail.com" className="text-purple-600 hover:underline">
                  contehconsulting@gmail.com
                </a>
                .
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 10 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">10. Changes to This Policy</h3>
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the
                &quot;Last updated&quot; date at the top and notify users via email or an in-app notice for
                material changes. Your continued use of ControlWeave after any changes constitutes acceptance
                of the updated policy.
              </p>
            </section>

            <hr className="border-gray-100" />

            {/* 11 */}
            <section>
              <h3 className="text-xl font-bold text-gray-900 mb-4">11. Contact Us</h3>
              <p className="mb-4">
                If you have questions, concerns, or requests regarding this Privacy Policy or our data
                practices, please contact us:
              </p>
              <div className="bg-gray-50 rounded-xl p-6 space-y-1 text-sm">
                <p className="font-semibold text-gray-900">Conteh Consulting, LLC (ControlWeave)</p>
                <p>2098 Stone Valley Place</p>
                <p>Reynoldsburg, OH 43068, United States</p>
                <p className="pt-2">
                  <strong>Privacy inquiries:</strong>{' '}
                  <a href="mailto:contehconsulting@gmail.com" className="text-purple-600 hover:underline">
                    contehconsulting@gmail.com
                  </a>
                </p>
                <p>
                  <strong>General support:</strong>{' '}
                  <a href="mailto:contehconsulting@gmail.com" className="text-purple-600 hover:underline">
                    contehconsulting@gmail.com
                  </a>
                </p>
              </div>
            </section>

          </div>

          {/* Footer links */}
          <div className="mt-8 text-center text-sm text-gray-500 space-x-4">
            <Link href="/" className="hover:text-purple-600">Home</Link>
            <span>·</span>
            <Link href="/contact" className="hover:text-purple-600">Contact</Link>
            <span>·</span>
            <Link href="/dashboard" className="hover:text-purple-600">Dashboard</Link>
          </div>
        </div>
      </div>

    </div>
  );
}
