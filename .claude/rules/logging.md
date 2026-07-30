# Logging

- Use `log('level', 'event.name', { ... })` from `utils/logger` in new routes and
  services. **This repo has no console bridge** — unlike the sibling
  ControlWeaver-Pro repo, nothing here reassigns `console.error`/`console.warn`,
  so a direct `console.*` call goes to stdout only and never reaches the
  structured log stream or Sentry. The many existing `console.error` call sites
  are legacy; do not add more.
- Event names are stable identifiers used for alerting, so prefer
  `resource.action_failed` over a prose sentence, and pass the error through
  `serializeError(error)` rather than interpolating it into the message.
- Never log PII, API keys, password hashes, or full JWT tokens.
- For audit-grade events use `auditService.logFromRequest(req, { ... })`.
- For AI usage / decisions use `llm.logAIUsage(...)` and `llm.logAIDecision(...)`.
- Hash sensitive request bodies before passing to `logAIDecision` (the helper does SHA-256 internally — pass the raw text).
