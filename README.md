# PII redaction comparison

A deliberately small evaluator for running the same text through two
PII-redaction strategies:

- **Limina Process Text** through the hosted Community API.
- **Microsoft Presidio** through pinned, self-hosted analyzer and anonymizer
  containers.

The page keeps each provider's native output, entity labels, confidence scores,
latency, and API/runtime details visible.

## Architecture

```text
Browser
  └─ POST /api/compare (Next.js server route; no-store)
       ├─ Limina Community API: POST /process/text
       └─ Presidio analyzer: POST /analyze
            └─ Presidio anonymizer: POST /anonymize
```

The browser never receives the Limina API key. In production, the two Presidio
containers are private Vercel Services reached through service bindings; only
the Next.js service is publicly routed.

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

## Run Production - Deploy to Vercel

This repository uses the current Vercel Services configuration in
`vercel.json`:

1. Create/import a Vercel project from this repository and select **Services**
   as the project framework.
2. Add `LIMINA_API_KEY` as a server-only encrypted environment variable.
3. Add `PORT=3000` for the Presidio containers. `LIMINA_API_BASE_URL` is
   optional and defaults to `https://api.getlimina.ai/community/v4`.
4. Deploy. Do not add public rewrites for either Presidio service.

The deployment uses Presidio `2.2.364` official images, pinned by both version
and digest, and the default `en_core_web_lg` English spaCy model. Vercel Services
and container-image Functions are current Vercel beta capabilities, so verify
cold-start time and memory use in the target account before treating this as a
production architecture.

## Evaluation notes

- The app has no user authentication
- Limina uses numbered marker replacements such as
  `[UNIQUE_1_PERSON]`; Presidio uses typed placeholders such as `<PERSON>`.
  The visible outputs therefore preserve each strategy's native semantics.

## Current documentation used

- [Limina Process Text v4.4.1](https://docs.getlimina.ai/latest/process-text)
- [Limina API schema](https://docs.getlimina.ai/openapi/privateai_4.4.1.json)
- [Presidio installation and containers](https://presidio.dataprivacystack.org/installation/)
- [Presidio REST API](https://presidio.dataprivacystack.org/api-docs/api-docs.html)
- [Vercel Services](https://vercel.com/kb/guide/vercel-services)
- [Vercel Dockerfile Functions](https://vercel.com/changelog/bring-your-dockerfile-to-vercel-functions)
