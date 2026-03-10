export interface ExternalDecisionPayload {
  input_data?: Record<string, unknown>;
  output_data?: Record<string, unknown>;
  confidence_score?: number;
  reasoning?: string;
  key_factors?: unknown[];
  correlation_id?: string;
  session_id?: string;
  regulatory_framework?: string;
  risk_assessment?: string;
  compliance_notes?: string;
  feature?: string;
  risk_level?: 'limited' | 'low' | 'medium' | 'high' | 'critical';
  external_provider?: string;
  external_model?: string;
  external_decision_id?: string;
  processing_timestamp?: string;
}

export interface LoggerOptions {
  apiKey: string;
  baseUrl?: string;
}

export class ControlWeaveLogger {
  constructor(options: LoggerOptions);
  logDecision(payload: ExternalDecisionPayload): Promise<any>;
  logBatch(decisions: ExternalDecisionPayload[]): Promise<any[]>;
}
