# ControlWeave External AI Logger SDK

SDK to send external AI decision logs into the ControlWeave Tier 3 ingestion endpoint.

## Install

```bash
npm install @controlweave/external-ai-logger
```

## Usage

```js
const { ControlWeaveLogger } = require('@controlweave/external-ai-logger');

const logger = new ControlWeaveLogger({
  apiKey: process.env.CONTROLWEAVE_API_KEY,
  baseUrl: 'https://your-controlweave-host/api/v1'
});

await logger.logDecision({
  feature: 'incident_triage',
  input_data: { alertId: 'A-123' },
  output_data: { priority: 'high' },
  external_provider: 'openai',
  external_model: 'gpt-4.1',
  external_decision_id: 'ext-789',
  risk_level: 'medium'
});
```

## How to implement (SDK + Webhook)

### 1) Confirm tier eligibility

External SDK ingestion and related webhook workflows are available for:
- `enterprise`

If your org is on lower tiers, API key creation/ingestion will be blocked.

### 2) Create an external SDK API key

From ControlWeave (admin/settings-manage user):
- Go to **Settings → Platform Admin** (or API key management surface)
- Create a key for external logging (`ai:log` scope)
- Copy the generated key once (format starts with `cw_live_`)

### 3) Send external decisions with SDK

```js
const { ControlWeaveLogger } = require('@controlweave/external-ai-logger');

const logger = new ControlWeaveLogger({
  apiKey: process.env.CONTROLWEAVE_API_KEY,
  baseUrl: 'https://your-controlweave-host/api/v1'
});

await logger.logDecision({
  feature: 'policy_classification',
  input_data: { document_id: 'DOC-42' },
  output_data: { classification: 'internal' },
  external_provider: 'openai',
  external_model: 'gpt-4.1',
  external_decision_id: 'dec-123',
  risk_level: 'low'
});
```

### 4) Configure webhook subscription (optional)

If you want downstream systems (SIEM/SOAR/internal services) to receive events:
- Create a webhook subscription in ControlWeave:
  - `POST /api/v1/webhooks`
  - include your target URL and desired event types
- ControlWeave will deliver signed webhook events to your endpoint.

### 5) Verify event + delivery

- Confirm decision appears in `ai_decision_log` with:
  - `decision_source = 'external'`
  - `external_provider`, `external_model`, `external_decision_id`
- Confirm webhook deliveries via:
  - `GET /api/v1/webhooks/deliveries`
