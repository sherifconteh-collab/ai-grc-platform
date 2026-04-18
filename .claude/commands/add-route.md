# /add-route

For non-AI Express routes.

1. Create `backend/src/routes/<name>.js` with `// @tier: community` header.
2. Pull middleware: `authenticate`, `requirePermission(...)`, `validateBody(fn)`, `createOrgRateLimiter({...})`.
3. Use parameterized queries: `pool.query('SELECT ... WHERE id = $1', [id])`. Never interpolate user input into SQL.
4. Derive `userId` / `organizationId` from `req.user`, never from `req.body`.
5. Wrap handlers in `try / catch`; respond `5xx` with a generic error message and `console.error` the original.
6. Register the router in `backend/src/server.js` next to similar routes.
7. Add a smoke test if the route handles security-sensitive data.
