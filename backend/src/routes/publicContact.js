const express = require('express')
const router = express.Router()
const { validateBody, requireFields, sanitizeInput } = require('../middleware/validate')
const {
  DEMO_ACCOUNT_BY_INDUSTRY,
  DEFAULT_DEMO_ACCOUNT_EMAIL,
  resolveDemoAccountPassword
} = require('../../scripts/lib/demo-account-config')
const {
  sendDemoAccountDeliveryEmail,
  sendSalesFollowUpEmail
} = require('../services/emailService')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// The demo roster is keyed by industry now that tiers are gone. Prospects who
// still submit an old tier name are mapped onto the industry account that used
// to serve that tier, so historical marketing links keep working.
const LEGACY_TIER_TO_INDUSTRY = Object.freeze({
  free: 'technology',
  community: 'technology',
  starter: 'healthcare',
  pro: 'healthcare',
  professional: 'healthcare',
  enterprise: 'financial',
  utilities: 'energy',
  govcloud: 'defense'
})

/**
 * Resolves a prospect's requested vertical to a demo login. Always returns a
 * real address — an unknown value falls back to the default demo account
 * rather than emailing out an undefined credential.
 */
function resolveDemoSelection(value) {
  const requested = String(value || '').trim().toLowerCase()
  const industryKey = LEGACY_TIER_TO_INDUSTRY[requested] || requested
  const email = DEMO_ACCOUNT_BY_INDUSTRY[industryKey]
  if (email) return { key: industryKey, email }
  return { key: 'technology', email: DEMO_ACCOUNT_BY_INDUSTRY.technology || DEFAULT_DEMO_ACCOUNT_EMAIL }
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(String(value || '').trim().toLowerCase())
}

const INDUSTRY_LABELS = Object.freeze({
  financial: 'Financial Services',
  healthcare: 'Healthcare',
  defense: 'Defense & Government Contracting',
  technology: 'Technology / SaaS',
  energy: 'Energy & Utilities',
  retail: 'Retail & E-commerce',
  pharma: 'Pharmaceuticals & Life Sciences',
  education: 'Higher Education',
  auditfirm: 'Audit & Assurance Firm'
})

function formatIndustryLabel(industryKey) {
  return INDUSTRY_LABELS[String(industryKey || '').trim().toLowerCase()] || 'Technology / SaaS'
}

router.post(
  '/contact',
  validateBody((body) => {
    const errors = requireFields(body, ['name', 'email', 'message'])

    if (body.email && !isValidEmail(body.email)) {
      errors.push('email must be a valid email address')
    }

    const message = String(body.message || '')
    if (message.length > 4000) {
      errors.push('message must be 4000 characters or fewer')
    }

    return errors
  }),
  async (req, res) => {
    try {
      const name = String(sanitizeInput(req.body.name) || '').trim()
      const email = String(sanitizeInput(req.body.email) || '').trim().toLowerCase()
      const company = String(sanitizeInput(req.body.company || '') || '').trim()
      const message = String(sanitizeInput(req.body.message || '') || '').trim()
      const selection = resolveDemoSelection(req.body.requestedIndustry || req.body.requestedTier)
      const requestedTier = selection.key
      const requestedTierLabel = formatIndustryLabel(selection.key)
      const wantsDemoAccount = req.body.wantsDemoAccount !== false

      const demoAccountEmail = selection.email
      const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const bookingUrl = process.env.SALES_BOOKING_URL || appUrl + '/contact'

      const valueBullets = [
        'Review framework coverage for your target compliance scope',
        'Walk through control + evidence workflows with audit trails',
        'Validate framework fit based on your industry and current maturity'
      ]

      const leadSummary = [
        `Inbound contact request from ${name} (${email})`,
        company ? `Company: ${company}` : null,
        `Requested industry demo: ${requestedTierLabel}`,
        `Wants demo account: ${wantsDemoAccount ? 'yes' : 'no'}`,
        '',
        'Message:',
        message
      ].filter(Boolean).join('\n')

      await sendSalesFollowUpEmail({
        toEmail: process.env.SALES_INBOX_EMAIL || 'contehconsulting@gmail.com',
        prospectName: 'Sales Team',
        companyName: company || 'Inbound Prospect',
        painPoint: leadSummary,
        ctaLabel: 'Follow up with prospect',
        ctaUrl: `mailto:${email}`
      }).catch(() => {})

      if (wantsDemoAccount) {
        await sendDemoAccountDeliveryEmail({
          toEmail: email,
          prospectName: name,
          accountEmail: demoAccountEmail,
          accountPassword: resolveDemoAccountPassword({
            value: process.env.DEMO_ACCOUNT_PASSWORD,
            label: 'DEMO_ACCOUNT_PASSWORD'
          }),
          loginUrl: `${appUrl}/login`,
          tierName: requestedTierLabel,
          valueBullets,
          ctaLabel: 'Book a guided 20-minute demo',
          ctaUrl: bookingUrl
        }).catch(() => {})
      } else {
        await sendSalesFollowUpEmail({
          toEmail: email,
          prospectName: name,
          companyName: company || 'your team',
          painPoint: 'mapping the right ControlWeave tier to your compliance objectives',
          ctaLabel: 'Book a guided 20-minute demo',
          ctaUrl: bookingUrl
        }).catch(() => {})
      }

      res.status(201).json({
        success: true,
        data: {
          message: 'Contact request received',
          tier: requestedTier,
          industry: requestedTier,
          demo_account_email: wantsDemoAccount ? demoAccountEmail : null,
          onboarding_required: false
        }
      })
    } catch (error) {
      console.error('Public contact request error:', error)
      res.status(500).json({ success: false, error: 'Failed to submit contact request' })
    }
  }
)

module.exports = router
