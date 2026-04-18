# Security defaults

These thresholds are part of the v3.0.0 contract. Lowering any of them is a breaking change.

## Authentication

- `jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] })` — always pass the algorithm allow-list.
- `bcrypt.hash(password, BCRYPT_COST)` where `BCRYPT_COST >= 14`.
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
