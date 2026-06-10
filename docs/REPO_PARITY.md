# Repo Parity: ControlWeaver-Pro and ai-grc-platform

The `sherifconteh-collab/ControlWeaver-Pro` (`controlweave/`) and
`sherifconteh-collab/ai-grc-platform` backends are near-duplicate codebases.
Most route, service, and middleware files are intended to be functionally
identical. They are synced manually, which has caused security fixes to land
in one repo but not the other.

## Why this file exists

A June 2026 review found ControlWeaver-Pro had drifted behind ai-grc-platform
on several hardening items that ai-grc-platform already had:

- `middleware/auth.js` was calling `jwt.verify` without the
  `JWT_VERIFY_OPTIONS` algorithm allow-list.
- Four password-hash call sites used bcrypt cost 12 instead of 14.
- TPRM public HMAC verification accepted only SHA-256 (sibling accepts
  SHA-384 + legacy SHA-256).

All three are now fixed, but the process gap remains: **when you land a
security or correctness fix in shared code in one repo, port it to the other
in the same working session.**

## Known intentional deltas

| Area | ControlWeaver-Pro | ai-grc-platform |
|---|---|---|
| JWT signing algorithm | HS256 | HS384 (CNSA 1.0), HS256 accepted during rotation |
| Evidence integrity hash | SHA-256 (`computeFileSha256`) | SHA-384 (`computeFileHash`) |
| Extra routes | `scheduledReports.js` | `integrations.js`, `openclawWebhook.js`, `settings.js` |
| Logging convention | structured `log()` from `utils/logger` preferred | `console.*` blessed (observability layer hooks it) |
| Desktop wrapper | none | Electron |
| Migration numbering | independent sequence (110+) | independent sequence (116+) |
| Monolith splits | `routes/assessments/*`, `routes/organizations/*` sub-routers | single-file routes (split not yet ported) |
| Console bridge | `installConsoleBridge()` rewires console.error/warn to the structured logger | raw `console.*` blessed (observability layer hooks it) |

Migration numbers are repo-local. The same schema change gets a different
number in each repo (e.g. evidence expiration is 110 in ControlWeaver-Pro and
116 in ai-grc-platform).

## Sync checklist for shared-code changes

1. Make the change in the primary repo; run `npm run check:syntax` and
   `npx jest`.
2. Check whether the target file diverges:
   `diff <pro-file> <ai-grc-file>` — most differ only in the deltas above.
3. Port the change, preserving each repo's local conventions (hash algorithm,
   logging style).
4. If the change needs a migration, create it with each repo's own next
   sequential number.
5. Run both repos' validation before pushing either.
