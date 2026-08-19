export const MAX_TEXT_LENGTH = 12_000;

export type ProviderId = "limina" | "presidio";

export interface Detection {
  type: string;
  value: string;
  score: number | null;
  start: number | null;
  end: number | null;
  replacement: string | null;
}

export interface ProviderDetails {
  api: string;
  deployment: string;
  model: string;
  operation: string;
  version: string;
  timing?: {
    analyzeMs?: number;
    anonymizeMs?: number;
  };
}

export interface ProviderSuccess {
  status: "success";
  provider: ProviderId;
  output: string;
  entities: Detection[];
  latencyMs: number;
  details: ProviderDetails;
}

export interface ProviderFailure {
  status: "error";
  provider: ProviderId;
  latencyMs: number;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  details: ProviderDetails;
}

export type ProviderOutcome = ProviderSuccess | ProviderFailure;

export interface ComparisonResponse {
  inputLength: number;
  completedAt: string;
  results: {
    limina: ProviderOutcome;
    presidio: ProviderOutcome;
  };
}

export interface RequestFailure {
  error: {
    code: string;
    message: string;
  };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isProviderOutcome(value: unknown): value is ProviderOutcome {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.provider === "limina" || value.provider === "presidio") &&
    (value.status === "success" || value.status === "error") &&
    typeof value.latencyMs === "number" &&
    isRecord(value.details)
  );
}

export function isComparisonResponse(value: unknown): value is ComparisonResponse {
  if (!isRecord(value) || !isRecord(value.results)) {
    return false;
  }

  return (
    typeof value.inputLength === "number" &&
    typeof value.completedAt === "string" &&
    isProviderOutcome(value.results.limina) &&
    isProviderOutcome(value.results.presidio)
  );
}
