# Automation and live-evidence companion surfaces

This note documents two additive AEGIS routes deployed on the public AEGIS Worker:

- `/live-context` — a source-labelled incident and evidence desk;
- `/automation` — deterministic regional watch evaluation and alert-proposal console.

Public release: `98e55b99-3e20-47b2-b46b-9c205952eca5` on 29 August 2026.

They do not replace or modify the existing command-center workflow. They reuse the existing live-intelligence contracts and deliberately keep simulations, source reports and notification delivery separate.

## Architecture

### Live Evidence Desk

```text
/live-context
    |
    +-- GET /api/live?limit=30&days=<n>&includeMedia=false
            |
            +-- NASA EONET
            +-- USGS significant-earthquake feed
            +-- GDACS multi-hazard event feed
            +-- Google News RSS metadata
            +-- ReliefWeb, only when RELIEFWEB_APPNAME is configured
            +-- dated AEGIS source snapshot when the configured live sources
                do not return the matching Assam flood context
```

`/api/live` normalises each provider into the shared `LiveIncident` schema. Provider requests are isolated: one failed upstream becomes a `degraded` source record instead of removing successful records from the other providers. The in-memory cache windows are 60 seconds for USGS, 120 seconds for NASA EONET and GDACS, 180 seconds for Google News RSS, and 300 seconds for an enabled ReliefWeb adapter. These caches reduce upstream load; they are not durable storage.

The desk supports manual refresh and optional 60-second refresh while the page is open and the browser tab is visible. Its place, hazard and lookback controls filter the returned evidence. Selecting a record shows provider timestamps, location, data class, reported impact metrics, provider telemetry and official/source links. The existing AEGIS media dialog is reused for contextual media discovery; unrelated footage is not substituted when a relevant result is unavailable.

NASA Worldview and Copernicus Emergency Management Service links are evidence-discovery tools. Their imagery and assessments retain their own acquisition or publication time and are never described as continuous live video.

### Regional Watch Automation

```text
/automation
    |
    +-- GET /api/automation
    |       +-- capability declaration
    |       +-- default policy
    |       +-- example region watches
    |
    +-- POST /api/automation
            +-- validate bounded request
            +-- obtain public incidents in live mode
            +-- normalise location, age, source and severity
            +-- evaluate circle/bounds watches
            +-- apply source, hazard, age and severity policy
            +-- deduplicate with caller-held receipts
            +-- return alert proposals marked NOT SENT
```

Live mode rejects caller-supplied incidents and obtains records through the public live-intelligence aggregator. Demo mode can accept a validated incident set or use the bundled offline rehearsal records. A simulated record is rejected in live mode and remains explicitly simulated in demo mode.

The evaluator is deterministic. It supports circle and rectangular bounds, including antimeridian-crossing bounds, and checks:

1. geographic inclusion;
2. selected hazard categories;
3. minimum severity;
4. incident state;
5. observation/publication age;
6. source-retrieval age;
7. official-source policy;
8. live-versus-simulated mode.

Caller-held receipts create stable deduplication keys from region, source and incident identifiers. The companion console validates and retains up to 512 of those receipts in browser-local storage so a reload does not silently reclassify an unchanged incident as new. A changed fingerprint can produce an `update`; a higher severity can produce an `escalation`; an unchanged record stays suppressed until the region cooldown permits a uniquely identified `reminder`. Every returned alert has `delivery: "not-sent"`, `humanReviewRequired: true`, an expiry time and a safety notice.

## Truth and provenance classes

Three independent fields must be read together. A recently retrieved record is not necessarily a current observation.

| Dimension | Values | Meaning |
| --- | --- | --- |
| Reality | `observed`, `simulated` | Whether a provider/source record describes a real-world observation/report or an AEGIS rehearsal record |
| Data mode | `near-real-time`, `recent-report`, `cached-source-snapshot`, `simulated-demo` | The operational class of the incident record |
| Retrieval status | `live`, `cached`, `degraded`, `unavailable` | Whether the adapter was retrieved successfully now, served cached context, failed partially or was unavailable |
| Freshness | `live`, `near-real-time`, `recent`, `aging`, `archived`, `unknown` | Age of the upstream observation or publication, not merely the AEGIS request time |

Automation proposals add one of two unambiguous data classes:

- `OBSERVED_SOURCE_REPORT` — a source-backed real-world record that passed the active watch policy;
- `SIMULATED_TEST_RECORD` — a rehearsal record accepted only in demo mode.

Provider-specific cautions remain visible:

- NASA EONET is near-real-time event metadata; individual geometry dates vary.
- USGS parameters can be revised as observations are reviewed.
- GDACS alert levels provide early-warning context and are not proof of local damage.
- Google News supplies headline metadata and publisher links; the publisher report remains the source to verify.
- ReliefWeb republishes partner situation reports and requires an approved application name.
- Wikimedia Commons or YouTube metadata can provide contextual media discovery, but AEGIS does not certify footage as live, authentic or incident-local.
- The dated AEGIS source snapshot is never promoted to live status.

## Current limits and safety boundary

The source intentionally stops before autonomous public warning or government dispatch:

- there is no SMS, email, phone call, operating-system push, siren, government CAP feed or responder dispatch;
- `/api/automation` has no server scheduler, persistent subscription, queue or external delivery provider;
- browser polling runs only while `/automation` is open and the tab is visible;
- browser notifications require an explicit permission click and apply only to that browser/device session capability;
- configured watches, deduplication receipts, the in-page notification log and already-shown identifiers are browser-local; they are caller-managed and are not a durable server record;
- every proposal requires human review and is not an evacuation order, casualty statement or official warning;
- provider availability, coverage, cadence and accuracy remain external constraints.

Request and evaluation bounds are enforced:

- request body: 768 KB maximum;
- request schema: up to 32 regions, 500 incidents and 512 prior receipts;
- default evaluation policy: 16 regions and 240 incidents;
- returned receipt history: 512 maximum;
- returned match detail: 100 records per region maximum;
- proposed alert detail: 50 records per region maximum;
- same-origin browser use: cross-origin wildcard access is not enabled;
- evaluation throttle: a best-effort per-instance limit of 30 POST requests per client per minute;
- default maximum observation age: 24 hours;
- default maximum source-retrieval age: 45 minutes;
- configurable observation/cooldown range: up to seven days;
- configurable retrieval-age range: up to 24 hours;
- official-source requirement: enabled by default.

These limits prevent the demo endpoint from becoming an unbounded feed processor. They are not emergency-service capacity claims.

## Verification

From `E:\CodeFusion EIT Hackathon\AEGIS`, use Node.js 22 or newer:

```powershell
npm ci
npm run typecheck
npm run lint
npx tsx --test tests/automation.test.mjs
npm run verify
```

The focused automation tests cover first proposals, cooldown suppression, unique reminder IDs, escalation, stale/unverified/missing-time rejection, provider-failure semantics, unique region identifiers, live/demo separation, antimeridian bounds and policy bounds. Before publishing a release, also use a clean browser session to verify:

- `/live-context` loads provider telemetry, filters records and preserves truth labels;
- upstream failure appears as degraded status without erasing healthy providers;
- source links and media results correspond to the selected incident;
- `/automation` can add, pause and remove a browser-local watch;
- live mode rejects simulated/caller-supplied live data;
- repeated evaluations suppress duplicates until an update, escalation or cooldown reminder;
- notification permission is requested only by the explicit control;
- reloading the page does not imply a background or government subscription;
- no browser console error or secret appears in the client bundle.

## Controlled deployment

The companion routes passed the release gates and were published without modifying the existing command-center renderer. For a future owner-authorised Cloudflare release:

1. run the verification sequence above and complete the clean-browser checks;
2. review `git diff` and scan the repository/history for credentials;
3. commit and tag the exact verified revision;
4. run `npm run build:vinext`;
5. authenticate Wrangler using the owner-controlled Cloudflare account;
6. configure `RELIEFWEB_APPNAME` server-side only if the approved free ReliefWeb identifier is available;
7. run `npm run deploy:vinext`;
8. verify `/`, `/live-context`, `/automation`, `/api/live` and both automation API methods from a clean external browser;
9. record the new commit, Worker version, timestamp, provider state and acceptance result.

The four default public incident adapters require no client API key. Optional provider identifiers or future delivery credentials must stay in Cloudflare secrets or the Oracle server environment, never in `NEXT_PUBLIC_*`, source files, logs or screenshots. The full Oracle procedure remains in [Deployment handoff](DEPLOYMENT_HANDOFF.md) and [deployment/README.md](../deployment/README.md).

## Future authorised notification integration

Actual phone delivery or government-system integration is a separate controlled project, not a UI toggle. A defensible implementation would add:

1. a service worker and standards-based Web Push subscription flow with explicit opt-in, unsubscribe and per-device status;
2. server-side VAPID/private keys and encrypted subscription storage;
3. a durable scheduler/queue that re-evaluates watches when no browser tab is open;
4. authenticated operator identities, roles and jurisdiction-scoped permissions;
5. an approval state machine so proposed, reviewed, approved, sent, acknowledged, expired and revoked states cannot be confused;
6. signed, idempotent delivery jobs with rate limits, retry/backoff, dead-letter handling and provider receipts;
7. message templates that retain source, observation time, uncertainty, geography and expiry;
8. a kill switch, test/sandbox mode, escalation tree and independent audit trail;
9. an authorised channel adapter for each jurisdiction, such as a standards-compliant CAP endpoint where the responsible authority provides credentials and permission;
10. legal, privacy, accessibility, retention and emergency-management review before any public-warning channel is enabled.

Web Push can provide owner-approved device notifications. It does not create authority to issue government alerts. Government delivery must use the responsible authority's documented onboarding, credentials, policy and human approval; it must never be reverse-engineered or simulated as a real dispatch.
