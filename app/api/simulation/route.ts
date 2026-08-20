import { buildAegisMapLayers } from "@/lib/simulation/map-adapter";
import {
  buildImpactSnapshot,
  buildImpactTimeline,
  createEvacuationPlan,
  runSimulation,
  summarizeForClient,
} from "@/lib/simulation";
import {
  evacuationRequestFromApi,
  readBoundedJson,
  scenarioFromApi,
  simulationApiRequestSchema,
  validationIssues,
} from "@/lib/simulation/api-contract";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readBoundedJson(request);
    const parsed = simulationApiRequestSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json({
        error: "Simulation request validation failed.",
        issues: validationIssues(parsed.error),
      }, { status: 422, headers: { "Cache-Control": "no-store" } });
    }

    const scenario = scenarioFromApi(parsed.data.scenario);
    const result = runSimulation(scenario);
    const evacuationPlan = typeof parsed.data.evacuation === "object"
      ? createEvacuationPlan(
          scenario,
          result,
          evacuationRequestFromApi(parsed.data.evacuation),
        )
      : undefined;
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
    const impactTimeline = parsed.data.includeImpactTimeline
      ? buildImpactTimeline({
          scenario,
          result,
          selectedMinute: parsed.data.selectedMinute,
          evacuationPlan,
        }, parsed.data.maxImpactTimelinePoints)
      : undefined;
    const { field, ...boundedResult } = result;

    return Response.json({
      apiVersion: "2026-08-11",
      classification: "SIMULATED_PLANNING_ESTIMATE",
      persistence: "NONE",
      notice: "This endpoint executes a deterministic scenario in memory. It does not report a real incident, official closure, confirmed casualty or certified damage state.",
      scenario: {
        metadata: scenario.metadata,
        hazard: scenario.hazard,
        seed: scenario.seed,
        durationMinutes: scenario.durationMinutes,
        stepMinutes: scenario.stepMinutes,
        area: scenario.area,
        hazardSource: scenario.hazardSource,
        parameters: scenario.parameters,
        provenance: scenario.provenance,
      },
      result: parsed.data.includeField ? result : {
        ...boundedResult,
        fieldOmitted: true,
        fieldCellCount: field.length,
      },
      summary: summarizeForClient(result, evacuationPlan),
      impactSnapshot,
      impactTimeline,
      evacuationPlan,
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
      error: "The deterministic simulation could not be completed.",
      detail: error instanceof Error ? error.message : "Unknown simulation error.",
    }, { status: 422, headers: { "Cache-Control": "no-store" } });
  }
}
