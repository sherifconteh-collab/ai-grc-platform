# Testing

- Backend: Jest, `*.test.js` under `backend/__tests__/`. Unit-only — no DB hits.
- Mock `pg.Pool` explicitly when a test needs DB-touching code.
- Frontend typecheck (`npm run typecheck`) is the primary gate; component-level Jest tests are not yet wired.
- Playwright e2e: `frontend/e2e/*.spec.ts`. Manual `workflow_dispatch` only until the suite is stable.
- The `download.spec.ts` smoke test verifies the `.exe` installer asset on the latest GitHub release; run it after publishing a tag.
