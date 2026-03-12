// @tier: community
'use strict';

/**
 * Maps a CWE ID to its OWASP Top 10:2025 category.
 * Based on the official OWASP Top 10:2025 CWE mappings.
 *
 * @param {string|number|null|undefined} cweId - CWE identifier, e.g. 'CWE-89', '89', or 89
 * @returns {string|null} OWASP category code ('A01:2025'–'A10:2025') or null if unmapped
 */
function mapCweToOwasp2025(cweId) {
  if (!cweId) return null;

  // Normalize: strip 'CWE-' prefix and convert to integer
  const num = parseInt(String(cweId).replace(/^CWE-/i, ''), 10);
  if (isNaN(num)) return null;

  // A01:2025 — Broken Access Control
  if ([
    22, 23, 35, 59, 200, 201, 219, 264, 275, 276, 284, 285, 352, 359,
    377, 402, 425, 441, 497, 538, 540, 548, 552, 566, 601, 639, 651,
    668, 706, 862, 863, 922, 1275
  ].includes(num)) return 'A01:2025';
  // Note: CWE-913 is intentionally mapped to A08 (Software and Data Integrity Failures)

  // A02:2025 — Cryptographic Failures
  if ([
    261, 296, 310, 319, 321, 322, 323, 324, 325, 326, 327, 328, 329,
    330, 331, 335, 336, 337, 338, 340, 347, 523, 720, 757, 759, 760,
    780, 818, 916
  ].includes(num)) return 'A02:2025';

  // A03:2025 — Software and Data Integrity / Supply Chain Failures
  // Note: 494, 829, 830 also appear in A07 — A03 takes precedence for supply chain context
  // Note: CWE-1104 is intentionally mapped to A06 (Vulnerable and Outdated Components)
  if ([494, 829, 830, 915].includes(num)) return 'A03:2025';

  // A04:2025 — Injection
  if ([
    20, 74, 75, 77, 78, 79, 80, 83, 87, 88, 89, 90, 91, 93, 94, 95,
    96, 97, 98, 99, 100, 113, 116, 138, 184, 470, 471, 564, 610, 643,
    644, 652, 917
  ].includes(num)) return 'A04:2025';

  // A05:2025 — Security Misconfiguration
  if ([
    2, 11, 13, 15, 16, 260, 266, 269, 272, 732, 1188
  ].includes(num)) return 'A05:2025';

  // A06:2025 — Vulnerable and Outdated Components
  // (Mapped primarily by ecosystem tooling; few direct CWEs — use known ones)
  if ([1026, 1035, 1104].includes(num)) return 'A06:2025';

  // A07:2025 — Identification and Authentication Failures
  if ([
    255, 259, 287, 288, 290, 294, 295, 297, 300, 302, 304, 306, 307,
    346, 384, 521, 613, 620, 640, 798, 940, 1216
  ].includes(num)) return 'A07:2025';

  // A08:2025 — Software and Data Integrity Failures
  if ([
    345, 353, 426, 502, 565, 784, 913
  ].includes(num)) return 'A08:2025';

  // A09:2025 — Security Logging and Monitoring Failures
  if ([
    117, 223, 532, 778
  ].includes(num)) return 'A09:2025';

  // A10:2025 — Server-Side Request Forgery (SSRF)
  if ([
    918
  ].includes(num)) return 'A10:2025';

  return null;
}

/**
 * Returns the human-readable name for an OWASP Top 10:2025 category code.
 * @param {string} categoryCode - e.g. 'A04:2025'
 * @returns {string} Category name or the code itself if unknown
 */
function getOwaspCategoryName(categoryCode) {
  const names = {
    'A01:2025': 'Broken Access Control',
    'A02:2025': 'Cryptographic Failures',
    'A03:2025': 'Software and Data Integrity / Supply Chain Failures',
    'A04:2025': 'Injection',
    'A05:2025': 'Security Misconfiguration',
    'A06:2025': 'Vulnerable and Outdated Components',
    'A07:2025': 'Identification and Authentication Failures',
    'A08:2025': 'Software and Data Integrity Failures',
    'A09:2025': 'Security Logging and Monitoring Failures',
    'A10:2025': 'Server-Side Request Forgery (SSRF)',
  };
  return names[categoryCode] || categoryCode;
}

module.exports = { mapCweToOwasp2025, getOwaspCategoryName };
