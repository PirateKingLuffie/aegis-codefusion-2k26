"use client";

import { useEffect } from "react";

export default function ApplicationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("AEGIS application boundary", error);
  }, [error]);

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24, background: "#030404", color: "#f0f1f1", fontFamily: 'Inter, "Segoe UI", sans-serif' }}>
      <section style={{ width: "min(560px, 100%)", padding: 28, border: "1px solid #2a2d2e", background: "#090a0b" }}>
        <small style={{ color: "#a1a6a8", letterSpacing: ".12em" }}>AEGIS RECOVERY</small>
        <h1 style={{ margin: "10px 0", fontSize: 24 }}>The command view needs to restart.</h1>
        <p style={{ color: "#aeb3b5", lineHeight: 1.55 }}>The simulation data is deterministic and browser workspaces remain stored locally. Retry the interface; if the map provider failed, AEGIS will attempt its independent fallback.</p>
        <button type="button" onClick={reset} style={{ minHeight: 42, padding: "0 16px", color: "#090a0b", border: 0, background: "#eef0f0", fontWeight: 750, cursor: "pointer" }}>Restart command view</button>
      </section>
    </main>
  );
}
