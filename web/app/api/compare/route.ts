import { NextResponse } from "next/server";

import { MAX_TEXT_LENGTH, isRecord } from "@/lib/contracts";
import { runLimina } from "@/lib/providers/limina";
import { runPresidio } from "@/lib/providers/presidio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_REQUEST_BYTES = 64_000;

const responseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
};

function requestError(status: number, code: string, message: string): NextResponse {
  return NextResponse.json(
    { error: { code, message } },
    { status, headers: responseHeaders },
  );
}

export async function POST(request: Request): Promise<NextResponse> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return requestError(413, "REQUEST_TOO_LARGE", "The request body is too large.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return requestError(400, "INVALID_JSON", "Send a valid JSON request body.");
  }

  if (!isRecord(body) || typeof body.text !== "string") {
    return requestError(400, "INVALID_TEXT", "The text field must be a string.");
  }

  const text = body.text.trim();
  if (text.length === 0) {
    return requestError(400, "EMPTY_TEXT", "Paste text before running the comparison.");
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return requestError(
      413,
      "TEXT_TOO_LONG",
      `Text is limited to ${MAX_TEXT_LENGTH.toLocaleString()} characters in this evaluator.`,
    );
  }

  const [limina, presidio] = await Promise.all([
    runLimina(text),
    runPresidio(text),
  ]);

  return NextResponse.json(
    {
      inputLength: text.length,
      completedAt: new Date().toISOString(),
      results: { limina, presidio },
    },
    { headers: responseHeaders },
  );
}
