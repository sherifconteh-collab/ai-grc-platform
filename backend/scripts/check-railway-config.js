// @tier: community
const { log } = require('../src/utils/logger')

function checkRailwayConfig() {
  if (!process.env.RAILWAY_ENVIRONMENT && !process.env.RAILWAY_ENVIRONMENT_NAME) {
    return
  }

  log('info', 'railway.runtime.detected')

  if (process.env.RAILWAY_DEPLOYMENT_MODE === 'serverless') {
    log('error', 'railway.runtime.serverless_critical', {
      message: 'Application is running in serverless mode. Switch to Web Service mode in Railway settings.',
      impact: 'Billing scheduler, trial expiration, and reminders will not run in serverless mode.'
    })
  } else {
    log('info', 'railway.runtime.web_service_ok')
  }

  const requiredVars = [
    'STRIPE_SECRET_KEY',
    'STRIPE_PUBLISHABLE_KEY',
    'STRIPE_WEBHOOK_SECRET'
  ]

  const missing = requiredVars.filter((varName) => !process.env[varName])

  if (missing.length > 0) {
    log('error', 'railway.stripe_config.missing', { missing })
  } else {
    log('info', 'railway.stripe_config.verified')
  }

  if (process.env.APP_URL) {
    log('info', 'railway.marketing.app_url_configured', { appUrl: process.env.APP_URL })
  } else {
    log('warn', 'railway.marketing.app_url_missing')
  }
}

module.exports = checkRailwayConfig
