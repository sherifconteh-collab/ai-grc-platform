# Logging

- Use `console.error` / `console.warn` / `console.log` directly in routes; the existing observability layer hooks into them.
- Never log PII, API keys, password hashes, or full JWT tokens.
- For audit-grade events use `auditService.logFromRequest(req, { ... })`.
- For AI usage / decisions use `llm.logAIUsage(...)` and `llm.logAIDecision(...)`.
- Hash sensitive request bodies before passing to `logAIDecision` (the helper does SHA-256 internally — pass the raw text).
