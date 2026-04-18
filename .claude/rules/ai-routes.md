# AI route conventions

Every AI feature route uses `aiHandler(featureKey, fn, opts?)` from `routes/ai.js`. This wrapper handles:

1. Param resolution (provider / model / org BYOK)
2. Task-profile + temperature resolution (`llm.resolveModelAndTemperature`)
3. Forced JSON mode when a schema is registered for `featureKey`
4. Schema validation against `services/llmSchemas.js`
5. One-shot retry with Ajv-style error injection on validation failure
6. Persistence of `data.structured` in the response envelope and `ai_decision_log.structured`
7. Usage logging (`ai_usage_log`) and decision logging (`ai_decision_log`)

## Adding a new structured feature

1. Add a JSON Schema in `services/llmSchemas.js` and register it in `FEATURE_SCHEMAS`.
2. Add 2-3 exemplars in `services/aiExemplars/<feature>.json`.
3. Map the feature key in `FEATURE_TASK_PROFILE` (`llmService.js`).
4. Wire the route with `aiHandler('<feature>', async (req, params) => llm.someFn({ ...params }))`.
5. Add a renderer branch in `frontend/src/components/ai/StructuredOutput.tsx`.

## Aliases

Some legacy feature keys have aliases: `evidence_suggest` → `evidence_suggestion`, `audit_finding_draft` → `finding`. Both `FEATURE_SCHEMAS` and `EXEMPLAR_FILES` register the alias.
