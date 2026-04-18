# /bump-version

Use when shipping a release. Single commit, all four files in lock-step.

1. Decide the new version following SemVer (`MAJOR.MINOR.PATCH`).
2. Update:
   - `backend/package.json` `version`
   - `frontend/package.json` `version`
   - `electron/package.json` `version`
3. Prepend a new section to `RELEASE_NOTES.md`:
   ```
   ## [X.Y.Z] — YYYY-MM-DD
   ### Added / Changed / Fixed / Security
   ```
4. Regenerate lockfiles:
   ```
   cd backend && npm install --package-lock-only
   cd ../frontend && npm install --package-lock-only
   ```
5. Validate:
   ```
   cd backend && npm run check:syntax && npx jest && npm audit --audit-level=moderate
   cd ../frontend && npm run typecheck && npm audit --audit-level=moderate
   ```
6. Commit with message `release: vX.Y.Z` and push.
7. After merge to `main`, tag `vX.Y.Z` to trigger `build-release.yml`.
