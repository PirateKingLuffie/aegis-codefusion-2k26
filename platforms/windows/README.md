# AEGIS Windows desktop

This directory contains the Tauri 2 / WebView2 shell for the shared AEGIS command center. The shell is intentionally small: it renders a local connection screen, validates an HTTP or HTTPS service origin, then opens the same operational interface used in the browser. It has no login layer, native command API or elevated privileges.

The desktop binary accepts a service address through `--server=https://example.invalid` or the `AEGIS_SERVER_URL` environment variable. Only HTTP and HTTPS origins without embedded credentials are accepted. With no override it checks `http://127.0.0.1:4173` and lets the operator enter another origin.

## Machine audit (21 August 2026)

| Requirement | Detected state |
| --- | --- |
| Node.js / npm | Ready: Node 25.6.0, npm 11.7.0 |
| Tauri CLI | Ready: 2.11.4, installed inside this directory |
| MSVC x64 compiler | Ready: Visual Studio Build Tools 2022 at `D:\Apps\VSBuildTools` |
| Windows SDK | Ready: 10.0.26100.0 |
| WebView2 Runtime | Ready: 151.0.4129.78 |
| Rust compiler / Cargo | Ready: 1.97.1 under `E:\Toolchains` |

Run the read-only check at any time:

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run toolchain
```

The complete toolchain is available. Rustup and Cargo remain isolated under drive E; no system-wide Rust installation is required.

## Reinstall or repair the compiler toolchain on E

The included bootstrap keeps Rustup, Cargo, downloads and temporary files on drive E and does not edit the system PATH. Run it only if the portable toolchain needs repair:

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run rust:install:e
```

The release script automatically discovers that E:-local toolchain in later terminals.

## Build verified release artifacts

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run release
```

The release pipeline performs clean npm restores, runs the shared production web build through Tauri's `beforeBuildCommand`, compiles an optimized x64 desktop binary, builds an unsigned per-user NSIS installer, and copies both artifacts to `E:\CodeFusion EIT Hackathon\AEGIS\artifacts\releases`. It also writes a SHA-256 checksum file and JSON release manifest there. No development or application server is started by the build.

Expected outputs:

- `AEGIS-Windows-x64-Setup-v0.1.0.exe`
- `AEGIS-Windows-x64-Portable-v0.1.0.exe`
- `AEGIS-Windows-SHA256SUMS.txt`
- `AEGIS-Windows-release.json`

The binaries are intentionally unsigned until Team X owns a Windows code-signing certificate, so Windows may display a publisher warning. The portable executable remains on E. Running the conventional NSIS installer uses the current user's Windows application directory.

## Local presentation launcher

`artifacts/releases/Launch-AEGIS-Desktop.cmd` calls `scripts/Start-AEGIS.ps1`. It starts the production AEGIS service only when the local health endpoint is absent, waits for health, then opens the newest portable desktop binary. If no desktop binary has been compiled yet it falls back to Edge application mode. Runtime logs stay under `artifacts/runtime` on E.

The packaged shell does not bundle Node or silently install a background service. A self-contained native bundle would require a maintained Node sidecar and materially larger installer; the current shared-service architecture avoids duplicate processes and keeps the hackathon build responsive.

## Development

```powershell
Set-Location 'E:\CodeFusion EIT Hackathon\AEGIS\platforms\windows'
npm run dev
```

This is the only command in this directory that launches the root development server. Android remains deferred and is not built by any Windows script.
