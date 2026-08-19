# PII redaction comparator

A focused evaluator for comparing two PII detection and redaction providers:

- **Limina Process Text** through the hosted Community API.
- **Microsoft Presidio** through a self-hosted Python service.

Users can run either provider independently or run both concurrently. The page
keeps provider-native output, entity labels, confidence scores, latency, and
runtime details visible. It is an evaluation POC, not a compliance product.

Live evaluation: [limina-comparator.matiass.ca](https://limina-comparator.matiass.ca/)

## Architecture

```text
Browser
  └─ POST /api/compare (Next.js server route; no-store)
       ├─ Limina Community API: POST /process/text
       └─ Presidio analyzer: POST /analyze
            └─ Presidio anonymizer: POST /anonymize
```

The browser never receives the Limina API key. The server calls only the
providers selected for a request. In production, Presidio runs as one private
Python/FastAPI Vercel Service. The public Next.js service reaches it through two
private bindings for the analyzer and anonymizer endpoints.

Local development uses the official Presidio analyzer and anonymizer container
images pinned to version `2.2.364`. Production uses the matching Python packages
and `en_core_web_lg` model in `services/presidio-vercel/`.

## Run locally

Requirements:

- Node.js 22 or newer
- Docker Desktop
- A Limina Community API key for the Limina result (Presidio still works when
  the key is absent)

```powershell
npm install
Copy-Item web\.env.example web\.env.local
# Add LIMINA_API_KEY to web\.env.local
npm run dev
```

Open the URL printed by Next.js. The combined development command starts the
two Presidio containers from `docker-compose.dev.yml` and the Next.js dev
server. If port 3000 is already occupied, Next.js selects the next free port.

Useful commands:

```powershell
npm run dev:web              # Next.js only
npm run dev:presidio         # Presidio containers only
npm run dev:presidio:down    # Stop and remove the dev containers
npm run check                # ESLint, strict TypeScript, production build
```

Get a key from the [Limina portal](https://portal.getlimina.ai/). Keep it only
in `web/.env.local` or a deployment secret; never commit it or prefix it with
`NEXT_PUBLIC_`.

## Deploy to Vercel

The root `vercel.json` declares two Vercel Services:

- `web`, the public Next.js application.
- `presidio`, the private native Python/FastAPI service.

To deploy:

1. Import the repository root into Vercel and select **Services** as the project
   framework.
2. Add `LIMINA_API_KEY` as a server-only encrypted environment variable.
3. Set `NEXT_PUBLIC_ENVIRONMENT_LABEL=development-live` so technical details
   describe the Vercel deployment rather than the local Docker setup.
4. Keep Fluid Compute and `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` enabled because the
   spaCy model exceeds the standard function bundle path.
5. Do not set `PRESIDIO_ANALYZER_URL` or `PRESIDIO_ANONYMIZER_URL` manually in
   Vercel. Private service bindings supply both values.

Vercel Services and the Python runtime are beta capabilities as of August 2026.
The verified deployment uses Presidio `2.2.364` and spaCy
`en_core_web_lg 3.8.0`.

## Evaluation notes

- The app has no user authentication
- Input and provider responses use `Cache-Control: no-store` and must not be
  logged or sent to analytics.
- Use synthetic data only. The included sample is synthetic and contains test
  identifiers intended to exercise many detector types.
- Limina uses numbered marker replacements such as
  `[UNIQUE_1_PERSON]`; Presidio uses typed placeholders such as `<PERSON>`.
  The visible outputs therefore preserve each strategy's native semantics.

## Current documentation used

- [Limina Process Text v4.4.1](https://docs.getlimina.ai/latest/process-text)
- [Limina API schema](https://docs.getlimina.ai/openapi/privateai_4.4.1.json)
- [Presidio installation and containers](https://presidio.dataprivacystack.org/installation/)
- [Presidio REST API](https://presidio.dataprivacystack.org/api-docs/api-docs.html)
- [Vercel Services](https://vercel.com/kb/guide/vercel-services)
- [FastAPI on Vercel](https://vercel.com/kb/guide/ship-a-fastapi-app-on-vercel)
