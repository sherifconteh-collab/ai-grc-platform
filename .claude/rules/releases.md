# Releases

## Versioning

Calendar versioning: `YYYY.M.N` — four-digit year, month with no leading zero, and a same-month release counter starting at 0. Always three numeric components (never a bare `YYYY.M`), so the version stays valid SemVer — required by the Electron auto-updater (`electron/updater.js`), which compares versions via `electron-updater`/SemVer internally.

- First release in a given month → `N=0` (e.g. `2026.9.0` for the first release in September 2026).
- Another release in the same month → `N` = previous release's `N` + 1 (e.g. `2026.9.1`, `2026.9.2`, ...).
- A month with no release is simply skipped — there is no `2026.11.0` unless something actually ships that month.
- Adopted 2026-09, matching `ControlWeaver-Pro`'s same switch. Releases before the switch keep their original `X.Y.Z` semver numbers in `RELEASE_NOTES.md` history — not retroactively renumbered.
- This repo has no release-automation workflow (unlike `ControlWeaver-Pro`'s `release-notes.yml`) — bump the version by hand per the sync steps below.

## Version sync

Whenever you cut a release, update **all four** in the same commit:

1. `backend/package.json` `version`
2. `frontend/package.json` `version`
3. `electron/package.json` `version`
4. `RELEASE_NOTES.md` — prepend a new `## [YYYY.M.N] — YYYY-MM-DD` section

Then regenerate both lockfiles (`backend/package-lock.json`, `frontend/package-lock.json`).

## RELEASE_NOTES format

Each entry has at minimum:

```
## [YYYY.M.N] — YYYY-MM-DD

### Added
### Changed
### Fixed
### Security
```

## Tagging

After merge to `main`, tag `vYYYY.M.N` to trigger `build-release.yml` which builds the Windows `.exe` installer (and `.AppImage`, `.dmg`) and publishes to GitHub Releases. The post-release smoke is `frontend/e2e/download.spec.ts`.
