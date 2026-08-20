import { buildAegisMapLayers } from "@/lib/simulation/map-adapter";
import {
  buildImpactSnapshot,
  createEvacuationPlan,
  runSimulation,
  summarizeForClient,
} from "@/lib/simulation";
import {
  evacuationApiRequestSchema,
  evacuationRequestFromApi,
  readBoundedJson,
  scenarioFromApi,
  validationIssues,
} from "@/lib/simulation/api-contract";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBoundedJson(request);
    const parsed = evacuationApiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({
        error: "Evacuation request validation failed.",
        issues: validationIssues(parsed.error),
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }

    const scenario = scenarioFromApi(parsed.data.scenario);
    const result = runSimulation(scenario);
    const evacuationPlan = createEvacuationPlan(
      scenario,
      result,
      evacuationRequestFromApi(parsed.data.evacuation),
    );
    const impactSnapshot = buildImpactSnapshot({
      scenario,
      result,
      selectedMinute: parsed.data.selectedMinute,
      evacuationPlan,
    });
    const mapLayerBundle = parsed.data.includeMapLayers
      ? buildAegisMapLayers({
          scenario,
          result,
          selectedMinute: parsed.data.selectedMinute,
          evacuationPlan,
          impactSnapshot,
        })
      : undefined;
    const mapLayers = mapLayerBundle
      ? { ...mapLayerBundle, impactSnapshot: undefined }
      : undefined;

    return Response.json({
      apiVersion: "2026-08-11",
      classification: "DETERMINISTIC_PLANNING_ESTIMATE",
      persistence: "NONE",
      notice: "This is a generated planning option, not an official evacuation order. A human operator and local authorities must verify and approve it.",
      scenario: {
        metadata: scenario.metadata,
        hazard: scenario.hazard,
        seed: scenario.seed,
        area: scenario.area,
        hazardSource: scenario.hazardSource,
        parameters: scenario.parameters,
      },
      simulation: summarizeForClient(result, evacuationPlan),
      evacuationPlan,
      impactSnapshot,
      mapLayers,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RangeError) {
      return Response.json({ error: error.message }, { status: 413, headers: { "Cache-Control": "no-store" } });
    }
    if (error instanceof SyntaxError) {
      return Response.json({ error: "Request body must be valid JSON." }, { status: 400, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json({
      error: "The evacuation plan could not be generated.",
      detail: error instanceof Error ? error.message : "Unknown evacuation error.",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
