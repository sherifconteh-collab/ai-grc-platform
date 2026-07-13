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
   ```
   For `frontend/`, use a **full** `npm install` (not `--package-lock-only`) — the frontend
   depends on multi-platform native packages (`lightningcss`, `@tailwindcss/oxide`, `sharp`,
   `unrs-resolver`) that the Windows/macOS/Linux Electron release build all need. Lockfile-only
   mode silently drops every platform variant except the one it ran on, which broke v4.3.0's
   release (shipped with zero installer assets). Verify with
   `node scripts/check-lockfile-platforms.js` (also enforced by CI in `build-release.yml`):
   ```
   cd ../frontend && npm install && node scripts/check-lockfile-platforms.js
   ```
5. Validate:
   ```
   cd backend && npm run check:syntax && npx jest && npm audit --audit-level=moderate
   cd ../frontend && npm run typecheck && npm audit --audit-level=moderate
   ```
6. Commit with message `release: vX.Y.Z` and push.
7. After merge to `main`, tag `vX.Y.Z` to trigger `build-release.yml`.
