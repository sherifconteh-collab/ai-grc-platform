const Stripe = require('stripe')
const { log } = require('../utils/logger')

const stripe = process.env.STRIPE_SECRET_KEY
  ? Stripe(process.env.STRIPE_SECRET_KEY)
  : null

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

const verifyStripeConfig = () => {
  const requiredVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ]

  const missing = requiredVars.filter((varName) => !process.env[varName])

  if (missing.length > 0) {
    log('error', 'stripe.config.missing_env', {
      missing,
      note: 'Please set these variables in your Railway environment'
    })
  } else {
    log('info', 'stripe.config.verified')
  }
}

verifyStripeConfig()

module.exports = {
  stripe,
  webhookSecret,
  verifyStripeConfig
}
