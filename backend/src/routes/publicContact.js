const express = require('express')
const router = express.Router()
const { validateBody, requireFields, sanitizeInput } = require('../middleware/validate')
const { createRateLimiter } = require('../middleware/rateLimit')
const {
  DEMO_ADMIN_ACCOUNTS,
  resolveDemoAccountPassword
} = require('../../scripts/lib/demo-account-config')
const {
  sendDemoAccountDeliveryEmail,
  sendSalesFollowUpEmail
} = require('../services/emailService')

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DEMO_ACCOUNT_BY_TIER = Object.freeze(
  Object.fromEntries(
    DEMO_ADMIN_ACCOUNTS.map((account) => [account.tier, account.email])
  )
)

const LEGACY_TIER_ALIASES = Object.freeze({
  free: 'community',
  starter: 'pro',
  professional: 'pro',
  utilities: 'govcloud'
})

function normalizeTier(value) {
  const tier = String(value || '').trim().toLowerCase()
  const normalizedTier = LEGACY_TIER_ALIASES[tier] || tier
  if (DEMO_ACCOUNT_BY_TIER[normalizedTier]) return normalizedTier
  return 'pro'
}

function isValidEmail(value) {
  return EMAIL_REGEX.test(String(value || '').trim().toLowerCase())
}

function formatTierLabel(tier) {
  switch (String(tier || '').trim().toLowerCase()) {
    case 'community': return 'Community'
    case 'pro': return 'Pro'
    case 'enterprise': return 'Enterprise'
    case 'govcloud': return 'Gov Cloud & Advisory'
    default: return String(tier || 'Pro')
  }
}

// Unauthenticated endpoint — strict per-IP limit to stop credential-farming
// and contact-form spam.
const publicContactLimiter = createRateLimiter({
  label: 'public-contact',
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: (req) => req.ip
})

// Demo credential delivery is opt-in: it requires BOTH the explicit enable
// flag and a configured password. Without them the prospect gets the sales
// follow-up email instead — working credentials are never emailed based on
// the repo's built-in default password.
function demoAccountDeliveryEnabled() {
  return String(process.env.DEMO_ACCOUNT_DELIVERY_ENABLED || '').toLowerCase() === 'true'
    && String(process.env.DEMO_ACCOUNT_PASSWORD || '').trim().length > 0
}

router.post(
  '/contact',
  publicContactLimiter,
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
      const requestedTier = normalizeTier(req.body.requestedTier)
      const requestedTierLabel = formatTierLabel(requestedTier)
      const wantsDemoAccount = req.body.wantsDemoAccount !== false && demoAccountDeliveryEnabled()

      const demoAccountEmail = DEMO_ACCOUNT_BY_TIER[requestedTier]
      const appUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
      const bookingUrl = process.env.SALES_BOOKING_URL || appUrl + '/contact'

      const valueBullets = [
        'Review framework coverage for your target compliance scope',
        'Walk through control + evidence workflows with audit trails',
        'Validate tier fit based on your current maturity and team needs'
      ]

      const leadSummary = [
        `Inbound contact request from ${name} (${email})`,
        company ? `Company: ${company}` : null,
        `Requested tier: ${requestedTierLabel}`,
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
