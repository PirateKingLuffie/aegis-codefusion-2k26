# Platform build guide

All active commands run from `E:\CodeFusion EIT Hackathon\AEGIS` or its subdirectories. Project files, npm cache, Rust toolchain, Cargo cache, temporary files and release outputs remain on drive E. The active hackathon targets are the responsive web command center and the Windows desktop shell. Phone builds are deferred and documentation-only.

## Final release snapshot

The final build pass found the following on the Lenovo LOQ:

| Component | Detected state |
| --- | --- |
| Node.js / npm | Installed; Node 25.6 and npm 11.7 satisfy the Node 22.13+ requirement |
| Tauri CLI | Installed in `platforms/windows/node_modules`; version 2.11.4 |
| Microsoft C++ Build Tools / MSVC | Installed and discoverable by `vswhere` |
| Windows SDK | Installed; 10.0.26100 |
| Microsoft Edge WebView2 Runtime | Installed; version 151 |
| Rust / Cargo | Stable MSVC toolchain installed under `E:\Toolchains` by the E-only installer |
| Portable desktop executable | `artifacts/releases/AEGIS-Windows-x64-Portable-v0.1.0.exe` — 3,277,312 bytes |
| Current-user NSIS installer | `artifacts/releases/AEGIS-Windows-x64-Setup-v0.1.0.exe` — 1,077,555 bytes |

The final rebuild completed at `2026-08-20T21:29:16.744481Z`:

| Artifact | SHA-256 |
| --- | --- |
| `AEGIS-Windows-x64-Portable-v0.1.0.exe` | `7d22992055d7b23b0137a72c0e4c1733d37ecc6b66f46ee07e4c962a7c1a7d2b` |
| `AEGIS-Windows-x64-Setup-v0.1.0.exe` | `2979c098c451c324944458d134760183a7ee7669bc07ae573a665f9fd8d1858f` |

The independent manifest/hash comparison matched both files. Authenticode state is `NotSigned`, as declared; signing requires a team-owned certificate. The artifacts use the shared AEGIS service and do not bundle a database or install a background web service.

## Public web service

- Command center: https://aegis-codefusion-2k26.guptashivaani233.workers.dev
- Dedicated Agent Ledger: https://aegis-agent-ledger-codefusion-2k26.guptashivaani233.workers.dev/agent-ledger

These Cloudflare deployments are the active judge targets. D1 stores Agent Ledger receipt revisions; it is not the full PostGIS/FastAPI operational backend.

## Developer-only local verification

From the repository root:

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS'
$env:npm_config_cache = 'E:\CodeFusion EIT Hackathon\AEGIS\.npm-cache'
npm ci --prefer-offline --no-audit --no-fund
npm run verify
npm run demo
```

This optional command is for development verification only. Use the published HTTPS command center for the judge presentation, and never expose a development server directly to the public internet.

The application has server-rendered routes and server API endpoints. It is not a static folder that can be copied into a WebView. The Windows shell therefore opens a separately running AEGIS service, either the local production server or a configured HTTPS deployment.

## Windows 10/11 - Tauri 2

### Inspect prerequisites

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run toolchain
```

`Test-Toolchain.ps1` reports Node, npm, the local Tauri CLI, Rust, Cargo, MSVC, Windows SDK and WebView2. The release script runs the same check with `-RequireComplete` before compiling.

### Install Rust entirely on drive E

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run rust:install:e
```

The script downloads the official Windows Rust installer to `E:\Toolchains\installers`, installs the stable `x86_64-pc-windows-msvc` toolchain under `E:\Toolchains\rustup` and `E:\Toolchains\cargo`, and uses `E:\Toolchains\temp`. It does not modify the system `PATH`. The release script supplies those locations automatically. The toolchain is already installed on the current Lenovo LOQ; rerun this command only when repairing or recreating it.

### Build the release

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run release
```

`Build-Release.ps1` keeps npm, Cargo, target, temporary and local-app-data caches on E; restores dependencies; builds the shared web application; compiles the Tauri client without signing; and copies the deliverables to `E:\CodeFusion EIT Hackathon\AEGIS\artifacts\releases`:

- `AEGIS-Windows-x64-Portable-v0.1.0.exe`
- `AEGIS-Windows-x64-Setup-v0.1.0.exe`
- `AEGIS-Windows-SHA256SUMS.txt`
- `AEGIS-Windows-release.json`

The NSIS installer is current-user, English-only and does not require administrator installation. The release manifest records that the artifacts are unsigned. A team-owned code-signing certificate and final icon set are optional distribution work, not hackathon runtime requirements.

### Start the desktop client

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-AEGIS.ps1
```

For the default local URL, the launcher starts the production web server if it is not healthy, waits for `/api/health`, and then opens the newest portable AEGIS executable. To use a deployed service:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Start-AEGIS.ps1 -ServerUrl 'https://aegis-codefusion-2k26.guptashivaani233.workers.dev'
```

The desktop executable is a Tauri/WebView2 command-center client, not a bundled database or background server. Its full durable workflow uses the same web/API deployment described below.

### Final acceptance boundary

The final canonical `npm run verify` passed 67 total tests: 66 passed, zero failed and one intentional optional-network skip. Typecheck, lint and production build passed with only the documented large-chunk advisory. Release hashes, backend/API checks and deployed HTTP workflows are also verified. Remote-browser acceptance confirmed labelled globe rotation, world search and deep street zoom without a black canvas or console errors. Before judging, repeat the complete flow on the Lenovo LOQ to validate its specific GPU driver, Chrome build, panel layouts, Site 3D, simulation playback, evacuation, Agent Ledger and external-link behavior.

## Phone history - deferred

The retained Capacitor/Android source and historical unsigned debug APK preserve earlier exploration only. They are not active deliverables, are not target-device validated and must not be presented as a completed phone app. No Android or iPhone build is required for the current hackathon scope.

## Connectivity expectations

The active demo is online-first. Live map styles and tiles, terrain, geocoding, road geometry, weather, global incident feeds and media metadata depend on internet access and healthy public providers. AEGIS exposes unavailable or degraded providers instead of replacing missing external context with invented observations. Hazard simulation, impact screening, route-capacity logic and the operations brief are deterministic application logic and require no paid model or API key.

## Oracle Free Tier handoff

The repository includes the Compose topology, PostGIS schema, Redis cache, FastAPI persistence/WebSocket service, nginx HTTP/HTTPS templates, health checks, firewall bootstrap, backups, log rotation, restart policy, update and rollback scripts. Creating the Oracle instance, public IP, DNS record and TLS certificate still requires the owner's Oracle account and domain control. Copy `deployment/.env.example`, replace every placeholder secret and origin, then follow `deployment/README.md`.
