'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { requiresOrganizationOnboarding } from '@/lib/access';
import { requiresBillingResolution } from '@/lib/billing';
import MarketingNav from '@/components/MarketingNav';

const frameworks = [
  'NIST 800-53', 'ISO 27001', 'SOC 2 Type II', 'HIPAA', 'GDPR',
  'EU AI Act', 'NIST AI RMF', 'NIST CSF 2.0', 'FedRAMP', 'NIST 800-171',
  'ISO 42001', 'CMMC 2.0',
];

const features = [
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
    ),
    title: '40+ Frameworks & Standards, Zero Overlap',
    desc: 'NIST 800-53, ISO 27001, SOC 2, HIPAA, GDPR, EU AI Act, ISO 42001, and more — all managed in one unified control library.', // ip-hygiene:ignore
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 21V9a9 9 0 0 0 9 9"/></svg>
    ),
    title: 'Auto-Crosswalk. One Implementation.',
    desc: 'Mark a control implemented and ControlWeave automatically satisfies the equivalent in every other active framework — instantly.',
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
    ),
    title: 'AI That Knows Your Organization',
    desc: '25+ AI features: gap analysis, remediation playbooks, compliance forecasting, and an org-aware AI copilot.',
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg>
    ),
    title: '2,000+ Audit-Ready Procedures',
    desc: 'NIST-standard assessment procedures across three depths. Full auditor workspace built in.',
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/></svg>
    ),
    title: 'CMDB + Asset Governance',
    desc: 'Track hardware, software, AI agents, and service accounts. SBOM and AIBOM support built in.',
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
    ),
    title: 'Evidence That Collects Itself',
    desc: 'AI scans your connected integrations, maps data to framework controls, and suggests evidence — you just approve or reject.',
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
    ),
    title: 'Third-Party AI Governance',
    desc: 'Manage AI vendor assessments, concentration risk, supply-chain components, and incidents. ISO/IEC 42001 and DORA aligned.', // ip-hygiene:ignore
  },
  {
    icon: (
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
    ),
    title: 'Live Threat Intelligence',
    desc: 'NVD, CISA KEV, MITRE ATT&CK, and AlienVault OTX feeds — auto-synced and linked to your controls and vulnerabilities.',
  },
];

function LandingPage() {
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'annual'>('monthly');

  const withBilling = (href: string) => {
    if (!href.startsWith('/register?plan=')) return href;
    const separator = href.includes('?') ? '&' : '?';
    return `${href}${separator}billing=${billingCycle}`;
  };

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900 antialiased">
      {/* Nav */}
      <MarketingNav />

      {/* Hero */}
      <section className="px-4 sm:px-6 lg:px-8 pt-20 pb-20" style={{background: 'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.13) 0%, transparent 70%), #fff'}}>
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-6">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>
            AI-Native GRC &nbsp;&middot;&nbsp; SOC 2 &nbsp;&middot;&nbsp; NIST &nbsp;&middot;&nbsp; ISO &nbsp;&middot;&nbsp; EU AI Act
          </div>
          <h1 className="text-5xl sm:text-6xl font-extrabold text-gray-900 leading-tight mb-6">
            Your Compliance Program,&nbsp;Unified.
            <span className="block text-purple-600 mt-2">From Policy to Proof — Automated.</span>
          </h1>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto mb-10">
            Built for the 90% of organizations deploying AI who need practical, provable governance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="inline-block bg-gradient-to-r from-purple-700 to-indigo-700 text-white px-8 py-4 rounded-xl text-lg font-semibold shadow-lg shadow-purple-200 hover:opacity-95 transition-opacity">
              Start Free — No Credit Card
            </Link>
            <a href="#how-it-works" className="inline-block border border-gray-300 text-gray-700 px-8 py-4 rounded-xl text-lg font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors">
              See How It Works
            </a>
          </div>
          <p className="mt-6 text-sm text-gray-500">
            Trusted by compliance teams managing NIST 800-53, ISO 27001, SOC 2, HIPAA, GDPR, and EU AI Act.
          </p>
        </div>

        {/* Dashboard mock */}
        <div className="max-w-3xl mx-auto mt-16">
          <div className="rounded-2xl shadow-2xl border border-gray-200 overflow-hidden">
            <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-400"></div>
                <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                <div className="w-3 h-3 rounded-full bg-green-400"></div>
              </div>
              <div className="flex-1 mx-4 bg-white rounded-md px-3 py-1 text-xs text-gray-400 text-center border border-gray-200">app.controlweave.com/dashboard</div>
            </div>
            <div className="bg-gray-950 p-6">
              <div className="grid grid-cols-3 gap-4 mb-4">
                {[
                  { label: 'Control Status', value: '87%', sub: '+4% this month', subColor: 'text-green-400' },
                  { label: 'Active Frameworks', value: '4', sub: 'NIST · ISO · SOC 2 · EU AI', subColor: 'text-purple-400' },
                  { label: 'Evidence Score', value: '92/100', sub: 'Audit-ready ✓', subColor: 'text-green-400' },
                ].map((s) => (
                  <div key={s.label} className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                    <div className="text-xs text-gray-400 mb-1 font-medium">{s.label}</div>
                    <div className="text-2xl font-bold text-white">{s.value}</div>
                    <div className={`text-xs mt-1 ${s.subColor}`}>{s.sub}</div>
                  </div>
                ))}
              </div>
              <div className="bg-gray-900 rounded-xl p-4 border border-gray-800">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-xs text-gray-400 font-medium">Framework Coverage</div>
                  <div className="text-xs text-purple-400">97 crosswalk mappings active</div>
                </div>
                <div className="space-y-2">
                  {[['NIST 800-53', 89, 'bg-purple-500'], ['ISO 27001', 94, 'bg-purple-500'], ['SOC 2', 78, 'bg-indigo-500']].map(([name, pct, color]) => (
                    <div key={name as string} className="flex items-center gap-3">
                      <div className="text-xs text-gray-300 w-24 flex-shrink-0">{name as string}</div>
                      <div className="flex-1 bg-gray-800 rounded-full h-1.5">
                        <div className={`${color as string} h-1.5 rounded-full`} style={{width: `${pct}%`}}></div>
                      </div>
                      <div className="text-xs text-gray-400">{pct}%</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Framework badge row */}
      <section className="py-10 bg-white border-t border-b border-gray-100 overflow-hidden">
        <p className="text-center mb-5 text-sm font-medium text-gray-500">Trusted by teams managing the frameworks that matter most</p>
        <div className="flex gap-4 flex-wrap justify-center px-4">
          {frameworks.map((fw) => (
            <span key={fw} className="inline-flex items-center px-4 py-2 rounded-full border border-gray-200 text-sm font-medium text-gray-600 bg-gray-50">{fw}</span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">How It Works</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Compliance That Runs Itself</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Three steps from setup to audit-ready.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              { num: '01', title: 'Connect Once. Cover All Frameworks.', desc: 'Select your active frameworks — NIST, ISO, SOC 2, HIPAA, and more. The crosswalk engine automatically maps shared controls so you never implement the same requirement twice.' }, // ip-hygiene:ignore
              { num: '02', title: 'Evidence Collected, Not Chased.', desc: 'Connect Splunk or other integrations and let AI scan for compliance-relevant logs. The AI maps data to your framework controls and suggests evidence items — you review, approve, and the evidence is filed automatically.' },
              { num: '03', title: 'Audit-Ready, Always.', desc: 'Generate audit packages, run AI gap analysis, and export control evidence to any auditor. Your compliance posture is always visible, always documented, always provable.' },
            ].map((step) => (
              <div key={step.num} className="relative bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-8 hover:border-purple-200 hover:shadow-lg hover:shadow-purple-50/50 transition-all">
                <div className="text-6xl font-extrabold text-purple-100 mb-4 leading-none select-none">{step.num}</div>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{step.title}</h3>
                <p className="text-gray-600 leading-relaxed text-sm">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Everything Your Compliance Program Needs</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">One platform for frameworks, evidence, AI governance, third-party risk, and audits.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-gray-100 bg-white hover:border-purple-200 hover:shadow-lg hover:shadow-purple-50/40 transition-all">
                <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section className="py-14 px-4 text-white" style={{background: 'linear-gradient(90deg, #7e22ce, #7c3aed, #4338ca)'}}>
        <div className="max-w-6xl mx-auto grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 text-center">
          {[
            ['40+', 'Frameworks & Standards'],
            ['675+', 'Security Controls'],
            ['97+', 'Crosswalk Mappings'],
            ['2,000+', 'Assessment Procedures'],
            ['25+', 'AI Analysis Features'],
            ['51', 'MCP Tools'],
          ].map(([val, label]) => (
            <div key={label}>
              <div className="text-3xl font-bold">{val}</div>
              <div className="text-purple-200 text-xs mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">Pricing</div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">Start free. Scale as your compliance program grows. Annual billing saves 20%.</p>
            <div className="inline-flex items-center mt-8 bg-gray-100 rounded-full p-1 gap-1">
              <button
                type="button"
                onClick={() => setBillingCycle('monthly')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setBillingCycle('annual')}
                className={`px-5 py-2 rounded-full text-sm font-medium transition-all ${
                  billingCycle === 'annual'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500'
                }`}
              >
                Annual <span className="text-green-600 font-semibold">Save 20%</span>
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
            {[
              {
                name: 'Community',
                monthlyPrice: '$0',
                annualPrice: '$0',
                monthlyPeriod: 'forever',
                annualPeriod: 'forever',
                annualNote: null,
                description: 'Self-hosted under AGPL v3. Ideal for evaluation and small teams.',
                features: [
                  'Up to 2 frameworks',
                  'Core security controls',
                  'AI-assisted assessments',
                  'Basic evidence collection',
                  'Community support',
                  'Full source code access',
                ],
                cta: 'Get Started Free',
                href: '/register',
                highlighted: false,
                badge: null,
              },
              {
                name: 'Pro',
                monthlyPrice: '$499',
                annualPrice: '$4,990',
                monthlyPeriod: '/month',
                annualPeriod: '/year',
                annualNote: '$416/mo billed annually',
                annualCost: 'Equivalent to $416/mo billed annually',
                description: 'Hosted SaaS for growing teams. Unlimited frameworks, SSO, 48-hour SLA.',
                features: [
                  'Unlimited frameworks',
                  'Full AI copilot & analysis',
                  'CMDB + AI governance',
                  'Audit-ready exports',
                  'SSO (SAML / OIDC)',
                  '48-hour support SLA',
                ],
                cta: 'Start Free Trial',
                href: '/register?plan=pro',
                highlighted: true,
                badge: 'Most Popular',
              },
              {
                name: 'Enterprise',
                monthlyPrice: 'Custom',
                annualPrice: 'Custom',
                monthlyPeriod: '',
                annualPeriod: '',
                annualNote: '$3,500 – $12,000 / month',
                annualCost: '$3,500 – $12,000 / month based on scope',
                description: 'White-glove onboarding, dedicated CSM, custom SLAs, and advanced AI governance.',
                features: [
                  'Everything in Pro',
                  'AI impact assessment (ISO 42005)',
                  'Auditor workspace',
                  'Custom SLAs',
                  'Dedicated CSM',
                  'TPRM module',
                  'Priority support',
                ],
                cta: 'Contact Sales',
                href: '/register?plan=enterprise',
                highlighted: false,
                badge: null,
              },
              {
                name: 'Gov Cloud',
                monthlyPrice: 'Custom',
                annualPrice: 'Custom',
                monthlyPeriod: '',
                annualPeriod: '',
                annualNote: 'Custom contract',
                annualCost: 'Custom contract — contact sales',
                description: 'FedRAMP-ready, IL4/IL5, ITAR-compliant. Dedicated infrastructure for regulated environments.',
                features: [
                  'Everything in Enterprise',
                  'FedRAMP / FISMA / StateRAMP',
                  'IL4 / IL5 data sovereignty',
                  'ITAR-compliant hosting',
                  'Dedicated infrastructure',
                  'SLA-backed uptime guarantee',
                  'MCP server access',
                ],
                cta: 'Contact Sales',
                href: '/register?plan=govcloud',
                highlighted: false,
                badge: 'Regulated',
              },
            ].map((tier) => (
              <div
                key={tier.name}
                className={`rounded-2xl border p-6 flex flex-col ${tier.highlighted ? 'border-purple-500 bg-purple-50 shadow-xl shadow-purple-100' : 'border-gray-200 bg-white'}`}
              >
                {tier.badge && (
                  <div className={`text-xs font-semibold px-3 py-1 rounded-full self-start mb-4 ${tier.highlighted ? 'text-purple-700 bg-purple-200' : 'text-indigo-700 bg-indigo-100'}`}>{tier.badge}</div>
                )}
                <h3 className="text-lg font-bold text-gray-900 mb-1">{tier.name}</h3>
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-extrabold text-gray-900">
                    {billingCycle === 'annual' ? tier.annualPrice : tier.monthlyPrice}
                  </span>
                  <span className="text-gray-500 text-sm">
                    {billingCycle === 'annual' ? tier.annualPeriod : tier.monthlyPeriod}
                  </span>
                </div>
                {tier.annualCost && billingCycle === 'annual' && (
                  <p className="text-xs text-gray-400 mb-1">{tier.annualCost}</p>
                )}
                <p className="text-gray-600 text-sm mb-5">{tier.description}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-gray-700">
                      <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href={withBilling(tier.href)}
                  className={`block text-center py-3 rounded-xl font-semibold text-sm transition-colors ${tier.highlighted ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90' : 'border border-purple-600 text-purple-600 hover:bg-purple-50'}`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-gray-500 mt-8">All paid plans include a 14-day free trial. No credit card required to start.</p>
        </div>
      </section>

      {/* AI Features Showcase */}
      <section id="ai-features" className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
              Powered by AI
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-4">25+ AI Features That Transform Compliance</h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">From gap analysis to compliance forecasting — AI that actually understands your organization.</p>
          </div>

          {/* AI Copilot demo mockup */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center mb-16">
            <div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">Org-Aware AI Copilot</h3>
              <p className="text-gray-600 mb-6 leading-relaxed">Ask anything about your compliance posture in plain English. The AI Copilot knows your frameworks, controls, evidence gaps, and risk profile — and gives answers grounded in your actual data, not generic advice.</p>
              <ul className="space-y-3">
                {[
                  'Gap analysis across all active frameworks',
                  'Remediation playbooks tailored to your stack',
                  'Compliance forecast & risk scoring',
                  'Policy and procedure drafting',
                  'Evidence collection recommendations',
                ].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-gray-700">
                    <svg className="w-4 h-4 text-purple-600 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            {/* Copilot chat mock */}
            <div className="rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400"></div>
                  <div className="w-3 h-3 rounded-full bg-yellow-400"></div>
                  <div className="w-3 h-3 rounded-full bg-green-400"></div>
                </div>
                <span className="text-xs text-gray-500 ml-2 font-medium">ControlWeave AI Copilot</span>
              </div>
              <div className="bg-gray-950 p-5 space-y-4 min-h-[260px]">
                <div className="flex gap-3">
                  <div className="w-7 h-7 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs text-gray-300">U</span>
                  </div>
                  <div className="bg-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-200 max-w-xs">
                    What are our biggest compliance gaps before our ISO 27001 audit next month?
                  </div>
                </div>
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                  </div>
                  <div className="bg-purple-900/60 border border-purple-700/40 rounded-xl px-4 py-2.5 text-sm text-gray-100 max-w-sm">
                    <p className="font-semibold text-purple-300 mb-1">Found 3 critical gaps:</p>
                    <ol className="list-decimal list-inside space-y-1 text-gray-300">
                      <li>A.12.6 — 4 controls lack current evidence <span className="text-red-400">(stale {'>'}90d)</span></li>
                      <li>A.18.1 — Legal compliance review not documented</li>
                      <li>A.9.2 — Access review overdue for 12 accounts</li>
                    </ol>
                    <p className="mt-2 text-purple-300 text-xs">Generating remediation playbook…</p>
                  </div>
                </div>
                <div className="flex gap-3 flex-row-reverse">
                  <div className="w-7 h-7 rounded-full bg-purple-700 flex items-center justify-center flex-shrink-0">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1-1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
                  </div>
                  <div className="bg-purple-900/60 border border-purple-700/40 rounded-xl px-4 py-2.5 text-sm text-gray-100 max-w-sm">
                    <p className="text-purple-300 text-xs font-semibold mb-1">Remediation Plan (Priority Order)</p>
                    <p className="text-gray-300 text-xs">1. Run access review for 12 flagged accounts this week. 2. Upload updated legal review doc to A.18.1 evidence vault. 3. Refresh 4 stale evidence artifacts in A.12.6. Estimated audit readiness: <span className="text-green-400 font-semibold">94%</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* AI feature cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
            {[
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
                title: 'AI Gap Analysis',
                desc: 'Instant identification of compliance gaps across all active frameworks with prioritized remediation steps.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
                title: 'Compliance Forecasting',
                desc: 'Predict your compliance posture 30, 60, and 90 days out based on current evidence trends and control drift.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg>,
                title: 'Policy Drafting',
                desc: 'Generate NIST-aligned policies and procedures from scratch using your org context as source of truth.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>,
                title: 'Evidence Intelligence',
                desc: 'AI reviews uploaded evidence for quality, relevance, and freshness — flagging issues before auditors do.',
              },
              {
                icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#7e22ce" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>,
                title: 'Smart Evidence Collection',
                desc: 'AI scans connected integrations, maps logs to framework controls, and suggests evidence items for your approval — no manual hunting.',
              },
            ].map((f) => (
              <div key={f.title} className="p-6 rounded-2xl border border-gray-100 bg-white hover:border-purple-200 hover:shadow-lg hover:shadow-purple-50/40 transition-all">
                <div className="w-11 h-11 bg-purple-100 rounded-xl flex items-center justify-center mb-4">{f.icon}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">{f.title}</h3>
                <p className="text-gray-600 text-xs leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MCP — Model Context Protocol */}
      <section id="mcp" className="py-20 px-4 sm:px-6 lg:px-8" style={{background: 'linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)'}}>
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-14">
            <div className="inline-flex items-center gap-2 bg-white/10 text-purple-200 px-4 py-1.5 rounded-full text-sm font-semibold mb-4 border border-white/10">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17H7A5 5 0 0 1 7 7h2"/><path d="M15 7h2a5 5 0 1 1 0 10h-2"/><line x1="8" x2="16" y1="12" y2="12"/></svg>
              Model Context Protocol (MCP)
            </div>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Control Your GRC Stack from Any AI Assistant</h2>
            <p className="text-lg text-purple-200 max-w-2xl mx-auto">
              ControlWeave ships a native MCP server — connect Claude, Cursor, GitHub Copilot, Continue.dev, Windsurf, or any MCP-compatible AI to your live compliance data in minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-start">
            {/* Left: what it does + install */}
            <div className="space-y-8">
              <div>
                <h3 className="text-xl font-bold text-white mb-4">What You Can Do via MCP</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Query live controls & evidence', desc: 'Ask Claude "What controls are failing in NIST 800-53?" and get real-time data from your org.' },
                    { label: 'Run AI gap analysis', desc: 'Trigger compliance gap analysis and receive a structured report directly in your IDE or chat.' },
                    { label: 'Manage POA&Ms', desc: 'Create, update, and close Plan of Action & Milestones without leaving your AI assistant.' },
                    { label: 'Govern third-party AI vendors', desc: 'Query AI vendor assessments, concentration risk, supply-chain components, and open incidents.' },
                    { label: 'Trigger auto-crosswalk', desc: "Propagate a control's implemented status across all related frameworks in one MCP call." },
                  ].map((item) => (
                    <div key={item.label} className="flex items-start gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3">
                      <svg className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      <div>
                        <span className="text-sm font-semibold text-white">{item.label}</span>
                        <p className="text-xs text-purple-300 mt-0.5">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-xl font-bold text-white mb-4">Quick Install — Claude Desktop</h3>
                <p className="text-purple-300 text-sm mb-4">Add this to your <code className="bg-white/10 px-1.5 py-0.5 rounded text-purple-200 font-mono text-xs">claude_desktop_config.json</code>:</p>
                <div className="bg-gray-950 rounded-xl border border-white/10 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-white/10 bg-gray-900/50">
                    <span className="text-xs text-gray-400 font-mono">claude_desktop_config.json</span>
                    <span className="text-xs text-purple-400">JSON</span>
                  </div>
                  <pre className="p-4 text-xs text-green-300 overflow-x-auto leading-relaxed font-mono">{`{
  "mcpServers": {
    "controlweave": {
      "command": "node",
      "args": ["/path/to/controlweave/backend/scripts/mcp-server.js"],
      "env": {
        "GRC_API_BASE_URL": "https://your-api.controlweave.com/api/v1",
        "GRC_API_TOKEN": "your-jwt-token"
      }
    }
  }
}`}</pre>
                </div>
                <p className="text-purple-400 text-xs mt-3">Restart Claude Desktop — the ControlWeave tools appear automatically in the tool picker.</p>
              </div>
            </div>

            {/* Right: MCP tool usage demo */}
            <div className="space-y-4">
              <h3 className="text-xl font-bold text-white mb-4">51 GRC Tools, One Connection</h3>
              <div className="bg-gray-950 rounded-2xl border border-white/10 overflow-hidden">
                <div className="bg-gray-900/50 px-4 py-3 flex items-center gap-2 border-b border-white/10">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/70"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70"></div>
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/70"></div>
                  </div>
                  <span className="text-xs text-gray-400 ml-2 font-mono">Claude + ControlWeave MCP</span>
                </div>
                <div className="p-5 space-y-3 font-mono text-xs">
                  {/* Tool call examples */}
                  {[
                    { tool: 'grc_get_dashboard_stats', result: '{ compliance: 87%, frameworks: 4, open_poams: 3 }', color: 'text-blue-300' },
                    { tool: 'ai_governance_list_vendors', args: 'risk_level: "high"', result: '3 high-risk AI vendors, 1 open incident', color: 'text-yellow-300' },
                    { tool: 'grc_trigger_crosswalk_inherit', args: 'control_id: "AC-2"', result: '4 related controls auto-satisfied ✓', color: 'text-green-300' },
                    { tool: 'threat_intel_list_items', args: 'min_cvss: 9', result: '2 critical CVEs affecting your assets', color: 'text-red-300' },
                    { tool: 'reports_generate_compliance', args: 'NIST 800-53, PDF', result: 'Report ready — 94% controls satisfied', color: 'text-green-300' },
                  ].map((ex, i) => (
                    <div key={i} className="border border-white/5 rounded-lg p-3 bg-white/5">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-purple-400">⚡</span>
                        <span className="text-purple-300 font-semibold">{ex.tool}</span>
                        {ex.args && <span className="text-gray-500">({ex.args})</span>}
                      </div>
                      <div className="flex items-start gap-2 pl-4">
                        <span className="text-gray-600">→</span>
                        <span className={ex.color}>{ex.result}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                {[
                  { num: '51', label: 'MCP Tools' },
                  { num: 'OWASP', label: 'Secure by Default' },
                  { num: 'JWT', label: 'Auth Protected' },
                ].map((s) => (
                  <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl py-4">
                    <div className="text-lg font-bold text-white">{s.num}</div>
                    <div className="text-xs text-purple-300 mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <Link href="/contact" className="inline-block bg-white text-purple-900 px-8 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors mr-4">
              Get MCP Access
            </Link>
            <Link href="/register" className="inline-block border border-white/30 text-white px-8 py-3 rounded-xl font-semibold hover:bg-white/10 transition-colors">
              Start Free
            </Link>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-gray-50">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Start your compliance program today</h2>
          <p className="text-gray-600 mb-8">Free tier includes 2 frameworks, core controls, and AI-assisted assessments. No credit card required.</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link href="/register" className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-8 py-3 rounded-xl font-semibold hover:opacity-90 transition-opacity">
              Get Started Free
            </Link>
            <Link href="/login" className="border border-purple-600 text-purple-600 px-8 py-3 rounded-xl font-semibold hover:bg-purple-50 transition-colors">
              Sign In
            </Link>
            <Link href="/contact" className="border border-gray-300 text-gray-700 px-8 py-3 rounded-xl font-semibold hover:border-purple-400 hover:text-purple-600 transition-colors">
              Book a Demo
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-8 px-4 text-center text-sm text-gray-500">
        <div className="flex items-center justify-center gap-2 mb-3">
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 32 32" fill="none"><rect width="32" height="32" rx="8" fill="#7e22ce"/><path d="M16 6L26 11V21L16 26L6 21V11L16 6Z" stroke="white" strokeWidth="2" fill="none"/><circle cx="16" cy="16" r="4" fill="white"/></svg>
          <span className="font-semibold text-gray-700">ControlWeave</span>
        </div>
        <div className="flex flex-wrap justify-center gap-4 mb-3">
          <Link href="/frameworks" className="hover:text-purple-600 transition-colors">Frameworks</Link>
          <Link href="/blog" className="hover:text-purple-600 transition-colors">Blog</Link>
          <Link href="/contact" className="hover:text-purple-600 transition-colors">Contact</Link>
          <Link href="/privacy" className="hover:text-purple-600 transition-colors">Privacy</Link>
          <Link href="/login" className="hover:text-purple-600 transition-colors">Sign In</Link>
          <Link href="/register" className="hover:text-purple-600 transition-colors">Register</Link>
        </div>
        <p className="text-gray-400">&copy; {new Date().getFullYear()} ControlWeave. AI-Native GRC &amp; Compliance Management.</p>
      </footer>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const { user, isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && isAuthenticated) {
      const mustCompleteOnboarding = requiresOrganizationOnboarding(user) && !user?.onboardingCompleted;
      if (mustCompleteOnboarding) {
        router.push('/onboarding');
        return;
      }

      // If there's a pending billing plan, go directly to checkout
      const pendingPlan = typeof window !== 'undefined'
        ? String(localStorage.getItem('pendingPlan') || '')
        : '';
      if (pendingPlan.length > 0) {
        router.push(`/billing/checkout?plan=${encodeURIComponent(pendingPlan)}`);
        return;
      }

      // Server-side billing gate: if the user has a paid tier but no valid
      // subscription (and no active trial), send them to billing resolution.
      if (requiresBillingResolution(user)) {
        router.push('/billing/resolve');
        return;
      }

      if (String(user?.role || '').toLowerCase() === 'auditor') {
        router.push('/dashboard/auditor-workspace');
      } else {
        router.push('/dashboard');
      }
    }
  }, [user, isAuthenticated, loading, router]);

  if (loading || isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
      </div>
    );
  }

  return <LandingPage />;
}
