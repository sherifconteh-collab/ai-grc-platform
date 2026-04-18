# /investigate-ci-failure

1. Identify the failing workflow run via `list_workflow_runs`.
2. Pull the failing job logs with `get_job_logs(run_id, failed_only=true, return_content=true)`.
3. Reproduce locally:
   - For `Code Quality` failures: `cd backend && npm run check:syntax` and `cd frontend && npm run typecheck`.
   - For `Dependency Security Audit` failures: `npm audit --audit-level=moderate` in the failing layer.
   - For `Test` failures: `npx jest --testPathPattern <file>` (backend) or `npx playwright test <spec>` (frontend).
4. Fix surgically; do not refactor unrelated code.
5. Re-run validation locally before pushing.
