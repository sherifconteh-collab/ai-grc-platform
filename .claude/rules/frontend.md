# Frontend rendering

## AI output

- Render markdown with `<MarkdownContent>` from `components/ai/MarkdownContent`. Never use `dangerouslySetInnerHTML`.
- Render structured (schema-validated) AI output with `<StructuredOutput feature={...} data={data.structured} />`.
- Links are restricted to `http`, `https`, `mailto`, `tel`. Other schemes render as plain text.

## Accessibility

- Use semantic list markup (`<ul role="list">` / `<li role="listitem">`) for gap and procedure rows.
- Bind `<label htmlFor>` to interactive checkboxes in test-procedure rendering.
- Provide `aria-label` for progress bars and severity chips.

## State

- Use the existing `useAuth()` context for user / organization data.
- Token storage goes through `lib/tokenStore` — never read `localStorage` directly.
- API calls use `getApiBaseUrl()` from `lib/apiBase`.
