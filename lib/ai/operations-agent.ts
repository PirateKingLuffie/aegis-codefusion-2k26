export type OperationsDecision = {
  summary: string;
  evidence: string[];
  prediction: string;
  confidence: number;
  recommendation: string;
  risks: string[];
  alternatives: string[];
  source: "deterministic-engine";
  latencyMs: number;
};

export type AegisOperationalState = {
  incident?: Record<string, unknown>;
  simulation?: Record<string, unknown>;
  evacuation?: Record<string, unknown>;
  infrastructure?: Record<string, unknown>;
  evidence?: Array<Record<string, unknown>>;
};

function optionalNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function deterministicDecision(
  query: string,
  state: AegisOperationalState,
  startedAt = performance.now(),
): OperationsDecision {
  const simulation = state.simulation ?? {};
  const evacuation = state.evacuation ?? {};
  const infrastructure = state.infrastructure ?? {};
  const peakDepth = optionalNumber(simulation.peakDepthM);
  const blockedRoads = optionalNumber(simulation.blockedRoads);
  const exposedPopulation = optionalNumber(simulation.exposedPopulation);
  const evacuationMinutes = optionalNumber(evacuation.totalMinutes);
  const hospitalLoad = optionalNumber(infrastructure.hospitalLoadPct);
  const suppliedConfidence =
    optionalNumber(simulation.confidence) ??
    optionalNumber(simulation.confidenceScore);
  const normalizedQuery = query.toLowerCase();
  const hasSimulationState =
    peakDepth !== null ||
    blockedRoads !== null ||
    exposedPopulation !== null;

  let recommendation = hasSimulationState
    ? "Review the generated evacuation stages, preserve the lowest-risk emergency corridor, and require operator approval before dispatch."
    : "Select a location and run a deterministic scenario before requesting an operational recommendation.";
  if (normalizedQuery.includes("bridge") && hasSimulationState) {
    recommendation =
      "Inspect the bridge-impact layer and close only the approaches screened unsafe at the selected time; then regenerate routes around the closure.";
  } else if (normalizedQuery.includes("hospital") && hasSimulationState) {
    recommendation =
      "Protect the lowest-risk hospital corridor, compare projected occupancy with verified capacity, and regenerate the plan if access degrades.";
  } else if (normalizedQuery.includes("rain") && hasSimulationState) {
    recommendation =
      "Create a higher-rainfall branch, compare its closure and exposure timeline with the baseline, and advance departures only where the deterministic branch supports it.";
  }

  const evidence = [
    peakDepth === null
      ? null
      : `Deterministic simulation: peak depth ${peakDepth.toFixed(2)} m`,
    blockedRoads === null
      ? null
      : `Road impact screen: ${Math.round(blockedRoads)} links unavailable or predicted unavailable`,
    exposedPopulation === null
      ? null
      : `Population exposure screen: ${Math.round(exposedPopulation).toLocaleString("en-IN")} people`,
    hospitalLoad === null
      ? null
      : `Hospital capacity screen: ${Math.round(hospitalLoad)}% projected occupancy`,
    evacuationMinutes === null
      ? null
      : `Evacuation plan: ${Math.round(evacuationMinutes)} estimated clearance minutes`,
  ].filter((item): item is string => item !== null);

  const summaryParts = [
    peakDepth === null ? null : `${peakDepth.toFixed(2)} m peak water depth`,
    blockedRoads === null ? null : `${Math.round(blockedRoads)} unavailable road links`,
    exposedPopulation === null
      ? null
      : `${Math.round(exposedPopulation).toLocaleString("en-IN")} people in the exposure screen`,
  ].filter((item): item is string => item !== null);

  return {
    source: "deterministic-engine",
    latencyMs: Math.max(1, Math.round(performance.now() - startedAt)),
    summary: summaryParts.length
      ? `The supplied deterministic state reports ${summaryParts.join(", ")}.`
      : "No deterministic simulation result was supplied, so AEGIS is withholding numerical impact claims.",
    evidence: evidence.length
      ? evidence
      : ["Simulation, evacuation and infrastructure measurements are currently unavailable."],
    prediction:
      hospitalLoad !== null && hospitalLoad >= 90
        ? "Hospital access becomes the dominant cascade risk before the flood reaches its maximum extent."
        : hasSimulationState
          ? "Road and facility accessibility should be evaluated at each timeline step before the plan is approved."
          : "A prediction is unavailable until a deterministic scenario result is supplied.",
    confidence:
      suppliedConfidence === null
        ? hasSimulationState ? 0.55 : 0.2
        : Math.min(1, Math.max(0, suppliedConfidence)),
    recommendation,
    risks: [
      "Imported map context and estimated local assets may not match field conditions.",
      "Population, terrain and drainage values require provenance checks before operational use.",
      "Live conditions can diverge from the deterministic scenario.",
    ],
    alternatives: [
      "Prioritize minimum evacuation time.",
      "Prioritize hospital access and medical continuity.",
      "Hold evacuation and deploy reconnaissance first.",
    ],
  };
}

export async function buildOperationsBrief(
  query: string,
  state: AegisOperationalState,
): Promise<OperationsDecision> {
  const startedAt = performance.now();
  // Numerical decisions stay entirely local and reproducible. This endpoint
  // deliberately has no hosted-model path, billing key or variable latency.
  return deterministicDecision(query, state, startedAt);
}
