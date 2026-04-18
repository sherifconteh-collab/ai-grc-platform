# /add-ai-feature

Use this playbook when adding a new structured AI feature.

1. **Schema** — define a JSON Schema in `backend/src/services/llmSchemas.js` and register it in `FEATURE_SCHEMAS`.
2. **Exemplars** — drop 2-3 curated `{input, output}` JSON exemplars in `backend/src/services/aiExemplars/<feature>.json` (one entry without `output` is allowed as a scanner directive).
3. **Profile** — map the feature to the right task profile in `FEATURE_TASK_PROFILE` (`reasoning` / `extraction` / `ideation` / `chat`).
4. **Feature function** — add a `generate<Feature>(params)` in `backend/src/services/llmService.js` that calls `callLLM(params, FEATURE_PROMPTS.<feature>, '<user prompt>')`.
5. **Route** — register `router.post('/<feature>', requireTier('community'), aiHandler('<feature>', async (req, params) => llm.generate<Feature>({ ...params, ...req.body })))` in `backend/src/routes/ai.js`.
6. **UI renderer** — add a `<feature>` branch to `FEATURE_RENDERERS` in `frontend/src/components/ai/StructuredOutput.tsx`.
7. **Tests** — add a Jest test in `backend/__tests__/llmSchemas.test.js` covering valid and invalid payloads.
8. **Validation** — `npm run check:syntax` + `npx jest` + `npm run typecheck` (frontend).
