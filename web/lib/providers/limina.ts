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

const DEFAULT_BASE_URL = "https://api.getlimina.ai/community/v4";

const details: ProviderDetails = {
  api: "POST /process/text",
  deployment: "Limina Community cloud API",
  model: "Limina entity detection · high automatic accuracy",
  operation: "Detect + marker replacement",
  version: "API v4.4.1",
};

interface LiminaLocation {
  stt_idx: number | null;
  end_idx: number | null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function parseLocation(value: unknown): LiminaLocation {
  if (!isRecord(value)) {
    return { stt_idx: null, end_idx: null };
  }

  return {
    stt_idx: numberOrNull(value.stt_idx),
    end_idx: numberOrNull(value.end_idx),
  };
}

function parseScore(labels: unknown, bestLabel: string): number | null {
  if (!isRecord(labels)) {
    return null;
  }

  const bestScore = labels[bestLabel];
  if (typeof bestScore === "number" && Number.isFinite(bestScore)) {
    return bestScore;
  }

  const scores = Object.values(labels).filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  return scores.length > 0 ? Math.max(...scores) : null;
}

function parseEntity(value: unknown): Detection | null {
  if (!isRecord(value)) {
    return null;
  }

  const type = typeof value.best_label === "string" ? value.best_label : "UNKNOWN";
  const entityValue = typeof value.text === "string" ? value.text : "";
  const replacement =
    typeof value.processed_text === "string" ? value.processed_text : null;
  const location = parseLocation(value.location);

  return {
    type,
    value: entityValue,
    score: parseScore(value.labels, type),
    start: location.stt_idx,
    end: location.end_idx,
    replacement,
  };
}

function parseResponse(value: unknown): { output: string; entities: Detection[] } | null {
  if (!Array.isArray(value) || value.length === 0 || !isRecord(value[0])) {
    return null;
  }

  const item = value[0];
  if (typeof item.processed_text !== "string" || !Array.isArray(item.entities)) {
    return null;
  }

  return {
    output: item.processed_text,
    entities: item.entities
      .map(parseEntity)
      .filter((entity): entity is Detection => entity !== null)
      .sort((left, right) => (left.start ?? 0) - (right.start ?? 0)),
  };
}

function upstreamMessage(status: number): { code: string; message: string; retryable: boolean } {
  if (status === 401 || status === 403) {
    return {
      code: "LIMINA_AUTH_FAILED",
      message: "Limina rejected the configured API key.",
      retryable: false,
    };
  }

  if (status === 429) {
    return {
      code: "LIMINA_RATE_LIMITED",
      message: "Limina is rate-limiting this account. Try again shortly.",
      retryable: true,
    };
  }

  return {
    code: "LIMINA_REQUEST_FAILED",
    message: `Limina returned HTTP ${status}.`,
    retryable: status >= 500,
  };
}

export async function runLimina(text: string): Promise<ProviderOutcome> {
  const startedAt = performance.now();
  const apiKey = process.env.LIMINA_API_KEY?.trim();

  if (!apiKey) {
    return providerFailure(
      "limina",
      startedAt,
      details,
      "LIMINA_NOT_CONFIGURED",
      "Add LIMINA_API_KEY to the server environment to enable this side.",
    );
  }

  const baseUrl = process.env.LIMINA_API_BASE_URL?.trim() || DEFAULT_BASE_URL;

  try {
    const endpoint = new URL("process/text", toBaseUrl(baseUrl));
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        text: [text],
        link_batch: false,
        entity_detection: {
          accuracy: "high_automatic",
          return_entity: true,
        },
        processed_text: {
          type: "MARKER",
          pattern: "[UNIQUE_NUMBERED_ENTITY_TYPE]",
        },
        project_id: "pii-redaction-compare",
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const error = upstreamMessage(response.status);
      return providerFailure(
        "limina",
        startedAt,
        details,
        error.code,
        error.message,
        error.retryable,
      );
    }

    const payload: unknown = await response.json();
    const parsed = parseResponse(payload);

    if (!parsed) {
      return providerFailure(
        "limina",
        startedAt,
        details,
        "LIMINA_INVALID_RESPONSE",
        "Limina returned an unexpected response shape.",
      );
    }

    return {
      status: "success",
      provider: "limina",
      output: parsed.output,
      entities: parsed.entities,
      latencyMs: elapsedMs(startedAt),
      details,
    };
  } catch (error: unknown) {
    const code = errorCode(error);
    return providerFailure(
      "limina",
      startedAt,
      details,
      code,
      code === "UPSTREAM_TIMEOUT"
        ? "Limina did not respond within 30 seconds."
        : "The Limina service could not be reached.",
      true,
    );
  }
}
