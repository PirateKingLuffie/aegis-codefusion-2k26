import { rankInterventions, runSimulation } from "@/lib/simulation";
import { apiScenarioSchema, readBoundedJson, scenarioFromApi, validationIssues } from "@/lib/simulation/api-contract";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBoundedJson(request);
    const input = typeof body === "object" && body && "scenario" in body
      ? (body as { scenario: unknown }).scenario
      : body;
    const parsed = apiScenarioSchema.safeParse(input);
    if (!parsed.success) {
      return Response.json({ error: "Intervention request validation failed.", issues: validationIssues(parsed.error) }, { status: 422 });
    }
    const scenario = scenarioFromApi(parsed.data);
    const baseline = runSimulation(scenario);
    return Response.json({
      apiVersion: "2026-08-13",
      classification: "SIMULATED_INTERVENTION_COMPARISON",
      ranking: rankInterventions(scenario, baseline),
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Intervention ranking failed." }, { status: 422 });
  }
}
