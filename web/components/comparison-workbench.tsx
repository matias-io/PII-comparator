"use client";

import { useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";

import {
  MAX_TEXT_LENGTH,
  isComparisonResponse,
  isRecord,
  type ComparisonResponse,
  type ProviderId,
  type ProviderOutcome,
} from "@/lib/contracts";

const SAMPLE_TEXT =
  "Dr. Maya Chen emailed alex.morgan@example.com about patient Jordan Lee (DOB 1988-04-12). Call 416-555-0138 or send records to 120 University Ave, Toronto, ON M5H 2Y4.";

const providerNames: Record<ProviderId, string> = {
  limina: "Limina",
  presidio: "Presidio",
};
const providerIds: ProviderId[] = ["limina", "presidio"];

function formatScore(score: number | null): string {
  if (score === null) {
    return "—";
  }

  return `${Math.round(score * 100)}%`;
}

function readErrorMessage(value: unknown): string {
  if (
    isRecord(value) &&
    isRecord(value.error) &&
    typeof value.error.message === "string"
  ) {
    return value.error.message;
  }

  return "The comparison request failed. Please try again.";
}

function TechnicalDetails({ outcome }: { outcome: ProviderOutcome }) {
  const { details } = outcome;

  return (
    <details className="technical-details">
      <summary>Technical details</summary>
      <dl>
        <div>
          <dt>Version</dt>
          <dd>{details.version}</dd>
        </div>
        <div>
          <dt>Deployment</dt>
          <dd>{details.deployment}</dd>
        </div>
        <div>
          <dt>Model</dt>
          <dd>{details.model}</dd>
        </div>
        <div>
          <dt>API flow</dt>
          <dd>{details.api}</dd>
        </div>
        <div>
          <dt>Operation</dt>
          <dd>{details.operation}</dd>
        </div>
        {details.timing?.analyzeMs !== undefined ? (
          <div>
            <dt>Analyze</dt>
            <dd>{details.timing.analyzeMs} ms</dd>
          </div>
        ) : null}
        {details.timing?.anonymizeMs !== undefined ? (
          <div>
            <dt>Anonymize</dt>
            <dd>{details.timing.anonymizeMs} ms</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}

function ProviderCard({
  provider,
  outcome,
  loading,
  selected,
}: {
  provider: ProviderId;
  outcome: ProviderOutcome | null;
  loading: boolean;
  selected: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const name = providerNames[provider];

  async function copyOutput() {
    if (!outcome || outcome.status !== "success") {
      return;
    }

    await navigator.clipboard.writeText(outcome.output);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1_500);
  }

  return (
    <article
      className={`provider-card provider-${provider}`}
      aria-labelledby={`${provider}-title`}
    >
      <div className="provider-heading">
        <div>
          <div className="provider-label">
            {provider === "limina"
              ? "Managed API | Can run locally (Licensed)"
              : "Open source"}
          </div>
          <h2 id={`${provider}-title`}>{name}</h2>
        </div>
        {outcome ? (
          <span className={`status-badge status-${outcome.status}`}>
            {outcome.status === "success" ? "Complete" : "Needs attention"}
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="loading-state" role="status">
          <span className="spinner" aria-hidden="true" />
          <span>
            {provider === "presidio"
              ? "Analyzing and anonymizing…"
              : "Processing text…"}
          </span>
        </div>
      ) : null}

      {!loading && !selected ? (
        <div className="empty-state">
          <p>Not selected for this run.</p>
          <span>Turn on {name} above to include it.</span>
        </div>
      ) : null}

      {!loading && selected && !outcome ? (
        <div className="empty-state">
          <p>Results will appear here.</p>
          <span>
            {provider === "limina" ? "Cloud request" : "Analyze → anonymize"}
          </span>
        </div>
      ) : null}

      {!loading && outcome?.status === "error" ? (
        <div className="provider-error" role="status">
          <p>{outcome.error.message}</p>
          <span>
            {outcome.error.retryable
              ? "This may be temporary; retry when the service is ready."
              : `Code: ${outcome.error.code}`}
          </span>
          <TechnicalDetails outcome={outcome} />
        </div>
      ) : null}

      {!loading && outcome?.status === "success" ? (
        <>
          <div className="result-summary">
            <span>
              <strong>{outcome.entities.length}</strong> detected
            </span>
            <span>
              <strong>{outcome.latencyMs}</strong> ms
            </span>
          </div>

          <section
            className="output-section"
            aria-labelledby={`${provider}-output-title`}
          >
            <div className="section-heading">
              <h3 id={`${provider}-output-title`}>Redacted output</h3>
              <button
                className="text-button"
                type="button"
                onClick={copyOutput}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <pre data-testid={`${provider}-output`}>{outcome.output}</pre>
          </section>

          <section
            className="entities-section"
            aria-labelledby={`${provider}-entities-title`}
          >
            <h3 id={`${provider}-entities-title`}>Detected entities</h3>
            {outcome.entities.length > 0 ? (
              <div className="entity-table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Type</th>
                      <th scope="col">Matched text</th>
                      <th scope="col">Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outcome.entities.map((entity, index) => (
                      <tr
                        key={`${entity.type}-${entity.start ?? index}-${index}`}
                      >
                        <td>
                          <span className="entity-type">{entity.type}</span>
                        </td>
                        <td className="entity-value">{entity.value}</td>
                        <td>{formatScore(entity.score)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="no-entities">No entities were detected.</p>
            )}
          </section>

          <TechnicalDetails outcome={outcome} />
        </>
      ) : null}
    </article>
  );
}

export function ComparisonWorkbench() {
  const [text, setText] = useState(SAMPLE_TEXT);
  const [comparison, setComparison] = useState<ComparisonResponse | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<
    Record<ProviderId, boolean>
  >({ limina: false, presidio: true });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function runComparison(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedText = text.trim();
    const providers = providerIds.filter(
      (provider) => selectedProviders[provider],
    );
    if (!trimmedText || providers.length === 0 || loading) {
      return;
    }

    setLoading(true);
    setError(null);
    setComparison(null);

    try {
      const response = await fetch("/api/compare", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: trimmedText, providers }),
      });
      const payload: unknown = await response.json();

      if (!response.ok) {
        throw new Error(readErrorMessage(payload));
      }

      if (!isComparisonResponse(payload)) {
        throw new Error("The server returned an unexpected response.");
      }

      setComparison(payload);
    } catch (requestError: unknown) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The comparison request failed. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }

  function handleShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  }

  function toggleProvider(provider: ProviderId) {
    setSelectedProviders((current) => ({
      ...current,
      [provider]: !current[provider],
    }));
  }

  const hasSelectedProvider = providerIds.some(
    (provider) => selectedProviders[provider],
  );

  return (
    <div className="workbench">
      <form ref={formRef} className="input-panel" onSubmit={runComparison}>
        <div className="input-heading">
          <div>
            <label htmlFor="comparison-text">Text to compare</label>
            <p>Use synthetic data and choose which providers receive it.</p>
          </div>
          <span aria-live="polite">
            {text.length.toLocaleString("en-CA")} /{" "}
            {MAX_TEXT_LENGTH.toLocaleString("en-CA")}
          </span>
        </div>

        <fieldset className="provider-selectors">
          <legend>Providers</legend>
          {providerIds.map((provider) => (
            <label className="provider-option" key={provider}>
              <input
                type="checkbox"
                checked={selectedProviders[provider]}
                disabled={loading}
                onChange={() => toggleProvider(provider)}
              />
              <span>{providerNames[provider]}</span>
            </label>
          ))}
        </fieldset>

        <textarea
          id="comparison-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleShortcut}
          maxLength={MAX_TEXT_LENGTH}
          rows={7}
          spellCheck
        />

        <div className="input-actions">
          <div className="sample-actions">
            <button
              className="text-button"
              type="button"
              onClick={() => setText(SAMPLE_TEXT)}
            >
              Use sample
            </button>
            <button
              className="text-button"
              type="button"
              onClick={() => setText("")}
            >
              Clear
            </button>
          </div>
          <button
            className="primary-button"
            type="submit"
            disabled={!text.trim() || !hasSelectedProvider || loading}
          >
            {loading ? "Comparing…" : "Compare redaction"}
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </form>

      {error ? (
        <div className="request-error" role="alert">
          {error}
        </div>
      ) : null}

      <section
        className="comparison-grid"
        aria-label="Provider results"
        aria-busy={loading}
      >
        <ProviderCard
          provider="limina"
          outcome={comparison?.results.limina ?? null}
          loading={loading && selectedProviders.limina}
          selected={selectedProviders.limina}
        />
        <ProviderCard
          provider="presidio"
          outcome={comparison?.results.presidio ?? null}
          loading={loading && selectedProviders.presidio}
          selected={selectedProviders.presidio}
        />
      </section>

      <aside
        className="comparison-note"
        aria-label="How to interpret this comparison"
      >
        <span className="note-icon" aria-hidden="true">
          i
        </span>
        <p>
          Entity labels and confidence scores come from different models and are
          not directly equivalent. The platforms are functonally the same but
          vary in their model.
        </p>
      </aside>
    </div>
  );
}
