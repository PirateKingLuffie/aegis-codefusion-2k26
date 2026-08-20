import type {
  Confidence,
  HazardCellSample,
  ModePassability,
  TravelMode,
} from "../domain/types";

const TRAVEL_MODES: TravelMode[] = [
  "pedestrian",
  "car",
  "bus",
  "ambulance",
  "heavy_rescue",
];

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function confidence(
  score: number,
  basis: string[],
  limitations: string[],
): Confidence {
  const bounded = round(clamp(score, 0, 1), 2);
  return {
    score: bounded,
    band: bounded >= 0.78 ? "high" : bounded >= 0.55 ? "medium" : "low",
    basis,
    limitations,
  };
}

/**
 * Normalises unlike hazard samples to a 0-1 planning-risk index. This is a
 * deterministic screening relationship, not a probability of loss or injury.
 */
export function hazardRiskRatio(sample: HazardCellSample): number {
  if (sample.hazard === "flood") {
    return clamp(Math.max(sample.depthM / 1.2, sample.velocityMps / 1.8), 0, 1);
  }
  if (sample.hazard === "earthquake") {
    return clamp(
      Math.max(
        (sample.mmi - 3) / 6,
        sample.pgaG / 0.8,
        sample.debrisRisk,
        sample.liquefactionProbability * 0.9,
        sample.bridgeDemandIndex * 0.85,
      ),
      0,
      1,
    );
  }
  if (sample.hazard === "wildfire") {
    return clamp(
      Math.max(
        sample.firelineIntensityKwM / 2_400,
        sample.radiantHeatKwM2 / 10,
        sample.smokeIndex * 0.72,
        sample.emberSpottingRisk * 0.82,
      ),
      0,
      1,
    );
  }
  if (sample.hazard === "cyclone") {
    return clamp(
      Math.max(
        sample.gustKph / 205,
        sample.surfaceFloodDepthM / 1.2,
        sample.debrisRisk,
        sample.powerFailureRisk * 0.82,
      ),
      0,
      1,
    );
  }
  return clamp(
    Math.max(sample.exposureRatio / 3, sample.indoorExposureRatio / 1.5),
    0,
    1,
  );
}

interface ModeScreen {
  passable: boolean;
  ratio: number;
  basis: string[];
  limitations: string[];
  reason: string;
}

function screenMode(sample: HazardCellSample, mode: TravelMode): ModeScreen {
  if (sample.hazard === "flood") {
    const depthThresholdM: Record<TravelMode, number> = {
      pedestrian: 0.1,
      car: 0.15,
      bus: 0.25,
      ambulance: 0.3,
      heavy_rescue: 0.6,
    };
    const velocityThresholdMps: Record<TravelMode, number> = {
      pedestrian: 0.45,
      car: 0.8,
      bus: 1,
      ambulance: 1,
      heavy_rescue: 1.5,
    };
    const ratio = Math.max(
      sample.depthM / depthThresholdM[mode],
      sample.velocityMps / velocityThresholdMps[mode],
    );
    return {
      passable: ratio <= 1,
      ratio,
      basis: ["modelled carriageway water depth", "modelled flow velocity", `${mode} conservative screening thresholds`],
      limitations: ["Road crown, hidden scour, vehicle condition and operator judgement are not resolved."],
      reason: `${round(sample.depthM)} m water and ${round(sample.velocityMps)} m/s flow ${ratio <= 1 ? "remain within" : "exceed"} the ${mode} screening envelope.`,
    };
  }

  if (sample.hazard === "earthquake") {
    const debrisTolerance: Record<TravelMode, number> = {
      pedestrian: 0.55,
      car: 0.48,
      bus: 0.42,
      ambulance: 0.52,
      heavy_rescue: 0.72,
    };
    const bridgeTolerance: Record<TravelMode, number> = {
      pedestrian: 0.72,
      car: 0.62,
      bus: 0.48,
      ambulance: 0.56,
      heavy_rescue: 0.42,
    };
    const displacementToleranceCm: Record<TravelMode, number> = {
      pedestrian: 16,
      car: 12,
      bus: 9,
      ambulance: 10,
      heavy_rescue: 8,
    };
    const ratio = Math.max(
      sample.debrisRisk / debrisTolerance[mode],
      sample.bridgeDemandIndex / bridgeTolerance[mode],
      sample.groundDisplacementCm / displacementToleranceCm[mode],
      sample.liquefactionProbability / (mode === "pedestrian" ? 0.72 : 0.52),
    );
    return {
      passable: ratio <= 1,
      ratio,
      basis: ["debris risk", "bridge demand", "ground displacement", "liquefaction proxy"],
      limitations: ["No field obstruction report, pavement inspection or bridge clearance is connected."],
      reason: `Earthquake access screen is ${round(ratio * 100, 0)}% of the ${mode} limit; heavy vehicles use a stricter bridge-demand limit.`,
    };
  }

  if (sample.hazard === "wildfire") {
    const minimumVisibilityM: Record<TravelMode, number> = {
      pedestrian: 120,
      car: 180,
      bus: 260,
      ambulance: 180,
      heavy_rescue: 140,
    };
    const radiantToleranceKwM2: Record<TravelMode, number> = {
      pedestrian: 2.5,
      car: 4,
      bus: 3.5,
      ambulance: 4,
      heavy_rescue: 5,
    };
    const visibilityRatio = sample.visibilityM <= 0
      ? Number.POSITIVE_INFINITY
      : minimumVisibilityM[mode] / sample.visibilityM;
    const ratio = Math.max(
      sample.radiantHeatKwM2 / radiantToleranceKwM2[mode],
      visibilityRatio,
      sample.emberSpottingRisk / (mode === "pedestrian" ? 0.46 : 0.7),
      sample.burning ? 1.25 : 0,
    );
    return {
      passable: ratio <= 1,
      ratio,
      basis: ["active burn state", "radiant heat", "smoke visibility", "ember spotting"],
      limitations: ["Fire authority exclusion zones, suppression activity and real-time visibility are not connected."],
      reason: `${sample.burning ? "Active flame" : "Smoke/ember conditions"} produce ${round(ratio * 100, 0)}% of the ${mode} access limit.`,
    };
  }

  if (sample.hazard === "cyclone") {
    const gustLimitKph: Record<TravelMode, number> = {
      pedestrian: 55,
      car: 90,
      bus: 75,
      ambulance: 95,
      heavy_rescue: 115,
    };
    const depthLimitM: Record<TravelMode, number> = {
      pedestrian: 0.1,
      car: 0.15,
      bus: 0.25,
      ambulance: 0.3,
      heavy_rescue: 0.6,
    };
    const debrisTolerance: Record<TravelMode, number> = {
      pedestrian: 0.32,
      car: 0.55,
      bus: 0.45,
      ambulance: 0.62,
      heavy_rescue: 0.75,
    };
    const ratio = Math.max(
      sample.gustKph / gustLimitKph[mode],
      sample.surfaceFloodDepthM / depthLimitM[mode],
      sample.debrisRisk / debrisTolerance[mode],
    );
    return {
      passable: ratio <= 1,
      ratio,
      basis: ["gust speed", "combined surface-water depth", "windborne debris risk"],
      limitations: ["Vehicle stability, fallen objects, local drainage and authority closures are not observed."],
      reason: `Gust ${round(sample.gustKph, 0)} km/h, water ${round(sample.surfaceFloodDepthM)} m and debris risk screen ${mode} access at ${round(ratio * 100, 0)}% of limit.`,
    };
  }

  const outdoorTolerance: Record<TravelMode, number> = {
    pedestrian: 0.1,
    car: 0.35,
    bus: 0.25,
    ambulance: 0.45,
    heavy_rescue: 0.35,
  };
  const ratio = sample.exposureRatio / outdoorTolerance[mode];
  return {
    passable: ratio <= 1,
    ratio,
    basis: ["outdoor toxicity-threshold ratio", `${mode} conservative exposure screen`],
    limitations: ["No respirator, PPE, vehicle sealing, field concentration or material-specific response doctrine is assumed."],
    reason: `Outdoor concentration is ${round(sample.exposureRatio)} times the scenario threshold and ${ratio <= 1 ? "within" : "above"} the ${mode} access screen.`,
  };
}

/** Returns per-mode passability with explicit evidence and limitations. */
export function screenModePassability(
  sample: HazardCellSample,
  confidenceScore: number,
): Record<TravelMode, ModePassability> {
  return Object.fromEntries(TRAVEL_MODES.map((mode) => {
    const screen = screenMode(sample, mode);
    return [mode, {
      passable: screen.passable,
      confidence: confidence(confidenceScore, screen.basis, screen.limitations),
      reason: screen.reason,
    }];
  })) as Record<TravelMode, ModePassability>;
}

export function modePassabilityBooleans(
  sample: HazardCellSample,
): Record<TravelMode, boolean> {
  return Object.fromEntries(
    TRAVEL_MODES.map((mode) => [mode, screenMode(sample, mode).passable]),
  ) as Record<TravelMode, boolean>;
}
