# Security defaults

These thresholds are part of the v3.0.0 contract. Lowering any of them is a breaking change.

## Authentication

- `jwt.verify(token, JWT_SECRET, JWT_VERIFY_OPTIONS)` — always pass an explicit `algorithms` allow-list. Tokens are signed **HS384** (CNSA Suite 1.0 SHA-384+ floor). The allow-list is `['HS384','HS256']` only during the rotation window so existing sessions survive; drop `'HS256'` once pre-cutover tokens have expired (≥ refresh-token TTL).
- `bcrypt.hash(password, BCRYPT_COST)` where `BCRYPT_COST >= 14` (use 14 consistently across all password-hash call sites).
- Integrity/token hashing uses **SHA-384** (`utils/encrypt.js` `sha384`/`hashToken`); lookups accept legacy SHA-256 transitionally via `tokenHashCandidates`.
- Webhook HMAC signatures use **HMAC-SHA-384** (`sha384=` prefix); inbound verification accepts legacy SHA-256 transitionally.
- Asymmetric keys ≥ RSA-3072 / P-384. License signing is **hybrid** RSA-3072 + ML-DSA-65 (CNSA 2.0 PQC, `utils/pqc.js`).
- After successful `bcrypt.compare`, call `maybeUpgradePasswordHash(userId, password, currentHash)` to lazy-rotate legacy hashes.

## Sessions / cookies

- HTTP-only, `Secure`, `SameSite=Strict` cookies in production.
- Session TTL ≤ 24h; refresh token rotation on use.

## Inputs

- All user input flows through Zod or `requireFields(...)` validators in `middleware/validate.js`.
- Never trust `req.body.userId` / `req.body.organizationId`; derive from `req.user`.

## Secrets

- Never log API keys, JWT secrets, password hashes, or PII.
- Encrypted columns: `llm_configurations.*_api_key` (use `decryptKey()`).
