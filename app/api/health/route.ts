import {
  getProviderReadiness,
  summarizeProviderReadiness,
} from "@/lib/providers";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const providers = getProviderReadiness();
  const operationsApi = process.env.AEGIS_OPERATIONS_API_URL?.trim().replace(/\/$/, "");
  let persistence: Record<string, unknown> = { status: "browser-local-fallback", durable: false };
  if (operationsApi) {
    try {
      const response = await fetch(`${operationsApi}/health`, { cache: "no-store", signal: AbortSignal.timeout(900) });
      if (response.ok) persistence = { ...(await response.json() as Record<string, unknown>), durable: true };
    } catch {
      // The command center remains operational with browser-local version history.
    }
  }

  return Response.json(
    {
      status: "ok",
      service: "AEGIS command center",
      generatedAt: new Date().toISOString(),
      operatingMode: "online-first",
      operatorMode: "single-user-no-login",
      persistence,
      simulation: "deterministic-prototype",
      providers: summarizeProviderReadiness(providers),
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      },
    },
  );
}
