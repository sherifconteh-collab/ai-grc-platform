class ControlWeaveLogger {
  constructor({ apiKey, baseUrl = 'https://app.controlweave.com/api/v1' } = {}) {
    if (!apiKey) throw new Error('apiKey is required');
    this.apiKey = apiKey;
    this.baseUrl = String(baseUrl).replace(/\/$/, '');
  }

  async logDecision(payload) {
    if (!payload || typeof payload !== 'object') {
      throw new Error('payload must be an object');
    }

    const response = await fetch(`${this.baseUrl}/external-ai/decisions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = data?.error || `Request failed with status ${response.status}`;
      throw new Error(message);
    }
    return data;
  }

  async logBatch(decisions = []) {
    if (!Array.isArray(decisions)) {
      throw new Error('decisions must be an array');
    }
    const results = [];
    for (const decision of decisions) {
      results.push(await this.logDecision(decision));
    }
    return results;
  }
}

module.exports = {
  ControlWeaveLogger
};
