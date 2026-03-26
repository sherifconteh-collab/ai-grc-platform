const MIN_PASSWORD_LENGTH = 15
const PASSWORD_COMPLEXITY_ERROR_MESSAGE = 'password must include uppercase, lowercase, number, and special character'

/**
 * Returns true when the password includes uppercase, lowercase, digit,
 * and special-character requirements used by ControlWeave password policies.
 *
 * @param {string} password
 * @returns {boolean}
 */
function hasRequiredPasswordComplexity(password) {
  const value = String(password || '')
  return /[A-Z]/.test(value)
    && /[a-z]/.test(value)
    && /\d/.test(value)
    && /[^A-Za-z0-9]/.test(value)
}

module.exports = {
  MIN_PASSWORD_LENGTH,
  PASSWORD_COMPLEXITY_ERROR_MESSAGE,
  hasRequiredPasswordComplexity
}
