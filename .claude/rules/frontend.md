# Frontend rendering

## AI output

- Render markdown with `<MarkdownContent>` from `components/ai/MarkdownContent`. Never use `dangerouslySetInnerHTML`.
- Render structured (schema-validated) AI output with `<StructuredOutput feature={...} data={data.structured} />`.
- Links are restricted to `http`, `https`, `mailto`, `tel`. Other schemes render as plain text.

## Accessibility

- Use semantic list markup (`<ul role="list">` / `<li role="listitem">`) for gap and procedure rows.
- Bind `<label htmlFor>` to interactive checkboxes in test-procedure rendering.
- Provide `aria-label` for progress bars and severity chips.

## README ↔ website stats sync

The marketing homepage's platform-scale numbers (frameworks, controls,
crosswalk mappings, MCP tool count, Node/PostgreSQL version floors) come from
`src/lib/platformStats.ts`, not hardcoded strings on the page — that file is
the single source of truth. README.md states the same numbers in prose.
`npm run check:readme-sync` (`scripts/check-readme-website-sync.js`, run in
CI in `security.yml` alongside `check:links`) parses both and fails when
they disagree. When a stat changes, update `platformStats.ts` and the
corresponding README.md line together — the check tells you if you only did
one.

## State

- Use the existing `useAuth()` context for user / organization data.
- Token storage goes through `lib/tokenStore` — never read `localStorage` directly.
- API calls use `getApiBaseUrl()` from `lib/apiBase`.
