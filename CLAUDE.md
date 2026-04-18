# CLAUDE.md

Operating manual for Claude (and Copilot) agents working in this repository.
Skim this file before any non-trivial change. Detailed conventions live under
`.claude/rules/`; reusable playbooks live under `.claude/commands/`.

## Quick orientation

- **Repo**: ControlWeave (AI-GRC) Community fork.
- **Stack**: Node.js (Express) backend, Next.js (App Router, React 19) frontend, Electron desktop wrapper.
- **Tier markers**: every server-side source file declares `// @tier: community` or `// @tier: pro`. The Community fork must never depend on `@tier: pro` code paths.
- **Releases**: `RELEASE_NOTES.md` is the source of truth for version state. `backend`, `frontend`, and `electron` `package.json` versions stay in lock-step with the latest entry.

## Validation commands

| Layer | Command | Notes |
|---|---|---|
| Backend syntax | `cd backend && npm run check:syntax` | Fastest gate; runs in seconds. Always run after backend edits. |
| Backend build | `cd backend && npm run build` | Per-module require check; use after structural changes. |
| Backend audit | `cd backend && npm audit --audit-level=moderate` | CI gate. Low-severity findings in `firebase-admin` transitive chain are accepted. |
| Backend tests | `cd backend && npx jest` | Unit-only; no DB required. |
| Frontend typecheck | `cd frontend && npm run typecheck` | TS strict. |
| Frontend audit | `cd frontend && npm audit --audit-level=moderate` | CI gate. |
| Frontend e2e | `cd frontend && npx playwright test` | Manual `workflow_dispatch` only. |

## Non-negotiables

1. **Never** weaken security defaults: `bcrypt` cost stays ≥ 14, `jwt.verify` always passes `algorithms: ['HS256']`.
2. **Never** introduce `dangerouslySetInnerHTML` in the frontend; use `MarkdownContent` for AI output rendering.
3. **Never** add raw SQL string interpolation in routes; use parameterized queries via `pool.query`.
4. **Never** commit secrets; pull from env or `llm_configurations` (encrypted).
5. **Always** keep `RELEASE_NOTES.md` and the three `package.json` versions in sync when bumping.

## Where to look for things

- AI feature handlers → `backend/src/routes/ai.js` (see `aiHandler()`)
- LLM provider plumbing → `backend/src/services/llmService.js`
- Schema validation + retry → `backend/src/services/llmSchemas.js`
- Few-shot exemplars → `backend/src/services/aiExemplars/`
- Quality gate scoring → `backend/src/services/aiQualityGate.js`
- Mobile push tokens → `backend/src/routes/pushTokens.js` + migration `104`
- Migrations → `backend/migrations/NNN_<name>.sql` (sequential, never re-numbered)

See `.claude/rules/*.md` for granular conventions.
