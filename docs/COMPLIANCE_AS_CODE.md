# Compliance as Code

ControlWeave exposes a CI-friendly endpoint that turns your live compliance status into a pass/fail gate for build pipelines. Wire it into your CI so a drop in framework compliance breaks the build the same way a failing test suite would.

## How it works

```
GET /api/v1/compliance/gate?framework_id=<uuid>&min_pct=<0-100>
```

- Computes your organization's current compliance percentage for the given framework (control implementations marked `implemented` or `satisfied_via_crosswalk`, divided by total controls in scope).
- Returns **HTTP 200** when the framework's compliance percentage is greater than or equal to `min_pct`.
- Returns **HTTP 412 Precondition Failed** when it is below `min_pct` — chosen specifically so `curl --fail` (or any HTTP-status-aware CI step) breaks the pipeline without needing to parse JSON.
- Omit `framework_id` to evaluate every framework your organization has selected; the gate fails if any one of them is under threshold.
- `min_pct` defaults to `80` if not supplied.

Response body (always returned, even on failure):

```json
{
  "success": true,
  "data": {
    "pass": false,
    "threshold": 80,
    "evaluated_at": "2026-07-08T00:00:00.000Z",
    "frameworks": [
      {
        "framework_id": "...",
        "framework_name": "NIST 800-53",
        "total_controls": 320,
        "implemented": 240,
        "compliance_pct": 75,
        "pass": false
      }
    ]
  }
}
```

## Authenticating from CI

Use a **service account token** rather than a personal login. Create one under **Settings → Service Accounts** (or `POST /api/v1/service-accounts`, then `POST /api/v1/service-accounts/:id/generate-token`), store it as a CI secret (e.g. `CONTROLWEAVE_TOKEN`), and send it as a bearer token.

## Example: plain curl

```bash
curl --fail \
  -H "Authorization: Bearer $CONTROLWEAVE_TOKEN" \
  "https://your-instance.example.com/api/v1/compliance/gate?framework_id=$FRAMEWORK_ID&min_pct=80"
```

`--fail` makes curl exit non-zero on the 412 response, which is enough to fail most CI steps on its own.

## Example: GitHub Actions

```yaml
jobs:
  compliance-gate:
    runs-on: ubuntu-latest
    steps:
      - name: Check compliance gate
        env:
          CONTROLWEAVE_TOKEN: ${{ secrets.CONTROLWEAVE_TOKEN }}
        run: |
          curl --fail \
            -H "Authorization: Bearer $CONTROLWEAVE_TOKEN" \
            "https://your-instance.example.com/api/v1/compliance/gate?framework_id=${{ vars.FRAMEWORK_ID }}&min_pct=80"
```

## Example: GitLab CI

```yaml
compliance_gate:
  stage: test
  script:
    - >
      curl --fail
      -H "Authorization: Bearer $CONTROLWEAVE_TOKEN"
      "https://your-instance.example.com/api/v1/compliance/gate?framework_id=$FRAMEWORK_ID&min_pct=80"
  variables:
    FRAMEWORK_ID: "your-framework-uuid"
```

## Notes

- The gate reads current control-implementation status; it does not require a compliance snapshot to have run.
- Scoped entirely to the caller's organization — no cross-tenant data is ever returned.
- Pair this with the [Leveraged Authorizations / OSCAL export](../frontend/src/app/dashboard/rmf) feature to also gate on authorization posture, not just raw control percentage.
