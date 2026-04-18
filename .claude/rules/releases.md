# Releases

## Version sync

Whenever you bump the version, update **all four** in the same commit:

1. `backend/package.json` `version`
2. `frontend/package.json` `version`
3. `electron/package.json` `version`
4. `RELEASE_NOTES.md` — prepend a new `## [X.Y.Z] — YYYY-MM-DD` section

Then regenerate both lockfiles (`backend/package-lock.json`, `frontend/package-lock.json`).

## SemVer

- **MAJOR** for breaking changes (e.g. bcrypt cost increase forcing rehash, new required env var, removed API).
- **MINOR** for additive features (new endpoint, new schema, new UI component).
- **PATCH** for bug fixes and dep bumps with no public-API change.

## RELEASE_NOTES format

Each entry has at minimum:

```
## [X.Y.Z] — YYYY-MM-DD

### Added
### Changed
### Fixed
### Security
```

## Tagging

After merge to `main`, tag `vX.Y.Z` to trigger `build-release.yml` which builds the Windows `.exe` installer (and `.AppImage`, `.dmg`) and publishes to GitHub Releases. The post-release smoke is `frontend/e2e/download.spec.ts`.
