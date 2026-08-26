# AEGIS documentation index

- Live command center: https://aegis.guptashivaani233.workers.dev
- Dedicated Agent Ledger: https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger
- Source repository: https://github.com/PirateKingLuffie/aegis-codefusion-2k26
- Windows and presentation downloads: https://github.com/PirateKingLuffie/aegis-codefusion-2k26/releases/tag/v0.1.0

## For the judge presentation

1. `JUDGE_NOTES.txt` at the repository root — one-page speaking card.
2. `JUDGE_BRIEF.md` — pitch, uniqueness, safe claims, Q&A and closing.
3. `DEMO_RUNBOOK.md` — timed 5–7 minute flow, preflight, backup ladder and troubleshooting.
4. `AI_AGENT_LEDGER.md` — separate agent audit site, provider failover, hash-linked integrity receipts and human review.

## For technical review

1. `ARCHITECTURE.md` — system boundaries, data flow, deterministic/AI split and deployment topology.
2. `API_AND_PROVIDERS.md` — web API, durable API, agent API, provider roles, evidence classes and secret rules.
3. `DATA_PROVENANCE.md` — full truth policy and source limitations.
4. `EIT_DATA_IMPORT.md` — verified campus-data replacement contract.
5. `GLOBE_AND_UI_ACCEPTANCE.md` — globe-to-street behaviour, UI standard and release checks.

## For release and operations

1. `DEPLOYMENT_HANDOFF.md` — GitHub gates, Oracle owner inputs, deployment sequence and acceptance record.
2. `PLATFORM_BUILDS.md` — Windows Tauri build and deferred phone scope.
3. `deployment/README.md` — exact Oracle/Compose operations.

## Reading order for a new reviewer

Read `JUDGE_BRIEF.md`, then `ARCHITECTURE.md`, then `DATA_PROVENANCE.md`. Those three explain the product, how it works and what it deliberately does not claim.
