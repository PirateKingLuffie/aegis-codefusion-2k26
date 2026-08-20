# AEGIS deployment handoff

This is the owner-action checklist for GitHub publication, immediate Cloudflare Workers hosting and the later Oracle Free Tier durable stack. It does not create external accounts, instances, DNS records or certificates.

## Current public release

| Surface | URL | Worker version |
| --- | --- | --- |
| Command center | https://aegis-codefusion-2k26.guptashivaani233.workers.dev | `58accdae-9be1-440c-b7f2-3cec0ff45e86` |
| Dedicated Agent Ledger | https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger | `af5d0e22-9ed7-4e83-b0ff-ea62a312114f` |

The D1 migration is applied and live in APAC. Cross-deployment ledger `GET`, `POST` and human-review `PATCH` were accepted, including a D1-persisted approved revision 2 with verified SHA-256 receipt links. Remote-browser acceptance also confirmed globe rotation, country/city/street labels, New Delhi search, deep zoom without a black canvas and a clean console. The remaining acceptance item is repetition on the target Lenovo LOQ for device-specific GPU and Chrome validation.

## Deployment split

| Target | Purpose | What it includes | What it does not include |
| --- | --- | --- | --- |
| Cloudflare Workers + optional D1 | Immediate free-plan-compatible public judge URL | Command center, server routes, simulation APIs, `/agent-ledger` and durable Agent Ledger revisions when `AEGIS_LEDGER_DB` is bound | Full scenario persistence, FastAPI, PostgreSQL/PostGIS, Redis, WebSocket event storage or nginx |
| Oracle Free Tier | Durable full-stack target | Web, FastAPI, PostGIS, Redis, nginx, durable records and WebSocket replay | Oracle account/instance, DNS and TLS owner actions |

Cloudflare D1 and the Oracle operations database have deliberately different scopes. D1 stores immutable Agent Ledger receipt revisions only. Scenarios remain browser-local unless `AEGIS_OPERATIONS_API_URL` points to the full durable service. If neither D1 nor that API is available, Agent Ledger storage is runtime-only and records can disappear when a Worker isolate restarts; do not describe that mode as durable.

## Release gates before publishing

Do not publish until all gates are green:

- frontend typecheck, lint, unit tests and production build pass;
- backend tests pass against the intended Python environment;
- a clean browser session completes the judge flow without console/runtime errors;
- globe, search, EIT site focus, simulation, timeline, evacuation, comparison, recovery, exports and decision receipt are exercised;
- no live secret appears in tracked files, Git history, screenshots or artifacts;
- map, imagery, data and library attributions remain visible and a repository licence has been chosen by the owner;
- documentation reflects the implemented provider order and current AI/agent behavior;
- Windows portable and installer artifacts, if included, are rebuilt from the same final source revision;
- release checksums and a source revision identifier are recorded;
- all generated caches, local databases, logs, backups and environment files are excluded from Git.

## GitHub publication

Recommended repository contents:

- application source and tests;
- `backend/`, `deployment/` and `platforms/windows/` source;
- sanitised example environment files;
- this documentation set;
- small, intentional judge screenshots only if licences and provenance are clear.

Before making the repository public, the owner should choose a source-code licence and retain the required OpenStreetMap, CARTO, OpenFreeMap, EOX and NASA attributions. Public availability does not erase upstream terms or acceptable-use policies.

Do not publish:

- `.env.local`, `deployment/.env` or any provider/AI token;
- database dumps, certificates, private keys or Oracle SSH keys;
- local caches, build trees, runtime logs or user data;
- pasted chat/config files containing credentials;
- unsigned installers as if they were trusted production releases.

Before the first push, scan both filenames and file contents. Any credential previously pasted into chat or committed locally must be revoked even if later deleted.

## Cloudflare Workers redeployment handoff

The source contains `wrangler.jsonc` plus `build:vinext` and `deploy:vinext` package scripts. The live release already exists; these are the controlled redeployment steps for an owner-authorised Cloudflare account.

Recommended release sequence:

1. Publish and tag the exact source revision that passed the release gates.
2. Install dependencies from the lockfile and run the repository verification command.
3. Run `npm run build:vinext`.
4. Authenticate Wrangler with the owner-controlled Cloudflare account.
5. Confirm the `AEGIS_LEDGER_DB` D1 binding and `AI` Workers AI binding in `wrangler.jsonc`, then apply `migrations/0001_agent_activity_ledger.sql` with `npx wrangler d1 migrations apply aegis-agent-ledger --remote`.
6. Add optional compatible-provider or Groq credentials with `wrangler secret put`; Workers AI itself uses the bound `AI` service and needs no API key. Never store provider credentials as plain variables in `wrangler.jsonc`.
7. Run `npm run deploy:vinext`.
8. Record the resulting Worker version and run the full judge flow from a clean external Chrome session.
9. If using a custom domain, attach it in the owner’s Cloudflare configuration and re-test HTTPS, routing and API requests.

Cloudflare free-plan limits and terms are external and may change. Describe this as **free-plan compatible**, not guaranteed free forever.

For the immediate judge deployment:

- leave `AEGIS_OPERATIONS_API_URL` unset unless a real HTTPS full operations API is reachable from the Worker;
- expect `/api/health` to report browser-local scenario persistence without that API;
- expect `/agent-ledger` to show linked durable storage when D1 is bound, migrated and healthy; otherwise it will try the FastAPI store and finally show `RUNTIME` while recording only within the active Worker isolate;
- remember that D1 durability applies only to Agent Ledger revisions, not scenarios, PostGIS assets, Redis state or WebSocket replay;
- keep the deterministic fallback available even when no model secret is configured;
- never expose an optional model key in browser code, static assets or public configuration output.

## Oracle Free Tier owner inputs

The owner must provide:

- an eligible Oracle Cloud account and available compute capacity;
- one Ubuntu ARM64 or AMD64 instance;
- public IPv4 address and VCN/NSG rules for TCP `22`, `80` and `443`;
- SSH access restricted to the operator where practical;
- final hostname/domain and DNS control;
- TLS certificate or ACME client access;
- strong PostgreSQL password and allowed public origin;
- optional server-side AI/provider secrets, if that feature is enabled.

Oracle eligibility, regional capacity and pricing are external and can change. “Free Tier compatible” is safer than “guaranteed free forever.”

## Oracle durable-stack sequence

Run these only on the final Oracle instance after the repository is published and reviewed:

1. Clone the final tagged source revision.
2. Run `deployment/scripts/oracle-bootstrap.sh` with the required administrative authority.
3. Copy `deployment/.env.example` to `deployment/.env`.
4. Replace every placeholder and set `AEGIS_TLS_ENABLED=false` for the first HTTP check.
5. Run `deployment/scripts/preflight.sh`.
6. Run `deployment/scripts/migrate.sh`.
7. Start the Compose stack with the deployment environment.
8. Run `deployment/scripts/healthcheck.sh` against the public origin.
9. Point DNS to the instance and obtain TLS.
10. Set the final HTTPS public URL and allowed origin, enable TLS, then start with `docker-compose.tls.yml`.
11. Re-run health checks and the full judge flow from a clean external Chrome session.
12. Point the Windows Tauri launcher at the chosen final HTTPS origin and rebuild/retest only if its configured origin changed.

The exact commands and operational script behaviour are documented in `deployment/README.md`.

## Required durable-stack environment

| Variable | Purpose | Rule |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | Database credential | Generate a long random value; never commit |
| `POSTGRES_USER` / `POSTGRES_DB` | Database identity | Defaults are acceptable only with a strong unique password |
| `AEGIS_PUBLIC_URL` | Canonical HTTPS origin | Set to final hostname |
| `AEGIS_OPERATIONS_API_URL` | Optional externally reachable full operations API | Leave unset for browser-local scenarios; D1 can still persist Agent Ledger revisions independently |
| `AEGIS_ALLOWED_ORIGINS` | API/WebSocket CORS origin | Exact final HTTPS origin; do not use `*` in production |
| `AEGIS_TLS_ENABLED` | Select HTTP or HTTPS topology | Enable only after certificate files exist |
| `AEGIS_RATE_LIMIT_PER_MINUTE` | Request protection | Tune after load test; keep a finite value |
| `AEGIS_MAX_PAYLOAD_BYTES` | Request size boundary | Keep bounded |
| `AEGIS_WEBSOCKET_REPLAY_LIMIT` | Reconnect replay boundary | Keep bounded to instance memory |
| `AEGIS_PUBLIC_DATA_USER_AGENT` | Identifiable public-source request suffix | Include a project contact where provider policy requests it |
| `OPENAI_COMPATIBLE_PROVIDER` | Optional provider display name | Server-side only |
| `OPENAI_COMPATIBLE_BASE_URL` | Optional OpenAI-compatible API base | Use HTTPS and a trusted provider |
| `OPENAI_COMPATIBLE_API_KEY` | Optional compatible-provider credential | Secret; never expose to the browser |
| `OPENAI_COMPATIBLE_MODEL` | Optional compatible model ID | Match the configured provider |
| `GROQ_API_KEY` | Optional Groq credential | Server-side secret; may be omitted |
| `GROQ_MODEL` | Optional Groq model ID | Current source defaults to `openai/gpt-oss-20b`; pin deliberately for a release |
| `AEGIS_LEDGER_DB` | Cloudflare D1 binding for Agent Ledger revisions | Configure as a Wrangler D1 binding, not a secret or Oracle database variable |
| `AI` | Cloudflare Workers AI binding | Wrangler service binding; no API key is stored in application configuration |

Optional AI or media secrets must be server-side only. A browser-visible `NEXT_PUBLIC_*` token is not acceptable for a private provider credential.

For Cloudflare, add optional compatible-provider or Groq credentials with Worker secret storage. PostgreSQL variables in this table belong to the Oracle Compose stack. `AEGIS_LEDGER_DB` stores only Agent Ledger receipt revisions, while `AI` supplies the zero-secret Workers AI narrative path.

## Post-deployment acceptance

Record the following in the release notes:

- public HTTPS URL;
- Git commit and release tag;
- deployment timestamp in UTC and IST;
- web/API health result;
- database/PostGIS/cache/WebSocket state;
- browser and Lenovo LOQ judge-flow result;
- provider degradation observed during acceptance;
- Windows artifact names and SHA-256 values, if shipped;
- known fidelity limitations and external data still required.

## Operations after launch

- Schedule database backups and ACME renewal.
- Test restore on a non-production copy.
- Keep Redis disposable; PostgreSQL is the source of record.
- Retain nginx and service log rotation.
- Apply security updates and use the supplied update/rollback scripts.
- Monitor disk, memory, container restarts, API latency, error rate and public-provider failures.
- Rehearse rollback before the event.
- Keep a known-good release tag and the judge evidence packet available.

## Final external items that source code cannot complete

- Oracle tenancy, compute capacity, VCN, public IP and SSH authority;
- Cloudflare account authorisation and optional custom-domain control;
- domain choice, DNS change and TLS issuance;
- official EIT boundary/site plan, BIM/CAD/GLB, verified building names/heights/functions/entrances, gates, safe areas, surveyed terrain/drainage, roads, occupancy/accessibility and utilities;
- any optional external AI or media account and its secret;
- team-owned Windows signing certificate and final owned icon, if distribution trust is required.

These must be described as **owner-provided external inputs**, not as software defects silently solved with fabricated data.
