import type { ProviderFailure, ProviderId } from "@/lib/contracts";

export const REQUEST_TIMEOUT_MS = 30_000;

export function elapsedMs(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

export function providerFailure(
  provider: ProviderId,
  startedAt: number,
  details: ProviderFailure["details"],
  code: string,
  message: string,
  retryable = false,
): ProviderFailure {
  return {
    status: "error",
    provider,
    latencyMs: elapsedMs(startedAt),
    error: {
      code,
      message,
      retryable,
    },
    details,
  };
}

export function toBaseUrl(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

export function errorCode(error: unknown): string {
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "UPSTREAM_TIMEOUT";
  }

  if (error instanceof Error && error.name === "AbortError") {
    return "UPSTREAM_TIMEOUT";
  }

  return "UPSTREAM_UNAVAILABLE";
}
