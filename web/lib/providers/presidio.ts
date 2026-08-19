import type {
  Detection,
  ProviderDetails,
  ProviderOutcome,
} from "@/lib/contracts";
import { isRecord } from "@/lib/contracts";
import {
  elapsedMs,
  errorCode,
  providerFailure,
  REQUEST_TIMEOUT_MS,
  toBaseUrl,
} from "@/lib/providers/shared";

const DEFAULT_ANALYZER_URL = "http://127.0.0.1:5002";
const DEFAULT_ANONYMIZER_URL = "http://127.0.0.1:5001";
const isDevelopmentLive =
  process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL === "development-live";

const baseDetails: ProviderDetails = {
  api: "POST /analyze → POST /anonymize",
  deployment: isDevelopmentLive
    ? "Native Python · private Vercel Service"
    : "Official Presidio containers · local Docker Compose",
  model: "spaCy en_core_web_lg · English",
  operation: "Analyze + typed placeholder replacement",
  version: "Presidio 2.2.364",
};

interface PresidioDetection {
  entity_type: string;
  start: number;
  end: number;
  score: number;
}

function parseDetection(value: unknown): PresidioDetection | null {
  if (!isRecord(value)) {
    return null;
  }

  if (
    typeof value.entity_type !== "string" ||
    typeof value.start !== "number" ||
    typeof value.end !== "number" ||
    typeof value.score !== "number"
  ) {
    return null;
  }

  return {
    entity_type: value.entity_type,
    start: value.start,
    end: value.end,
    score: value.score,
  };
}

function parseAnalyzeResponse(value: unknown): PresidioDetection[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const detections = value
    .map(parseDetection)
    .filter((detection): detection is PresidioDetection => detection !== null);

  return detections.length === value.length ? detections : null;
}

function parseAnonymizeResponse(value: unknown): string | null {
  return isRecord(value) && typeof value.text === "string" ? value.text : null;
}

function serviceFailureMessage(status: number, service: "analyzer" | "anonymizer"): string {
  if (status === 503) {
    return `The Presidio ${service} is warming up or unavailable.`;
  }

  return `The Presidio ${service} returned HTTP ${status}.`;
}

export async function runPresidio(text: string): Promise<ProviderOutcome> {
  const startedAt = performance.now();
  const analyzerBase = process.env.PRESIDIO_ANALYZER_URL?.trim() || DEFAULT_ANALYZER_URL;
  const anonymizerBase =
    process.env.PRESIDIO_ANONYMIZER_URL?.trim() || DEFAULT_ANONYMIZER_URL;

  try {
    const analyzeStartedAt = performance.now();
    const analyzeResponse = await fetch(
      new URL("analyze", toBaseUrl(analyzerBase)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          language: "en",
          return_decision_process: false,
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const analyzeMs = elapsedMs(analyzeStartedAt);

    if (!analyzeResponse.ok) {
      return providerFailure(
        "presidio",
        startedAt,
        { ...baseDetails, timing: { analyzeMs } },
        "PRESIDIO_ANALYZE_FAILED",
        serviceFailureMessage(analyzeResponse.status, "analyzer"),
        analyzeResponse.status >= 500,
      );
    }

    const analyzePayload: unknown = await analyzeResponse.json();
    const analyzerResults = parseAnalyzeResponse(analyzePayload);
    if (!analyzerResults) {
      return providerFailure(
        "presidio",
        startedAt,
        { ...baseDetails, timing: { analyzeMs } },
        "PRESIDIO_INVALID_ANALYZE_RESPONSE",
        "The Presidio analyzer returned an unexpected response shape.",
      );
    }

    const anonymizeStartedAt = performance.now();
    const anonymizeResponse = await fetch(
      new URL("anonymize", toBaseUrl(anonymizerBase)),
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          text,
          analyzer_results: analyzerResults,
          anonymizers: {
            DEFAULT: {
              type: "replace",
            },
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    const anonymizeMs = elapsedMs(anonymizeStartedAt);
    const details: ProviderDetails = {
      ...baseDetails,
      timing: { analyzeMs, anonymizeMs },
    };

    if (!anonymizeResponse.ok) {
      return providerFailure(
        "presidio",
        startedAt,
        details,
        "PRESIDIO_ANONYMIZE_FAILED",
        serviceFailureMessage(anonymizeResponse.status, "anonymizer"),
        anonymizeResponse.status >= 500,
      );
    }

    const anonymizePayload: unknown = await anonymizeResponse.json();
    const output = parseAnonymizeResponse(anonymizePayload);
    if (output === null) {
      return providerFailure(
        "presidio",
        startedAt,
        details,
        "PRESIDIO_INVALID_ANONYMIZE_RESPONSE",
        "The Presidio anonymizer returned an unexpected response shape.",
      );
    }

    const entities: Detection[] = analyzerResults
      .map((result) => ({
        type: result.entity_type,
        value: text.slice(result.start, result.end),
        score: result.score,
        start: result.start,
        end: result.end,
        replacement: `<${result.entity_type}>`,
      }))
      .sort((left, right) => left.start - right.start);

    return {
      status: "success",
      provider: "presidio",
      output,
      entities,
      latencyMs: elapsedMs(startedAt),
      details,
    };
  } catch (error: unknown) {
    const code = errorCode(error);
    return providerFailure(
      "presidio",
      startedAt,
      baseDetails,
      code,
      code === "UPSTREAM_TIMEOUT"
        ? "Presidio did not respond within 30 seconds."
        : "The Presidio services could not be reached.",
      true,
    );
  }
}
