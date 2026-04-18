# /security-review

Run before merging any auth, crypto, session, or AI-prompt change.

1. **AuthN / AuthZ**
   - All `jwt.verify(...)` calls pass `{ algorithms: ['HS256'] }`.
   - All `bcrypt.hash(...)` calls use `BCRYPT_COST` (>= 14).
   - Session cookies are HTTP-only, Secure, SameSite=Strict.
   - `req.user.id` / `req.user.organization_id` are the source of truth — never read from `req.body`.
2. **SQL / NoSQL**
   - All queries use parameter placeholders (`$1`, `$2`).
   - No string interpolation into SQL.
3. **Output sanitization**
   - No `dangerouslySetInnerHTML` in React.
   - All AI markdown rendered through `<MarkdownContent>`.
   - URL allow-list (`http`, `https`, `mailto`, `tel`) is enforced.
4. **Logging**
   - No PII, secrets, or full tokens in logs.
   - High-stakes events go through `auditService.logFromRequest`.
5. **Dependencies**
   - `npm audit --audit-level=moderate` exits 0 in both backend and frontend.
   - Any transitive vuln is pinned via `overrides`.
6. **Tests**
   - Security regression tests in `backend/__tests__/security.test.js` still pass.
