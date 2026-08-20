# AEGIS platform wrappers

This directory records the login-free platform shells around the shared AEGIS web application.

**Current hackathon scope: online web and Windows only.** Android work is paused. Its generated source and earlier debug APK are retained as build history, but the phone client is not part of the active demo or delivery plan. The web client is not presented as an offline-capable PWA.

| Target | Wrapper | Source directory | Current state |
| --- | --- | --- | --- |
| Online web | Shared root application | repository root | Primary; owned by the root application |
| Windows 10/11 | Tauri 2 + WebView2 | `platforms/windows` | Primary native target; unsigned x64 portable and NSIS builds produced and checksummed on this machine |
| Android | Capacitor 8 + Android WebView | `platforms/android` | **Deferred**; retained reference source and untested debug-build history only |

The Windows wrapper connects to the same HTTPS AEGIS service used by the browser. The public hackathon build targets Cloudflare Workers; the durable full operations stack can later be deployed behind HTTPS on Oracle Cloud Free Tier. No authentication screen is introduced.

Hazard calculations, evacuation planning, live-intelligence adapters, provenance rules and the operational interface remain in one shared codebase so the active web and desktop experiences do not drift.

See [`../docs/PLATFORM_BUILDS.md`](../docs/PLATFORM_BUILDS.md) for exact commands and the current build limitations.
