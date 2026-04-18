# /update-deps

1. Identify the target package(s) and the desired version range.
2. Run `gh-advisory-database` (via the agent tool) on the target version to confirm no known vulnerabilities.
3. Edit `package.json` to bump the dependency. For transitive vulns, use `overrides` with the most permissive safe range (`>=X.Y.Z`).
4. Regenerate the lockfile: `npm install --package-lock-only` (or full `npm install` if a fresh tree is needed).
5. Verify: `npm audit --audit-level=moderate` must exit 0.
6. Backend: `npm run check:syntax` + `npx jest`. Frontend: `npm run typecheck`.
7. Commit with `chore(deps): bump <pkg> to <ver>` and update RELEASE_NOTES if the bump is shipping.
