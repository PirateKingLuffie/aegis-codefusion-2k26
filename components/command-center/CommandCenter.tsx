"use client";

import {
  Activity,
  ArrowUpRight,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  Check,
  ChevronDown,
  CloudRain,
  Command,
  Crosshair,
  Database,
  Eye,
  FastForward,
  FolderOpen,
  Globe2,
  GripHorizontal,
  Hospital,
  Info,
  Layers3,
  MapPinned,
  Maximize2,
  Menu,
  MessageSquareText,
  Minus,
  Network,
  PanelLeft,
  PanelRight,
  Pause,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Rewind,
  Route,
  Search,
  Settings2,
  ShieldAlert,
  Siren,
  SlidersHorizontal,
  Users,
  Video,
  Warehouse,
  X,
  Zap,
} from "lucide-react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  AegisExternalOverlay,
  AegisFocusRequest,
  AegisIncident,
  AegisMapLayers,
  AegisMapSelection,
} from "@/components/map/types";
import { FeatureNavigation } from "@/components/navigation/FeatureNavigation";
import type { FeatureCollection, GeoJsonProperties, Geometry, LineString } from "geojson";
import type { HazardKind } from "@/lib/domain/types";
import {
  buildImpactSnapshot,
  createEvacuationPlan,
  createEitFaridabadScenario,
  createLocationScenario,
  distanceMeters,
  runSimulation,
  rankInterventions,
  summarizeForClient,
  type ScenarioOperatingAreaInput,
} from "@/lib/simulation";
import { buildAegisMapLayers } from "@/lib/simulation/map-adapter";
import {
  buildTwinScene,
  createEitCampusDataset,
  parseTwinCampusDataset,
  type TwinCampusDataset,
  type TwinTerrainControlPoint,
} from "@/lib/twin";
import {
  appendAuditEvent,
  appendDecisionReceipt,
  SCENARIO_PRESETS,
  buildPrintableSummaryHtml,
  buildProductAlerts,
  buildVisibleDataCsv,
  buildWorkspaceJson,
  detectIncidentChanges,
  loadAuditHistory,
  loadBookmarks,
  loadDecisionReceipts,
  loadScenarioWorkspaces,
  makeWorkspaceId,
  nextWorkspaceRevision,
  pathDistanceKm,
  polygonAreaSqKm,
  removeBookmark,
  removeScenarioWorkspace,
  saveBookmark,
  saveScenarioWorkspace,
  type DecisionReceipt,
  type ScenarioWorkspace,
  type WorkspaceAnnotation,
  type WorkspaceAuditEvent,
  type WorkspaceBookmark,
  type WorkspaceLayoutId,
} from "@/lib/workspace";
import type { CommandAction } from "./ProductPanels";
import { LiveMediaDialog } from "./LiveMediaDialog";
import { COMING_SOON, HAZARDS, type HazardId } from "./catalog";
import styles from "./command-center.module.css";
import { SelectionWorkflowCard } from "./SelectionWorkflowCard";
import {
  buildSelectionWorkflowAssessment,
  selectionAreaDimensionsMeters,
  selectionAreaSummary,
  selectionFingerprint,
  selectionHasOperationalInput,
  selectionPlanningAnchor,
  type SelectionWorkflowStage,
} from "./selection-workflow";
import { WorldLocationSearch } from "./WorldLocationSearch";
import { searchOfflineWorldPlaces, type WorldLocationSelection } from "./world-search";

const OperationalMap = lazy(async () => {
  // Fetch the renderer and its large WebGL dependency together. AegisMap's
  // internal import then resolves from the module cache instead of introducing
  // a second network round-trip after the loading shell has mounted.
  const [mapModule] = await Promise.all([
    import("@/components/map/OperationalMap"),
    import("maplibre-gl"),
  ]);
  return { default: mapModule.OperationalMap };
});
const CommandPalette = lazy(async () => {
  const panelModule = await import("./ProductPanels");
  return { default: panelModule.CommandPalette };
});
const WorkspaceManagerPanel = lazy(async () => {
  const panelModule = await import("./ProductPanels");
  return { default: panelModule.WorkspaceManagerPanel };
});
const RecoveryPanel = lazy(async () => {
  const panelModule = await import("./ProductPanels");
  return { default: panelModule.RecoveryPanel };
});
const AlertPanel = lazy(async () => {
  const panelModule = await import("./ProductPanels");
  return { default: panelModule.AlertPanel };
});
const AuditPanel = lazy(async () => {
  const panelModule = await import("./ProductPanels");
  return { default: panelModule.AuditPanel };
});

type PanelTab = "impact" | "intelligence" | "resources";
type ViewMode = "monitor" | "simulate" | "respond";
type SceneView = "world" | "twin";
type PanelDock = "floating" | "left" | "right";
type OperationalLayerId =
  | "hazard"
  | "flow"
  | "damage"
  | "roads"
  | "evacuation"
  | "facilities"
  | "structures"
  | "incidents"
  | "field";

type LayerDefinition = {
  id: OperationalLayerId;
  group: "Hazard and impact" | "Access and response" | "Context and evidence";
  label: string;
  detail: string;
  classification: "Imported" | "Estimated" | "Simulated" | "Observed";
  tone: "red" | "blue" | "green" | "amber" | "gray";
};

const LAYER_DEFINITIONS: LayerDefinition[] = [
  { id: "hazard", group: "Hazard and impact", label: "Hazard depth", detail: "Current extent and depth", classification: "Simulated", tone: "blue" },
  { id: "flow", group: "Hazard and impact", label: "Flow and direction", detail: "Velocity and movement", classification: "Simulated", tone: "blue" },
  { id: "damage", group: "Hazard and impact", label: "Damage and impact", detail: "Exposed structures and zones", classification: "Simulated", tone: "red" },
  { id: "roads", group: "Access and response", label: "Road availability", detail: "Open, restricted and closed", classification: "Simulated", tone: "gray" },
  { id: "evacuation", group: "Access and response", label: "Evacuation routes", detail: "Primary and alternate paths", classification: "Simulated", tone: "blue" },
  { id: "facilities", group: "Access and response", label: "Safe facilities", detail: "Hospitals, shelters and resources", classification: "Estimated", tone: "green" },
  { id: "structures", group: "Context and evidence", label: "3D structures", detail: "Imported footprints and estimated massing", classification: "Estimated", tone: "gray" },
  { id: "incidents", group: "Context and evidence", label: "Incident intelligence", detail: "Source-labelled global event context", classification: "Imported", tone: "amber" },
  { id: "field", group: "Context and evidence", label: "Field observations", detail: "Sensors, cameras and command posts", classification: "Estimated", tone: "amber" },
];

const LAYER_GROUPS = ["Hazard and impact", "Access and response", "Context and evidence"] as const;

const DEFAULT_LAYER_VISIBILITY: Record<OperationalLayerId, boolean> = {
  hazard: true,
  flow: true,
  damage: true,
  roads: true,
  evacuation: true,
  facilities: true,
  structures: true,
  incidents: true,
  field: true,
};

type DragOrigin = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  panelLeft: number;
  panelTop: number;
  panelRight: number;
  panelBottom: number;
};

function useDraggablePanel(panelId: string) {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [minimized, setMinimized] = useState(false);
  const [dock, setDockState] = useState<PanelDock>("floating");
  const origin = useRef<DragOrigin | null>(null);
  const restoredFromSessionRef = useRef(false);

  useEffect(() => {
    restoredFromSessionRef.current = false;
    const restoreTimer = window.setTimeout(() => {
      try {
        const saved = window.sessionStorage.getItem(`aegis-panel-${panelId}`);
        if (saved) {
          const parsed = JSON.parse(saved) as {
            offset?: { x?: number; y?: number };
            minimized?: boolean;
            dock?: PanelDock;
          };
          const savedX = parsed.offset?.x;
          const savedY = parsed.offset?.y;
          setOffset({
            x: typeof savedX === "number" && Number.isFinite(savedX) ? savedX : 0,
            y: typeof savedY === "number" && Number.isFinite(savedY) ? savedY : 0,
          });
          setMinimized(Boolean(parsed.minimized));
          if (parsed.dock === "left" || parsed.dock === "right") setDockState(parsed.dock);
        }
      } catch {
        window.sessionStorage.removeItem(`aegis-panel-${panelId}`);
      } finally {
        restoredFromSessionRef.current = true;
      }
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [panelId]);

  useEffect(() => {
    if (!restoredFromSessionRef.current) return;
    try {
      window.sessionStorage.setItem(
        `aegis-panel-${panelId}`,
        JSON.stringify({ offset, minimized, dock }),
      );
    } catch {
      // The workspace remains usable when session storage is unavailable.
    }
  }, [dock, minimized, offset, panelId]);

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || dock !== "floating") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const panelBounds = event.currentTarget
      .closest<HTMLElement>("[data-floating-panel]")
      ?.getBoundingClientRect();
    origin.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
      panelLeft: panelBounds?.left ?? 0,
      panelTop: panelBounds?.top ?? 0,
      panelRight: panelBounds?.right ?? window.innerWidth,
      panelBottom: panelBounds?.bottom ?? window.innerHeight,
    };
  }, [dock, offset.x, offset.y]);

  const onPointerMove = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = origin.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const requestedDeltaX = event.clientX - drag.startX;
    const requestedDeltaY = event.clientY - drag.startY;
    const deltaX = Math.max(
      8 - drag.panelLeft,
      Math.min(window.innerWidth - 8 - drag.panelRight, requestedDeltaX),
    );
    const deltaY = Math.max(
      8 - drag.panelTop,
      Math.min(window.innerHeight - 8 - drag.panelBottom, requestedDeltaY),
    );
    setOffset({
      x: drag.originX + deltaX,
      y: drag.originY + deltaY,
    });
  }, []);

  const stopDragging = useCallback((event: ReactPointerEvent<HTMLButtonElement>) => {
    if (origin.current?.pointerId !== event.pointerId) return;
    origin.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }, []);

  const reset = useCallback(() => {
    setOffset({ x: 0, y: 0 });
    setMinimized(false);
    setDockState("floating");
    try {
      window.sessionStorage.removeItem(`aegis-panel-${panelId}`);
    } catch {
      // Reset remains functional without browser storage.
    }
    const panel = document.querySelector<HTMLElement>(
      `[data-floating-panel="${panelId}"]`,
    );
    panel?.style.removeProperty("width");
    panel?.style.removeProperty("height");
  }, [panelId]);

  const setDock = useCallback((nextDock: PanelDock) => {
    setDockState(nextDock);
    setOffset({ x: 0, y: 0 });
    setMinimized(false);
  }, []);

  const onKeyDown = useCallback((event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const movement = event.shiftKey ? 24 : 10;
    const delta = {
      ArrowLeft: [-movement, 0],
      ArrowRight: [movement, 0],
      ArrowUp: [0, -movement],
      ArrowDown: [0, movement],
    }[event.key];
    if (!delta) return;
    event.preventDefault();
    const bounds = event.currentTarget
      .closest<HTMLElement>("[data-floating-panel]")
      ?.getBoundingClientRect();
    const deltaX = bounds
      ? Math.max(8 - bounds.left, Math.min(window.innerWidth - 8 - bounds.right, delta[0]))
      : delta[0];
    const deltaY = bounds
      ? Math.max(8 - bounds.top, Math.min(window.innerHeight - 8 - bounds.bottom, delta[1]))
      : delta[1];
    setOffset((current) => ({ x: current.x + deltaX, y: current.y + deltaY }));
  }, []);

  return {
    style: {
      "--panel-drag-x": `${offset.x}px`,
      "--panel-drag-y": `${offset.y}px`,
    } as CSSProperties,
    dragHandleProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: stopDragging,
      onPointerCancel: stopDragging,
      onKeyDown,
    },
    minimized,
    dock,
    toggleMinimized: () => setMinimized((current) => !current),
    setDock,
    reset,
  };
}

type PanelControlsProps = {
  panel: ReturnType<typeof useDraggablePanel>;
  label: string;
  onClose?: () => void;
};

function panelClassName(baseClass: string, panel: ReturnType<typeof useDraggablePanel>) {
  return [
    baseClass,
    panel.minimized ? styles.panelMinimized : "",
    panel.dock === "left" ? styles.panelDockLeft : "",
    panel.dock === "right" ? styles.panelDockRight : "",
  ].filter(Boolean).join(" ");
}

function PanelControls({ panel, label, onClose }: PanelControlsProps) {
  return (
    <div className={styles.panelControls} aria-label={`${label} panel controls`}>
      <button
        type="button"
        aria-label={`${panel.dock === "left" ? "Undock" : "Dock"} ${label} on the left`}
        aria-pressed={panel.dock === "left"}
        onClick={() => panel.setDock(panel.dock === "left" ? "floating" : "left")}
      ><PanelLeft size={14} /></button>
      <button
        type="button"
        aria-label={`${panel.dock === "right" ? "Undock" : "Dock"} ${label} on the right`}
        aria-pressed={panel.dock === "right"}
        onClick={() => panel.setDock(panel.dock === "right" ? "floating" : "right")}
      ><PanelRight size={14} /></button>
      <button
        type="button"
        aria-label={`${panel.minimized ? "Restore" : "Minimize"} ${label}`}
        aria-pressed={panel.minimized}
        onClick={panel.toggleMinimized}
      >{panel.minimized ? <Maximize2 size={14} /> : <Minus size={14} />}</button>
      {onClose ? <button type="button" aria-label={`Close ${label}`} onClick={onClose}><X size={14} /></button> : null}
    </div>
  );
}

type OperationsDecision = {
  summary: string;
  evidence: string[];
  prediction: string;
  confidence: number;
  recommendation: string;
  risks: string[];
  alternatives: string[];
  source: "deterministic-engine" | "deterministic-fallback";
  latencyMs: number;
};

type DecisionExecution = {
  mode: "hosted-model" | "deterministic-fallback";
  provider: string;
  model: string;
};

type LiveIncidentSummary = {
  id: string;
  title: string;
  summary: string;
  category: string;
  severity: "critical" | "high" | "medium" | "low" | "unknown";
  state: string;
  reality?: "observed" | "simulated";
  dataMode?: "near-real-time" | "recent-report" | "cached-source-snapshot" | "simulated-demo";
  observedAt?: string;
  freshness?: {
    band: "live" | "near-real-time" | "recent" | "aging" | "archived" | "unknown";
    label: string;
  };
  location: {
    name: string;
    coordinates?: { latitude: number; longitude: number };
  };
  provenance: {
    sourceName: string;
    status: "live" | "cached" | "degraded" | "unavailable";
  };
  impactMetrics: Array<{ key: string; label: string; value: number | string | boolean; unit?: string }>;
};

type LiveIntelligence = {
  generatedAt?: string;
  mode: "live" | "mixed" | "offline-fallback";
  incidents: LiveIncidentSummary[];
  verifiedSnapshots: LiveIncidentSummary[];
  counts: { liveSources: number; degradedSources: number };
  media?: {
    mode: "youtube-api" | "open-media" | "safe-search-links";
    status: "live" | "cached" | "degraded" | "unavailable";
    notice: string;
    videos: Array<{
      id: string;
      title: string;
      channelTitle: string;
      publishedAt: string;
      watchUrl: string;
      embedUrl?: string;
      directUrl?: string;
      mimeType?: string;
      license?: string;
    }>;
    links: Array<{ label: string; url: string; kind: string; publisher?: string }>;
  };
};

type WeatherContext = {
  mode: "live-model-feed" | "unavailable";
  source: string;
  current: {
    temperature_2m?: number;
    precipitation?: number;
    wind_speed_10m?: number;
  } | null;
};

type ProviderReadiness = {
  id: string;
  label: string;
  capability: string;
  readiness: "ready" | "optional" | "needs-configuration" | "degraded";
  detail: string;
};

type ProviderReadinessResponse = {
  generatedAt: string;
  operatingMode: "online-first";
  providers: ProviderReadiness[];
  summary: {
    total: number;
    ready: number;
    optional: number;
    "needs-configuration": number;
    degraded: number;
  };
  notice: string;
};

type OperationsStreamState = {
  status: "checking" | "connected" | "reconnecting" | "local-only";
  eventCount: number;
  lastSequence: number;
};

type GeocodeResult = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  type: string;
  dataClass?: "IMPORTED" | "REFERENCE";
};

type ActiveLocation = {
  id: string;
  name: string;
  region: string;
  latitude: number;
  longitude: number;
  fidelity: "EIT SITE MODEL" | "GLOBAL PROTOTYPE";
};

const QUICK_LOCATIONS: ActiveLocation[] = [
  { id: "eit", name: "Echelon Institute of Technology", region: "Kabulpur, Faridabad, India", latitude: 28.3912265, longitude: 77.4398682, fidelity: "EIT SITE MODEL" },
  { id: "guwahati", name: "Guwahati", region: "Assam, India", latitude: 26.1445, longitude: 91.7362, fidelity: "GLOBAL PROTOTYPE" },
  { id: "tokyo", name: "Tokyo", region: "Japan", latitude: 35.6762, longitude: 139.6503, fidelity: "GLOBAL PROTOTYPE" },
  { id: "miami", name: "Miami", region: "Florida, USA", latitude: 25.7617, longitude: -80.1918, fidelity: "GLOBAL PROTOTYPE" },
  { id: "sendai", name: "Sendai", region: "Miyagi, Japan", latitude: 38.2682, longitude: 140.8694, fidelity: "GLOBAL PROTOTYPE" },
];

type LoadedPlanningScenario = {
  id: string;
  name: string;
  brief: string;
  locationId: ActiveLocation["id"];
  hazard: HazardId;
  strength: number;
  minute: number;
  proxyLabel?: string;
};

const LOADED_PLANNING_SCENARIOS: LoadedPlanningScenario[] = [
  {
    id: "eit-campus-flood",
    name: "EIT Campus Flood Exercise",
    brief: "Campus access, building exposure and staged evacuation",
    locationId: "eit",
    hazard: "flood",
    strength: 82,
    minute: 35,
  },
  {
    id: "tokyo-earthquake",
    name: "Tokyo Earthquake Access Exercise",
    brief: "Shaking, structural screening, debris and emergency access",
    locationId: "tokyo",
    hazard: "earthquake",
    strength: 106,
    minute: 60,
  },
  {
    id: "miami-cyclone-surge",
    name: "Miami Cyclone and Surge",
    brief: "Wind, rainfall, surge and constrained coastal movement",
    locationId: "miami",
    hazard: "cyclone",
    strength: 90,
    minute: 60,
  },
  {
    id: "sendai-tsunami-proxy",
    name: "Sendai Coastal-Inundation Screen",
    brief: "Tsunami surge proxy for coastal access screening; not calibrated tsunami physics",
    locationId: "sendai",
    hazard: "cyclone",
    strength: 104,
    minute: 45,
    proxyLabel: "Cyclone surge engine proxy",
  },
];

function createFieldOverlays(location: ActiveLocation): AegisExternalOverlay[] {
  const { longitude, latitude } = location;
  return [
    {
      id: "cam-north",
      label: "Camera point · North approach",
      coordinates: [longitude - 0.00065, latitude + 0.00072],
      kind: "camera",
      status: "DEMO POSITION",
      color: "#52d7ff",
      draggable: true,
      properties: { feed: "CAM-N01", evidenceClass: "ESTIMATED POSITION" },
    },
    {
      id: "sensor-rain",
      label: "Rain gauge · RG-02",
      coordinates: [longitude + 0.00072, latitude + 0.00018],
      kind: "sensor",
      status: "SIMULATED · 64 mm/h",
      color: "#70e6bc",
      draggable: true,
      properties: { telemetry: "SIMULATED EXERCISE", battery: "ESTIMATED" },
    },
    {
      id: "mobile-command",
      label: "Mobile command post",
      coordinates: [longitude - 0.00042, latitude - 0.00067],
      kind: "command",
      status: "EXERCISE STAGING",
      color: "#ffc96c",
      draggable: true,
      properties: { team: "SIMULATED", vehicles: "ESTIMATED" },
    },
  ];
}

function runLocationDemonstration(
  location: ActiveLocation,
  hazard: HazardKind,
  parameterOverrides: Record<string, string | number | boolean>,
  hazardSource?: { lat: number; lon: number },
  surgeCapacity = false,
  operatingArea?: ScenarioOperatingAreaInput,
) {
  const seed = `AEGIS-${location.id}-${hazard}-2026`;
  const baseScenario = location.id === "eit" && !operatingArea
    ? createEitFaridabadScenario(hazard, { seed, parameterOverrides })
    : createLocationScenario({
        hazard,
        center: { lat: location.latitude, lon: location.longitude },
        locationLabel: `${location.name}, ${location.region}`,
        seed,
        parameterOverrides,
        operatingArea,
      });
  const locatedScenario = hazardSource ? { ...baseScenario, hazardSource } : baseScenario;
  const scenario = surgeCapacity
    ? {
        ...locatedScenario,
        assets: {
          ...locatedScenario.assets,
          facilities: locatedScenario.assets.facilities.map((facility) =>
            facility.type === "shelter" ? { ...facility, capacity: facility.capacity * 2 } : facility,
          ),
          responders: locatedScenario.assets.responders.map((responder) =>
            responder.type === "bus" ? { ...responder, seats: responder.seats * 2 } : responder,
          ),
        },
        provenance: [
          ...locatedScenario.provenance,
          {
            id: "response-surge-capacity",
            label: "Simulated mutual-aid shelter and bus surge",
            kind: "scenario-input" as const,
            note: "Prototype what-if: doubles shelter and evacuation-bus capacity; not a confirmed field resource.",
          },
        ],
      }
    : locatedScenario;
  const result = runSimulation(scenario);
  let evacuationPlan;
  try {
    evacuationPlan = createEvacuationPlan(scenario, result);
  } catch {
    const fallbackNode = [...scenario.assets.network.nodes]
      .sort((first, second) => second.elevationM - first.elevationM)[0];
    if (!fallbackNode) throw new Error("The selected area has no routable network nodes.");
    evacuationPlan = createEvacuationPlan(scenario, result, {
      endPoints: [{
        id: `aegis-staging-${location.id}`,
        label: "AEGIS high-ground staging point",
        coordinate: fallbackNode.coordinate,
        nodeId: fallbackNode.id,
      }],
      includeHospitals: true,
    });
  }
  return { scenario, result, evacuationPlan, summary: summarizeForClient(result, evacuationPlan) };
}

type ScenarioControl = {
  label: string;
  value: string;
  parameterOverrides: Record<string, string | number | boolean>;
  detail: [string, string, string];
};

function scenarioControl(hazard: HazardId, strength: number): ScenarioControl {
  const ratio = (strength - 20) / 120;
  switch (hazard) {
    case "earthquake": {
      const magnitude = 4.5 + ratio * 3.5;
      return {
        label: "Moment magnitude",
        value: `${magnitude.toFixed(1)} Mw`,
        parameterOverrides: { magnitudeMw: Number(magnitude.toFixed(2)) },
        detail: ["Depth 12 km", "Soil +18%", "Aftershocks on"],
      };
    }
    case "wildfire": {
      const wind = Math.round(8 + ratio * 54);
      return {
        label: "Wind-driven spread",
        value: `${wind} km/h`,
        parameterOverrides: { windSpeedKph: wind, fuelDryness: Number((0.45 + ratio * 0.45).toFixed(2)) },
        detail: ["Humidity 24%", "Wind 118°", "Smoke on"],
      };
    }
    case "cyclone": {
      const wind = Math.round(70 + ratio * 150);
      return {
        label: "Peak sustained wind",
        value: `${wind} km/h`,
        parameterOverrides: { peakWindKph: wind, rainfallMmPerHour: Math.round(32 + ratio * 70) },
        detail: ["Track NW", "Forward 16 km/h", "Surge 2.1 m"],
      };
    }
    case "industrial": {
      const release = Number((5 + ratio * 35).toFixed(1));
      return {
        label: "Release rate",
        value: `${release} kg/min`,
        parameterOverrides: { releaseKgPerMinute: release },
        detail: ["Ammonia", "Wind 14 km/h", "Stability D"],
      };
    }
    default:
      return {
        label: "Rainfall intensity",
        value: `${strength} mm/h`,
        parameterOverrides: { rainfallMmPerHour: strength },
        detail: ["Duration 120 min", "Drainage 42%", "River +0.8 m"],
      };
  }
}

function hazardMetricLabel(hazard: HazardKind) {
  return {
    flood: "Peak depth",
    earthquake: "Peak intensity",
    wildfire: "Fireline intensity",
    cyclone: "Peak wind",
    chemical: "Peak concentration",
  }[hazard];
}

function hazardFromIncidentCategory(category: string): HazardId {
  const normalized = category.toLowerCase();
  if (/earthquake|seismic/.test(normalized)) return "earthquake";
  if (/wildfire|fire/.test(normalized)) return "wildfire";
  if (/cyclone|hurricane|typhoon|storm|surge/.test(normalized)) return "cyclone";
  if (/chemical|industrial|plume|spill/.test(normalized)) return "industrial";
  return "flood";
}

function locationFidelityLabel(location: ActiveLocation): string {
  return location.fidelity === "EIT SITE MODEL"
    ? "OSM / ESTIMATED"
    : "GLOBAL PROTOTYPE";
}

function incidentIsCurrentObserved(incident: LiveIncidentSummary): boolean {
  const currentFreshness = incident.freshness
    ? incident.freshness.band === "live" || incident.freshness.band === "near-real-time"
    : incident.dataMode === "near-real-time";
  return incident.reality !== "simulated"
    && incident.provenance.status === "live"
    && (incident.state === "active" || incident.state === "monitoring")
    && currentFreshness;
}

const fallbackDecision: OperationsDecision = {
  source: "deterministic-fallback",
  latencyMs: 0,
  summary: "Run a scenario or ask a question to generate a deterministic brief from the current twin state.",
  evidence: ["No numerical claim is shown until it is read from the active simulation."],
  prediction: "The selected timeline, assets and evacuation state will determine the next screened failure.",
  confidence: 0,
  recommendation: "Select an operating area, hazard and simulation time before approving a response action.",
  risks: ["Prototype estimates require field verification"],
  alternatives: ["Inspect live evidence", "Adjust the scenario and compare branches"],
};

const EMPTY_MAP_SELECTION: AegisMapSelection = { points: [] };

function deterministicDecision(input: {
  location: string;
  hazard: string;
  minute: number;
  peakMinute: number;
  maximumValue: number;
  maximumUnit: string;
  unavailableRoads: number;
  exposure: number;
  confidence: number;
  topAction?: string;
  remainingExposure: number;
}): OperationsDecision {
  const beforePeak = input.minute < input.peakMinute;
  return {
    source: "deterministic-fallback",
    latencyMs: 1,
    summary: `${input.location} is at T+${input.minute} minutes in the ${input.hazard.toLowerCase()} screening timeline. Access, exposure and recovery priorities are derived directly from the active deterministic run.`,
    evidence: [
      `SIMULATED · maximum ${input.maximumValue.toFixed(2)} ${input.maximumUnit} at T+${input.peakMinute} min`,
      `SIMULATED · ${input.unavailableRoads} road links unavailable at peak`,
      `ESTIMATED · ${input.exposure.toLocaleString("en-IN")} people in the peak exposure envelope`,
    ],
    prediction: beforePeak
      ? `The scenario has not reached its screened peak; conditions continue changing through T+${input.peakMinute} minutes.`
      : "The screened peak has passed, but access, utility and re-entry constraints can persist during recession and recovery.",
    confidence: input.confidence,
    recommendation: input.topAction ?? "Inspect the highest-priority affected asset, verify route passability and regenerate the evacuation plan at the selected departure time.",
    risks: [
      `${input.remainingExposure.toLocaleString("en-IN")} people remain in the planning envelope under the current plan state`,
      "Model confidence describes input and method support; it is not forecast accuracy",
    ],
    alternatives: ["Move the departure time and recompute", "Apply a contained or severe what-if branch"],
  };
}

const NAV_ITEMS = [
  { id: "global", label: "World map", brief: "Search, rotate and inspect global incident context", icon: Globe2 },
  { id: "incident", label: "Incident", brief: "Review calculated effects at the selected time", icon: MapPinned },
  { id: "simulation", label: "Scenarios", brief: "Load locations, hazards and model inputs", icon: Boxes },
  { id: "cascade", label: "Impacts", brief: "Trace infrastructure dependencies and service loss", icon: Network },
  { id: "evidence", label: "Sources", brief: "Inspect source-labelled reports and data classes", icon: Eye },
  { id: "analytics", label: "Analysis", brief: "Compare risk, capacity and response options", icon: BarChart3 },
];

const PANEL_TAB_BRIEFS: Record<PanelTab, string> = {
  impact: "Physical effects",
  intelligence: "Model context",
  resources: "Response assets",
};

function formatClock(date: Date) {
  return new Intl.DateTimeFormat("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function downloadTextFile(filename: string, content: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function featureOperationalScore(properties: GeoJsonProperties): number {
  if (!properties) return 0;
  const candidates = [
    properties.damageIndex,
    properties.impactIndex,
    properties.value,
    properties.severityIndex,
    properties.depthM,
    properties.maximumDepthM,
  ];
  const finite = candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!finite.length) return 1;
  const value = Math.max(...finite);
  return value > 1 ? Math.min(1, value / 100) : Math.max(0, value);
}

function pointInRing(point: [number, number], ring: number[][]): boolean {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index, index += 1) {
    const [x1, y1] = ring[index];
    const [x2, y2] = ring[previous];
    const crosses = (y1 > point[1]) !== (y2 > point[1])
      && point[0] < (x2 - x1) * (point[1] - y1) / ((y2 - y1) || Number.EPSILON) + x1;
    if (crosses) inside = !inside;
  }
  return inside;
}

function pointInGeometry(point: [number, number], geometry: Geometry): boolean {
  if (geometry.type === "Polygon") {
    return pointInRing(point, geometry.coordinates[0] as number[][]);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => pointInRing(point, polygon[0] as number[][]));
  }
  return false;
}

function screenLiveRoadRoutes(
  routes: FeatureCollection<LineString>,
  layers: AegisMapLayers,
  minute: number,
): FeatureCollection<LineString> {
  const screeningFeatures = [
    ...(layers.floodDepth?.features ?? []),
    ...(layers.impactZones?.features ?? []),
    ...(layers.unavailableZones?.features ?? []),
    ...(layers.damagedBuildings?.features ?? []),
  ].filter((feature) => feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon");
  return {
    type: "FeatureCollection",
    features: routes.features.map((route) => {
      const samples = route.geometry.coordinates.flatMap((coordinate, index, values) => {
        const current = [coordinate[0], coordinate[1]] as [number, number];
        const next = values[index + 1];
        return next
          ? [current, [(coordinate[0] + next[0]) / 2, (coordinate[1] + next[1]) / 2] as [number, number]]
          : [current];
      });
      let maximumRisk = 0;
      let intersections = 0;
      for (const feature of screeningFeatures) {
        if (!samples.some((sample) => pointInGeometry(sample, feature.geometry))) continue;
        intersections += 1;
        maximumRisk = Math.max(maximumRisk, featureOperationalScore(feature.properties));
      }
      const status = maximumRisk >= 0.7 ? "blocked" : maximumRisk >= 0.3 || intersections > 0 ? "warning" : "safe";
      return {
        ...route,
        properties: {
          ...(route.properties ?? {}),
          status,
          routeType: status === "safe" ? "screened-candidate" : "screened-alternate",
          hazardScreening: "AEGIS_TIME_SCREENED",
          screenedMinute: minute,
          consequenceIntersections: intersections,
          maximumScreenedRisk: Number(maximumRisk.toFixed(3)),
          notice: "OSRM road geometry screened against the active simulated consequence polygons. Field verification remains mandatory.",
        },
      };
    }),
  };
}

function thresholdCollection(
  collection: FeatureCollection<Geometry, GeoJsonProperties> | undefined,
  threshold: number,
): FeatureCollection<Geometry, GeoJsonProperties> | undefined {
  if (!collection || threshold <= 0) return collection;
  return {
    ...collection,
    features: collection.features.filter((feature) => featureOperationalScore(feature.properties) >= threshold),
  };
}

function StatusTag({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "amber" | "red" | "neutral" }) {
  return <span className={`${styles.statusTag} ${styles[`tone_${tone}`]}`}>{children}</span>;
}

function Metric({ label, value, detail, tone = "blue" }: { label: string; value: string; detail: string; tone?: "blue" | "amber" | "red" | "green" }) {
  return (
    <div className={styles.metric}>
      <div className={styles.metricTop}>
        <span>{label}</span>
        <i className={`${styles.metricDot} ${styles[`dot_${tone}`]}`} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function MiniBar({ value, tone = "blue" }: { value: number; tone?: "blue" | "amber" | "red" | "green" }) {
  return (
    <div className={styles.miniBar} aria-label={`${value}%`}>
      <i className={styles[`bar_${tone}`]} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function CommandCenter() {
  const [entryVisible, setEntryVisible] = useState(true);
  const [clock, setClock] = useState<Date | null>(null);
  const [hazard, setHazard] = useState<HazardId>("flood");
  const [viewMode, setViewMode] = useState<ViewMode>("monitor");
  const [sceneView, setSceneView] = useState<SceneView>("world");
  const [panelTab, setPanelTab] = useState<PanelTab>("impact");
  const [minute, setMinute] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [evacuationVisible, setEvacuationVisible] = useState(false);
  const [liveNoticeOpen, setLiveNoticeOpen] = useState(false);
  const [liveMediaOpen, setLiveMediaOpen] = useState(false);
  const [scenarioMenuOpen, setScenarioMenuOpen] = useState(false);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [rightPanelOpen, setRightPanelOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("global");
  const [layerPanelOpen, setLayerPanelOpen] = useState(false);
  const [providerPanelOpen, setProviderPanelOpen] = useState(false);
  const [providerReadiness, setProviderReadiness] = useState<ProviderReadinessResponse | null>(null);
  const [operationsStream, setOperationsStream] = useState<OperationsStreamState>({
    status: "checking",
    eventCount: 0,
    lastSequence: 0,
  });
  const [layerVisibility, setLayerVisibility] = useState<Record<OperationalLayerId, boolean>>(
    DEFAULT_LAYER_VISIBILITY,
  );
  const [layerQuery, setLayerQuery] = useState("");
  const [layerThreshold, setLayerThreshold] = useState(0);
  const [question, setQuestion] = useState("What is our biggest risk in the next 30 minutes?");
  const [decision, setDecision] = useState<OperationsDecision>(fallbackDecision);
  const [automaticDecisionActive, setAutomaticDecisionActive] = useState(false);
  const [decisionNarrative, setDecisionNarrative] = useState<string | null>(null);
  const [decisionExecution, setDecisionExecution] = useState<DecisionExecution>({
    mode: "deterministic-fallback",
    provider: "AEGIS local engine",
    model: "deterministic-operations-v1",
  });
  const [asking, setAsking] = useState(false);
  const [planState, setPlanState] = useState<"idle" | "calculating" | "ready" | "accepted">("idle");
  const [planDepartureMinute, setPlanDepartureMinute] = useState(0);
  const [evacuationMode, setEvacuationMode] = useState<"bus" | "car" | "pedestrian">("bus");
  const [surgeCapacity, setSurgeCapacity] = useState(false);
  const [scenarioStrength, setScenarioStrength] = useState(74);
  const [liveIntelligence, setLiveIntelligence] = useState<LiveIntelligence | null>(null);
  const [liveRefreshing, setLiveRefreshing] = useState(false);
  const [liveChangeCount, setLiveChangeCount] = useState(0);
  const [liveRefreshNonce, setLiveRefreshNonce] = useState(0);
  const previousLiveIncidentsRef = useRef<LiveIncidentSummary[]>([]);
  const [mapSelection, setMapSelection] = useState<AegisMapSelection>({ points: [] });
  const [selectionWorkflowStage, setSelectionWorkflowStage] = useState<SelectionWorkflowStage>("idle");
  const [selectionWorkflowVisible, setSelectionWorkflowVisible] = useState(false);
  const selectionWorkflowTimerRef = useRef<number | null>(null);
  const selectionFingerprintRef = useRef("");
  const [focusRequest, setFocusRequest] = useState<AegisFocusRequest | undefined>();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeocodeResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [searchDataClass, setSearchDataClass] = useState<"IMPORTED" | "REFERENCE" | "UNAVAILABLE">("IMPORTED");
  const [comparisonOpen, setComparisonOpen] = useState(false);
  const [comparisonMode, setComparisonMode] = useState<"cards" | "side-by-side" | "swipe">("side-by-side");
  const [comparisonSwipe, setComparisonSwipe] = useState(50);
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [activeLocation, setActiveLocation] = useState<ActiveLocation>(QUICK_LOCATIONS[0]);
  const [sourceIncident, setSourceIncident] = useState<ScenarioWorkspace["sourceIncident"]>();
  const [weatherContext, setWeatherContext] = useState<WeatherContext | null>(null);
  const [fieldOverlays, setFieldOverlays] = useState<AegisExternalOverlay[]>(
    () => createFieldOverlays(QUICK_LOCATIONS[0]),
  );
  const [liveRoadRoutes, setLiveRoadRoutes] = useState<FeatureCollection<LineString> | null>(null);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [workspaceLayout, setWorkspaceLayout] = useState<WorkspaceLayoutId>("focused");
  const [scenarioName, setScenarioName] = useState("EIT flood operations exercise");
  const [savedWorkspaces, setSavedWorkspaces] = useState<ScenarioWorkspace[]>([]);
  const [bookmarks, setBookmarks] = useState<WorkspaceBookmark[]>([]);
  const [annotations, setAnnotations] = useState<WorkspaceAnnotation[]>([]);
  const [decisionReceipts, setDecisionReceipts] = useState<DecisionReceipt[]>([]);
  const [auditHistory, setAuditHistory] = useState<WorkspaceAuditEvent[]>([]);
  const [campusDataset, setCampusDataset] = useState<TwinCampusDataset | undefined>();
  const [publicTerrainDataset, setPublicTerrainDataset] = useState<TwinCampusDataset | undefined>();
  const [campusImportStatus, setCampusImportStatus] = useState(
    "OSM footprints are active; heights, terrain, use and occupancy remain estimated.",
  );
  const scenarioPanel = useDraggablePanel("scenario");
  const planPanel = useDraggablePanel("evacuation");
  const newsPanel = useDraggablePanel("live-intelligence");
  const commandPanel = useDraggablePanel("incident");
  const providerPanel = useDraggablePanel("provider-health");

  const selectedHazard = useMemo(
    () => HAZARDS.find((item) => item.id === hazard) ?? HAZARDS[0],
    [hazard],
  );
  const activeSection = NAV_ITEMS.find((item) => item.id === activeNav) ?? NAV_ITEMS[0];
  const SelectedHazardIcon = selectedHazard.icon;
  const coreHazard: HazardKind = hazard === "industrial" ? "chemical" : hazard;
  const control = useMemo(() => scenarioControl(hazard, scenarioStrength), [hazard, scenarioStrength]);
  const selectedHazardSource = mapSelection.points.find((point) => point.role === "hazard-source");
  const selectedOperatingArea = useMemo<ScenarioOperatingAreaInput | undefined>(() => {
    const boundary = mapSelection.area?.geometry.coordinates[0];
    if (!boundary || boundary.length < 4) return undefined;
    const dimensions = selectionAreaDimensionsMeters({ points: [], area: mapSelection.area });
    if (!dimensions) return undefined;
    const { northSouthM, eastWestM } = dimensions;
    if (Math.min(northSouthM, eastWestM) < 120 || Math.max(northSouthM, eastWestM) > 100_000) {
      return undefined;
    }
    return {
      kind: "polygon",
      boundary: boundary.map(([lon, lat]) => ({ lon, lat })),
      label: mapSelection.area?.properties.name ?? "Operator-drawn operating area",
    };
  }, [mapSelection.area]);
  const operatingAreaMessage = useMemo(() => {
    if (!mapSelection.area) {
      return "Search or select any world location to recalculate the same hazard workflow; local detail follows the available open-map and terrain context.";
    }
    if (selectedOperatingArea) {
      return "Operator-drawn area is active: the deterministic local model is bounded to this selected region. Geometry and exposure inputs remain provenance-labelled estimates unless imported.";
    }
    return "The drawn area is outside the local model limit (120 m–100 km in both dimensions), so AEGIS is using the selected center point instead. Adjust the region to activate bounded simulation.";
  }, [mapSelection.area, selectedOperatingArea]);
  const demonstration = useMemo(
    () => runLocationDemonstration(
      activeLocation,
      coreHazard,
      control.parameterOverrides,
      selectedHazardSource
        ? { lat: selectedHazardSource.coordinates[1], lon: selectedHazardSource.coordinates[0] }
        : undefined,
      surgeCapacity,
      selectedOperatingArea,
    ),
    [activeLocation, control.parameterOverrides, coreHazard, selectedHazardSource, selectedOperatingArea, surgeCapacity],
  );
  const currentFrame = useMemo(() => {
    const timeline = demonstration.result.timeline;
    let closest = timeline[0];
    for (const frame of timeline) {
      if (Math.abs(frame.minute - minute) < Math.abs(closest.minute - minute)) closest = frame;
    }
    return closest;
  }, [demonstration.result.timeline, minute]);
  const averageConfidence = useMemo(() => {
    const field = demonstration.result.field;
    if (!field.length) return 0;
    return Math.round((field.reduce((total, cell) => total + cell.confidence.score, 0) / field.length) * 100);
  }, [demonstration.result.field]);
  const roadAccessPct = Math.max(
    0,
    Math.round(
      (1 - demonstration.result.metrics.peakUnavailableRoads / Math.max(1, demonstration.scenario.assets.roads.length)) * 100,
    ),
  );
  const evacuationPlan = useMemo(() => {
    const starts = mapSelection.points
      .filter((point) => point.role === "origin")
      .map((point) => ({
        id: point.id,
        label: point.label ?? "Selected evacuation origin",
        coordinate: { lat: point.coordinates[1], lon: point.coordinates[0] },
      }));
    const ends = mapSelection.points
      .filter((point) => point.role === "destination")
      .map((point) => ({
        id: point.id,
        label: point.label ?? "Selected safe destination",
        coordinate: { lat: point.coordinates[1], lon: point.coordinates[0] },
      }));
    // The timeline can represent the flood peak, but a new plan still needs
    // to stage departures before the network becomes impassable. Preserve a
    // visible operator-selected departure when it is viable; otherwise start
    // from the model's default warning window and screen every route forward.
    const screenedDepartureMinute = Math.min(planDepartureMinute, 15);
    if (!starts.length && !ends.length && screenedDepartureMinute === 15) return demonstration.evacuationPlan;
    try {
      return createEvacuationPlan(demonstration.scenario, demonstration.result, {
        startPoints: starts.length ? starts : undefined,
        endPoints: ends.length ? ends : undefined,
        departureMinute: screenedDepartureMinute,
        maxRoutesPerOrigin: 3,
        stagedWindowMinutes: 12,
        preferredMode: evacuationMode,
        includeHospitals: true,
      });
    } catch {
      return demonstration.evacuationPlan;
    }
  }, [demonstration, evacuationMode, mapSelection.points, planDepartureMinute]);

  const evacuationProcedure = useMemo(() => {
    const primaryRoute = evacuationPlan.routes.find((route) => route.status === "recommended") ?? evacuationPlan.routes[0];
    const firstStage = evacuationPlan.stages.reduce<(typeof evacuationPlan.stages)[number] | undefined>(
      (earliest, stage) => !earliest || stage.order < earliest.order ? stage : earliest,
      undefined,
    );
    const destinationLabels = evacuationPlan.endPoints.map((point) => point.label).slice(0, 3);
    const originLabels = evacuationPlan.startPoints.map((point) => point.label).slice(0, 3);
    const steps = [
      `Begin the ${evacuationMode} procedure at T+${evacuationPlan.departureMinute} min from ${originLabels.join(", ") || "the modelled origin zones"}.`,
      firstStage
        ? `Move ${firstStage.zoneName} first during T+${firstStage.departureWindow.startMinute}–${firstStage.departureWindow.endMinute} min; ${firstStage.populationAssigned.toLocaleString("en-IN")} people are assigned and ${firstStage.assistanceRequired.toLocaleString("en-IN")} require assistance.`
        : "Confirm the first departure stage after route and capacity screening.",
      primaryRoute
        ? `Use ${primaryRoute.id} as the ${primaryRoute.status} route: ${Math.round(primaryRoute.distanceM).toLocaleString("en-IN")} m, ${Math.round(primaryRoute.etaMinutes)} min estimated travel, ${Math.round(primaryRoute.reliability * 100)}% model reliability.`
        : "No passable model route is available; hold movement and dispatch field reconnaissance.",
      `Receive evacuees at ${destinationLabels.join(", ") || "the screened safe destinations"}; current model coverage is ${Math.round(evacuationPlan.after.coveragePct)}% with ${Math.round(evacuationPlan.after.estimatedClearanceMinutes)} min estimated clearance.`,
    ];
    return {
      steps,
      warning: evacuationPlan.warnings[0] ?? "Field teams must confirm route passability and destination capacity before dispatch.",
      remaining: evacuationPlan.after.peopleRemainingExposed,
      source: evacuationPlan.generatedBy,
    };
  }, [evacuationMode, evacuationPlan]);

  useEffect(() => {
    if (!evacuationVisible || planState === "calculating") return;
    const route = evacuationPlan.routes[0];
    const origin = route?.polyline[0];
    const destination = route?.polyline.at(-1);
    if (!origin || !destination) return;
    const controller = new AbortController();
    const parameters = new URLSearchParams({
      origin: `${origin.lon},${origin.lat}`,
      destination: `${destination.lon},${destination.lat}`,
      mode: evacuationMode,
    });
    void fetch(`/api/routing?${parameters}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Live road route unavailable");
        return await response.json() as { routes: FeatureCollection<LineString>["features"] };
      })
      .then((payload) => setLiveRoadRoutes({ type: "FeatureCollection", features: payload.routes }))
      .catch(() => setLiveRoadRoutes(null));
    return () => controller.abort();
  }, [evacuationMode, evacuationPlan, evacuationVisible, planState]);
  const roadEffects = demonstration.result.impacts.roads.slice(0, 4);
  const hospitalImpact = demonstration.result.impacts.hospitals[0];
  const shelterImpact = demonstration.result.impacts.shelters[0];
  const hospitalLoadPct = hospitalImpact
    ? Math.min(100, Math.round((hospitalImpact.projectedOccupancy / Math.max(1, hospitalImpact.capacity)) * 100))
    : 0;
  const shelterLoadPct = shelterImpact
    ? Math.min(100, Math.round((shelterImpact.projectedOccupancy / Math.max(1, shelterImpact.capacity)) * 100))
    : 0;
  const baseMapLayers = useMemo(
    () => buildAegisMapLayers({
      scenario: demonstration.scenario,
      result: demonstration.result,
      selectedMinute: minute,
      evacuationPlan:
        evacuationVisible && planState !== "calculating" ? evacuationPlan : undefined,
    }),
    [demonstration, evacuationPlan, evacuationVisible, minute, planState],
  );
  const mapLayers = useMemo<AegisMapLayers>(() => ({
    ...baseMapLayers,
    evacuationRoutes: liveRoadRoutes?.features.length
      && evacuationVisible
      ? screenLiveRoadRoutes(liveRoadRoutes, baseMapLayers, minute) as AegisMapLayers["evacuationRoutes"]
      : baseMapLayers.evacuationRoutes,
  }), [baseMapLayers, evacuationVisible, liveRoadRoutes, minute]);
  const visibleMapLayers = useMemo<AegisMapLayers>(() => {
    const visible = { ...mapLayers };
    if (!layerVisibility.hazard) {
      delete visible.floodDepth;
      delete visible.hazardFootprints;
      delete visible.hazardVectors;
    }
    if (!layerVisibility.flow) delete visible.floodFlow;
    if (!layerVisibility.damage) {
      delete visible.impactZones;
      delete visible.damagedBuildings;
      delete visible.impactedBridges;
      delete visible.utilityImpacts;
      delete visible.populationImpacts;
      delete visible.recoveryPriorities;
    }
    if (!layerVisibility.roads) {
      delete visible.roads;
      delete visible.impactedRoads;
    }
    if (!layerVisibility.evacuation) {
      delete visible.evacuationRoutes;
      delete visible.responseCoverageZones;
    }
    if (!layerVisibility.facilities) {
      delete visible.resources;
      delete visible.hospitals;
      delete visible.shelters;
      delete visible.criticalFacilities;
    }
    if (layerThreshold > 0) {
      const threshold = layerThreshold / 100;
      visible.damagedBuildings = thresholdCollection(
        visible.damagedBuildings as FeatureCollection<Geometry, GeoJsonProperties> | undefined,
        threshold,
      ) as AegisMapLayers["damagedBuildings"];
      visible.impactZones = thresholdCollection(
        visible.impactZones as FeatureCollection<Geometry, GeoJsonProperties> | undefined,
        threshold,
      ) as AegisMapLayers["impactZones"];
      visible.populationImpacts = thresholdCollection(
        visible.populationImpacts as FeatureCollection<Geometry, GeoJsonProperties> | undefined,
        threshold,
      ) as AegisMapLayers["populationImpacts"];
      visible.utilityImpacts = thresholdCollection(
        visible.utilityImpacts as FeatureCollection<Geometry, GeoJsonProperties> | undefined,
        threshold,
      ) as AegisMapLayers["utilityImpacts"];
      visible.warnings = thresholdCollection(
        visible.warnings as FeatureCollection<Geometry, GeoJsonProperties> | undefined,
        threshold,
      ) as AegisMapLayers["warnings"];
    }
    return visible;
  }, [layerThreshold, layerVisibility, mapLayers]);
  const activeCampusDataset = campusDataset ?? publicTerrainDataset;
  const twinScene = useMemo(
    () => activeLocation.fidelity === "EIT SITE MODEL"
      ? buildTwinScene({
          scenario: demonstration.scenario,
          result: demonstration.result,
          selectedMinute: minute,
          evacuationPlan:
            evacuationVisible && planState !== "calculating" ? evacuationPlan : undefined,
          campusDataset: activeCampusDataset,
        })
      : undefined,
    [activeCampusDataset, activeLocation.fidelity, demonstration, evacuationPlan, evacuationVisible, minute, planState],
  );
  const impactSnapshot = useMemo(
    () => buildImpactSnapshot({
      scenario: demonstration.scenario,
      result: demonstration.result,
      selectedMinute: minute,
      evacuationPlan: evacuationVisible && planState !== "calculating" ? evacuationPlan : undefined,
    }),
    [demonstration, evacuationPlan, evacuationVisible, minute, planState],
  );
  const selectionWorkflowAssessment = useMemo(() => {
    if (!selectionHasOperationalInput(mapSelection) || selectionWorkflowStage === "idle") return null;
    return buildSelectionWorkflowAssessment({
      selection: mapSelection,
      stage: selectionWorkflowStage,
      locationLabel: activeLocation.name,
      hazardLabel: selectedHazard.label,
      scenarioSeed: demonstration.scenario.seed,
      scenarioRevision: `${demonstration.result.runId}:${scenarioStrength}:${minute}:${evacuationMode}:${planDepartureMinute}:${surgeCapacity}:${evacuationPlan.id}`,
      operatingAreaAccepted: Boolean(selectedOperatingArea),
      metrics: {
        peakExposedPopulation: demonstration.result.metrics.peakExposedPopulation,
        affectedBuildings: impactSnapshot.summary.affectedBuildings,
        closedRoads: impactSnapshot.summary.closedRoads,
        restrictedRoads: impactSnapshot.summary.restrictedRoads,
      },
      plan: {
        id: evacuationPlan.id,
        routeCount: evacuationPlan.routes.length,
        coveragePct: evacuationPlan.after.coveragePct,
        clearanceMinutes: evacuationPlan.after.estimatedClearanceMinutes,
        peopleRemainingExposed: evacuationPlan.after.peopleRemainingExposed,
        warnings: evacuationPlan.warnings,
        generatedBy: evacuationPlan.generatedBy,
      },
    });
  }, [activeLocation.name, demonstration.result.metrics.peakExposedPopulation, demonstration.result.runId, demonstration.scenario.seed, evacuationMode, evacuationPlan, impactSnapshot.summary, mapSelection, minute, planDepartureMinute, scenarioStrength, selectedHazard.label, selectedOperatingArea, selectionWorkflowStage, surgeCapacity]);

  const automaticSelectionDecision = useMemo(() => deterministicDecision({
      location: activeLocation.name,
      hazard: selectedHazard.label,
      minute,
      peakMinute: demonstration.result.metrics.peakMinute,
      maximumValue: demonstration.result.metrics.maximumHazardValue,
      maximumUnit: demonstration.result.metrics.maximumHazardUnit,
      unavailableRoads: demonstration.result.metrics.peakUnavailableRoads,
      exposure: demonstration.result.metrics.peakExposedPopulation,
      confidence: averageConfidence / 100,
      topAction: impactSnapshot.recoveryPlan.actions[0]?.action,
      remainingExposure: impactSnapshot.humanImpact.peopleRemainingInPlanningEnvelope,
    }), [
      activeLocation.name,
      averageConfidence,
      demonstration.result.metrics,
      impactSnapshot.humanImpact.peopleRemainingInPlanningEnvelope,
      impactSnapshot.recoveryPlan.actions,
      minute,
      selectedHazard.label,
    ]);
  const automaticSelectionDecisionRef = useRef(automaticSelectionDecision);
  const selectionWorkflowAssessmentRef = useRef(selectionWorkflowAssessment);
  useEffect(() => {
    automaticSelectionDecisionRef.current = automaticSelectionDecision;
    selectionWorkflowAssessmentRef.current = selectionWorkflowAssessment;
  }, [automaticSelectionDecision, selectionWorkflowAssessment]);
  const displayedDecision = automaticDecisionActive ? automaticSelectionDecision : decision;
  const displayedDecisionNarrative = automaticDecisionActive && selectionWorkflowAssessment
    ? `Automatic deterministic brief ${selectionWorkflowAssessment.id} is recalculated from the current map inputs, hazard settings and timeline minute. It is a planning estimate, not an observed damage report or an issued evacuation order.`
    : decisionNarrative;
  const interventionRanking = useMemo(
    () => rankInterventions(demonstration.scenario, demonstration.result),
    [demonstration.result, demonstration.scenario],
  );
  const productAlerts = useMemo(() => buildProductAlerts(impactSnapshot), [impactSnapshot]);
  const measurementSummary = useMemo(() => {
    const distanceKm = pathDistanceKm(mapSelection.points);
    const areaRing = mapSelection.area?.geometry.coordinates[0]
      ?.map((coordinate) => [coordinate[0], coordinate[1]] as [number, number]) ?? [];
    return { distanceKm, areaSqKm: polygonAreaSqKm(areaRing) };
  }, [mapSelection.area, mapSelection.points]);
  const operationalOverlays = useMemo<AegisExternalOverlay[]>(() => [
    ...fieldOverlays,
    ...annotations.map((annotation) => ({
      id: annotation.id,
      label: annotation.label,
      coordinates: annotation.coordinates,
      kind: "custom" as const,
      status: "OPERATOR NOTE",
      color: "#f2c66d",
      draggable: true,
      properties: {
        note: annotation.note,
        evidenceClass: "OPERATOR ANNOTATION",
        createdAt: annotation.createdAt,
      },
    })),
  ], [annotations, fieldOverlays]);
  const currentWorkspaceRevision = useMemo(() => {
    const current = savedWorkspaces
      .filter((workspace) => workspace.name === scenarioName)
      .toSorted((first, second) => second.revision - first.revision)[0];
    return current?.revision ?? 0;
  }, [savedWorkspaces, scenarioName]);
  const bridgeRiskPct = impactSnapshot.bridges.length
    ? Math.round((
        impactSnapshot.summary.degradedBridges +
        impactSnapshot.summary.unavailableBridges
      ) / impactSnapshot.bridges.length * 100)
    : 0;
  const priorityBuilding = twinScene?.buildings.reduce((priority, building) => (
    !priority || building.damageIndex > priority.damageIndex ? building : priority
  ), twinScene.buildings[0]);
  const affectedBuildingCount = impactSnapshot.summary.affectedBuildings;
  const severeDamageScreeningCount = impactSnapshot.summary.severelyDamagedBuildings;
  const secondaryConsequenceSummary = useMemo(() => {
    const byKind = new Map<string, { count: number; maximum: number }>();
    for (const item of impactSnapshot.secondaryConsequences) {
      const current = byKind.get(item.kind) ?? { count: 0, maximum: 0 };
      current.count += 1;
      current.maximum = Math.max(current.maximum, item.index);
      byKind.set(item.kind, current);
    }
    return [...byKind.entries()]
      .map(([kind, value]) => ({ kind, ...value }))
      .sort((first, second) => second.maximum - first.maximum);
  }, [impactSnapshot.secondaryConsequences]);
  const comparisonRuns = useMemo(() => {
    if (!comparisonOpen) return [];
    return [
      { id: "contained", label: "Contained", strength: Math.max(20, scenarioStrength - 25) },
      { id: "baseline", label: "Baseline", strength: scenarioStrength },
      { id: "severe", label: "Severe", strength: Math.min(140, scenarioStrength + 25) },
    ].map((branch) => {
      const branchControl = scenarioControl(hazard, branch.strength);
      const run = runLocationDemonstration(activeLocation, coreHazard, branchControl.parameterOverrides);
      return { ...branch, control: branchControl, run };
    });
  }, [activeLocation, comparisonOpen, coreHazard, hazard, scenarioStrength]);

  const runSearch = useCallback(async () => {
    if (searchQuery.trim().length < 2) return;
    setSearching(true);
    setSearchFeedback(null);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(searchQuery.trim())}`);
      if (!response.ok) throw new Error("Search unavailable");
      const payload = (await response.json()) as {
        results: GeocodeResult[];
        notice?: string;
        dataClass?: "IMPORTED" | "REFERENCE" | "UNAVAILABLE";
      };
      setSearchResults(payload.results);
      setSearchDataClass(payload.dataClass ?? "IMPORTED");
      setSearchFeedback(payload.notice ?? (payload.results.length ? null : "No mapped locations matched that search."));
    } catch {
      const fallbackResults = searchOfflineWorldPlaces(searchQuery.trim());
      setSearchResults(fallbackResults);
      setSearchDataClass(fallbackResults.length ? "REFERENCE" : "UNAVAILABLE");
      setSearchFeedback(fallbackResults.length
        ? "Search service unavailable. Showing built-in reference locations; exact addresses require connectivity."
        : "World search is temporarily unavailable. Use the map or a predefined location.");
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  const beginSelectionWorkflow = useCallback((selection: AegisMapSelection) => {
    if (!selectionHasOperationalInput(selection)) {
      if (selectionWorkflowTimerRef.current !== null) {
        window.clearTimeout(selectionWorkflowTimerRef.current);
        selectionWorkflowTimerRef.current = null;
      }
      selectionFingerprintRef.current = "";
      setSelectionWorkflowStage("idle");
      setSelectionWorkflowVisible(false);
      setAutomaticDecisionActive(false);
      setPlanState("idle");
      setEvacuationVisible(false);
      return false;
    }

    const fingerprint = selectionFingerprint(selection);
    if (fingerprint === selectionFingerprintRef.current) return false;
    if (selectionWorkflowTimerRef.current !== null) {
      window.clearTimeout(selectionWorkflowTimerRef.current);
      selectionWorkflowTimerRef.current = null;
    }
    selectionFingerprintRef.current = fingerprint;
    setSelectionWorkflowVisible(true);
    setAutomaticDecisionActive(true);
    setSelectionWorkflowStage("assessing");
    setMinute((current) => current === 0 ? 30 : current);
    setPlaying(false);
    setPlanDepartureMinute(0);
    setPlanState("calculating");
    setEvacuationVisible(false);
    setViewMode("respond");
    setActiveNav("incident");
    setPanelTab("intelligence");
    setRightPanelOpen(false);
    setLayerVisibility((current) => ({
      ...current,
      hazard: true,
      damage: true,
      roads: true,
      evacuation: true,
      facilities: true,
    }));
    selectionWorkflowTimerRef.current = window.setTimeout(() => {
      const assessmentId = selectionWorkflowAssessmentRef.current?.id ?? `ASM-${fingerprint.toUpperCase()}`;
      setDecision(automaticSelectionDecisionRef.current);
      setDecisionNarrative(
        `Automatic deterministic brief ${assessmentId} was recalculated from the operator-defined map inputs. It is a planning estimate, not an observed damage report or an issued evacuation order.`,
      );
      setDecisionExecution({
        mode: "deterministic-fallback",
        provider: "AEGIS local engine",
        model: "deterministic-operations-v1",
      });
      setSelectionWorkflowStage("ready");
      setPlanState("ready");
      selectionWorkflowTimerRef.current = null;
    }, 420);
    return true;
  }, []);

  const updateMapSelection = useCallback((selection: AegisMapSelection) => {
    let nextSelection = selection;
    const newPoint = selection.points.find((point) => !mapSelection.points.some((previous) => previous.id === point.id));
    const anchor = newPoint
      ? { latitude: newPoint.coordinates[1], longitude: newPoint.coordinates[0], label: newPoint.label ?? "Operator-selected point" }
      : selectionPlanningAnchor(selection);
    if (!selection.area && anchor && distanceMeters(
      { lat: activeLocation.latitude, lon: activeLocation.longitude },
      { lat: anchor.latitude, lon: anchor.longitude },
    ) > 2_000) {
      // A new remote pointer starts a local planning domain. Do not retain a
      // hazard/source from the previous continent as if it belonged here.
      nextSelection = {
        points: selection.points.filter((point) => distanceMeters(
          { lat: anchor.latitude, lon: anchor.longitude },
          { lat: point.coordinates[1], lon: point.coordinates[0] },
        ) <= 10_000),
      };
      setActiveLocation({
        id: `operator-${selectionFingerprint(nextSelection)}`,
        name: anchor.label,
        region: `${anchor.latitude.toFixed(4)}°, ${anchor.longitude.toFixed(4)}° · operator-defined`,
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        fidelity: "GLOBAL PROTOTYPE",
      });
      setSourceIncident(undefined);
      setWeatherContext(null);
      setFieldOverlays([]);
      setSceneView("world");
      setFocusRequest({
        center: [anchor.longitude, anchor.latitude],
        zoom: 15.2,
        pitch: 48,
        bearing: -24,
        durationMs: 1_300,
        label: `${anchor.label} · operator-defined planning domain`,
        requestId: `pointer-${selectionFingerprint(nextSelection)}-${Date.now()}`,
      });
    }
    setMapSelection(nextSelection);
    setLiveRoadRoutes(null);
    // Every explicit pointer or completed area deterministically recalculates
    // the response package. Programmatic search/preset selections use the
    // state setter directly, so they do not masquerade as operator input.
    void beginSelectionWorkflow(nextSelection);
  }, [activeLocation.latitude, activeLocation.longitude, beginSelectionWorkflow, mapSelection.points]);

  const clearOperatorSelection = useCallback(() => {
    const cleared: AegisMapSelection = { points: [] };
    setMapSelection(cleared);
    setLiveRoadRoutes(null);
    setSourceIncident(undefined);
    setFieldOverlays([]);
    setViewMode("monitor");
    setSceneView("world");
    setActiveNav("global");
    setRightPanelOpen(false);
    setFocusRequest({
      center: [24, 16],
      zoom: 1.96,
      pitch: 12,
      bearing: -8,
      durationMs: 1_100,
      label: "Global operations overview",
      requestId: `clear-world-overview-${Date.now()}`,
    });
    void beginSelectionWorkflow(cleared);
  }, [beginSelectionWorkflow]);

  const completeOperatingArea = useCallback((selection: AegisMapSelection) => {
    const area = selectionAreaSummary(selection);
    if (!area.center) return;
    const areaLabel = selection.area?.properties.name ?? "Operator-selected area";
    const nextLocation: ActiveLocation = {
      id: `area-${selectionFingerprint(selection)}`,
      name: areaLabel,
      region: `${Math.abs(area.center.latitude).toFixed(4)}° ${area.center.latitude >= 0 ? "N" : "S"} · ${Math.abs(area.center.longitude).toFixed(4)}° ${area.center.longitude >= 0 ? "E" : "W"} · operator-defined`,
      latitude: area.center.latitude,
      longitude: area.center.longitude,
      fidelity: "GLOBAL PROTOTYPE",
    };
    setMapSelection(selection);
    setActiveLocation(nextLocation);
    setSourceIncident(undefined);
    setWeatherContext(null);
    setFieldOverlays([]);
    setScenarioName(`${selectedHazard.label} response · ${areaLabel}`);
    setMinute(Math.max(15, Math.min(90, demonstration.result.metrics.peakMinute)));
    const dimensions = selectionAreaDimensionsMeters(selection);
    const extentKm = dimensions ? Math.max(dimensions.northSouthM, dimensions.eastWestM) / 1_000 : 1;
    const validEnvelope = dimensions
      && Math.min(dimensions.northSouthM, dimensions.eastWestM) >= 120
      && extentKm <= 100;
    const zoom = !validEnvelope ? 14.8
      : extentKm < 0.6 ? 16
        : extentKm < 2 ? 14.8
          : extentKm < 10 ? 13
            : extentKm < 30 ? 11.5 : 10.2;
    setSceneView("world");
    setFocusRequest({
      center: [area.center.longitude, area.center.latitude],
      zoom,
      pitch: 48,
      bearing: -24,
      durationMs: 1_300,
      label: `${areaLabel} · ${validEnvelope ? "bounded simulation" : "center-based model fallback"}`,
      requestId: `area-${selectionFingerprint(selection)}-${Date.now()}`,
    });
    void beginSelectionWorkflow(selection);
  }, [beginSelectionWorkflow, demonstration.result.metrics.peakMinute, selectedHazard.label]);

  useEffect(() => () => {
    if (selectionWorkflowTimerRef.current !== null) {
      window.clearTimeout(selectionWorkflowTimerRef.current);
    }
  }, []);

  const focusLocation = useCallback((location: ActiveLocation) => {
    void beginSelectionWorkflow({ points: [] });
    setActiveLocation(location);
    setSourceIncident(undefined);
    setActiveNav("incident");
    setWeatherContext(null);
    setFieldOverlays(createFieldOverlays(location));
    setSceneView("twin");
    setFocusRequest({
      center: [location.longitude, location.latitude],
      zoom: location.fidelity === "EIT SITE MODEL" ? 17.2 : 15.7,
      pitch: 67,
      bearing: -28,
      durationMs: 2_000,
      requestId: `${location.id}-${Date.now()}`,
    });
    setMapSelection({
      points: [{
        id: `hazard-${location.id}`,
        coordinates: [location.longitude, location.latitude],
        role: "hazard-source",
        label: `${location.name} scenario source`,
      }],
    });
    setSearchOpen(false);
    setMinute(0);
    setPlanState("idle");
    setEvacuationVisible(false);
    setLiveRoadRoutes(null);
    setSurgeCapacity(false);
  }, [beginSelectionWorkflow]);

  const focusWorldLocation = useCallback((selection: WorldLocationSelection) => {
    void beginSelectionWorkflow({ points: [] });
    const location: ActiveLocation = {
      id: selection.id,
      name: selection.name,
      region: selection.region,
      latitude: selection.latitude,
      longitude: selection.longitude,
      fidelity: selection.fidelity ?? "GLOBAL PROTOTYPE",
    };
    setActiveLocation(location);
    setSourceIncident(undefined);
    setActiveNav("global");
    setWeatherContext(null);
    setFieldOverlays(createFieldOverlays(location));
    setSceneView("world");
    setFocusRequest({
      center: [selection.longitude, selection.latitude],
      zoom: selection.zoom,
      pitch: selection.zoom >= 13 ? 48 : 18,
      bearing: selection.zoom >= 13 ? -24 : 0,
      durationMs: 2_200,
      label: `${selection.name} · imported open-map context`,
      requestId: `world-${selection.id}-${Date.now()}`,
    });
    setMapSelection({
      points: [{
        id: `hazard-${selection.id}`,
        coordinates: [selection.longitude, selection.latitude],
        role: "hazard-source",
        label: `${selection.name} selected map position`,
      }],
    });
    setMinute(0);
    setPlanState("idle");
    setEvacuationVisible(false);
    setLiveRoadRoutes(null);
    setSurgeCapacity(false);
  }, [beginSelectionWorkflow]);

  const focusIncidentOnWorld = useCallback((incident: LiveIncidentSummary) => {
    const coordinate = incident.location.coordinates;
    if (!coordinate) return;
    const nextHazard = hazardFromIncidentCategory(incident.category);
    const incidentZoom = nextHazard === "cyclone"
      ? 5.8
      : nextHazard === "wildfire"
        ? 9.2
        : nextHazard === "industrial"
          ? 11.2
          : 10.4;
    focusWorldLocation({
      id: `live-${incident.id}`,
      name: incident.location.name || incident.title,
      region: `${incident.provenance.sourceName} · imported incident context`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      type: "live-incident",
      // A closer regional frame makes the hazard footprint, affected roads
      // and modelled damage layer visible immediately after a live ping is
      // selected. Source-reported facts remain separate from the simulation.
      zoom: incidentZoom,
      fidelity: "GLOBAL PROTOTYPE",
    });
    setHazard(nextHazard);
    setScenarioStrength(
      incident.severity === "critical" ? 90 : incident.severity === "high" ? 82 : incident.severity === "medium" ? 68 : 55,
    );
    setViewMode("simulate");
    setActiveNav("incident");
    setMinute(45);
    setRightPanelOpen(true);
    setLayerVisibility((current) => ({
      ...current,
      hazard: true,
      damage: true,
      roads: true,
      incidents: true,
    }));
    setSourceIncident({
      id: incident.id,
      title: incident.title,
      provider: incident.provenance.sourceName,
      observedAt: incident.observedAt,
    });
  }, [focusWorldLocation]);

  const focusMapIncident = useCallback((incident: AegisIncident) => {
    const imported = liveIntelligence?.incidents.find((candidate) => candidate.id === incident.id);
    if (imported) {
      focusIncidentOnWorld(imported);
      return;
    }
    const nextHazard = hazardFromIncidentCategory(incident.type);
    const incidentZoom = nextHazard === "cyclone"
      ? 5.8
      : nextHazard === "wildfire"
        ? 9.2
        : nextHazard === "industrial"
          ? 11.2
          : 10.4;
    focusWorldLocation({
      id: `map-${incident.id}`,
      name: incident.title,
      region: `${incident.source ?? "AEGIS simulation"} · ${incident.live ? "imported incident context" : "simulation"}`,
      latitude: incident.coordinates[1],
      longitude: incident.coordinates[0],
      type: "map-incident",
      zoom: incidentZoom,
      fidelity: "GLOBAL PROTOTYPE",
    });
    setHazard(nextHazard);
    setViewMode("simulate");
    setActiveNav("incident");
    setMinute(45);
    setRightPanelOpen(true);
    setLayerVisibility((current) => ({ ...current, hazard: true, damage: true, roads: true, incidents: true }));
    setSourceIncident({
      id: incident.id,
      title: incident.title,
      provider: incident.source ?? "AEGIS simulation",
      observedAt: incident.occurredAt,
    });
  }, [focusIncidentOnWorld, focusWorldLocation, liveIntelligence?.incidents]);

  const enterWorldView = useCallback(() => {
    setSceneView("world");
    setActiveNav("global");
    // Re-issue an overview camera request even when WORLD is already active.
    // This lets the WORLD button reliably return from a searched street or
    // landmark to the full rotating Earth.
    setFocusRequest({
      center: [24, 16],
      zoom: 1.96,
      pitch: 12,
      bearing: -8,
      durationMs: 1_900,
      label: "Global operations overview",
      requestId: `world-overview-${Date.now()}`,
    });
    setRightPanelOpen(false);
    setEvacuationVisible(false);
  }, []);

  const enterTwinView = useCallback(() => {
    setSceneView("twin");
    setFocusRequest({
      center: [activeLocation.longitude, activeLocation.latitude],
      zoom: activeLocation.fidelity === "EIT SITE MODEL" ? 17.2 : 15.7,
      pitch: 67,
      bearing: -28,
      durationMs: 1_700,
      requestId: `twin-${Date.now()}`,
    });
  }, [activeLocation]);

  const selectGlobeLocation = useCallback((coordinate: [number, number]) => {
    const [longitude, latitude] = coordinate;
    focusWorldLocation({
      id: `picked-${latitude.toFixed(4)}-${longitude.toFixed(4)}`,
      name: "Selected field location",
      region: `${Math.abs(latitude).toFixed(4)}° ${latitude >= 0 ? "N" : "S"} · ${Math.abs(longitude).toFixed(4)}° ${longitude >= 0 ? "E" : "W"}`,
      latitude,
      longitude,
      type: "map-selection",
      zoom: 12.2,
      fidelity: "GLOBAL PROTOTYPE",
    });
  }, [focusWorldLocation]);

  useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const entryKey = "aegis-entry-seen";
    let alreadySeen = false;
    try {
      alreadySeen = Boolean(window.sessionStorage.getItem(entryKey));
    } catch {
      alreadySeen = false;
    }
    if (!alreadySeen) {
      try {
        window.sessionStorage.setItem(entryKey, "true");
      } catch {
        // Entry animation still works when browser storage is unavailable.
      }
    }
    const timer = window.setTimeout(() => setEntryVisible(false), alreadySeen ? 0 : 1_150);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const restore = window.setTimeout(() => {
      try {
        setSavedWorkspaces(loadScenarioWorkspaces(window.localStorage));
        setBookmarks(loadBookmarks(window.localStorage));
        setDecisionReceipts(loadDecisionReceipts(window.localStorage));
        setAuditHistory(loadAuditHistory(window.localStorage));
      } catch {
        // Local persistence is an enhancement; core operations remain usable.
      }
    }, 0);
    const controller = new AbortController();
    void fetch("/api/persistence?kind=scenario&limit=40", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => response.ok ? await response.json() as Array<{ payload?: unknown }> : [])
      .then((records) => {
        const remote = records
          .map((record) => record.payload)
          .filter((payload): payload is ScenarioWorkspace => Boolean(
            payload && typeof payload === "object" && "schemaVersion" in payload
            && (payload as ScenarioWorkspace).schemaVersion === 1,
          ));
        if (!remote.length) return;
        setSavedWorkspaces((current) => {
          const merged = new Map([...remote, ...current].map((workspace) => [workspace.id, workspace]));
          return [...merged.values()].toSorted((first, second) => second.updatedAt.localeCompare(first.updatedAt)).slice(0, 40);
        });
      })
      .catch(() => undefined);
    return () => {
      window.clearTimeout(restore);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/providers", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Provider readiness unavailable");
        return (await response.json()) as ProviderReadinessResponse;
      })
      .then(setProviderReadiness)
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | undefined;
    let pingTimer: number | undefined;
    let attempt = 0;
    let cursor = 0;

    function scheduleReconnect() {
      if (disposed) return;
      if (pingTimer) window.clearInterval(pingTimer);
      setOperationsStream((current) => ({ ...current, status: "reconnecting" }));
      const delay = Math.min(15_000, 1_500 * (2 ** Math.min(attempt, 3)));
      attempt += 1;
      reconnectTimer = window.setTimeout(() => void connect(), delay);
    }

    async function connect() {
      try {
        const response = await fetch("/api/persistence?mode=health", { cache: "no-store" });
        if (!response.ok) {
          setOperationsStream((current) => ({ ...current, status: "local-only" }));
          scheduleReconnect();
          return;
        }
        const health = await response.json() as { streamUrl?: string };
        if (!health.streamUrl || disposed) return;
        const streamUrl = new URL(health.streamUrl);
        streamUrl.searchParams.set("after", String(cursor));
        socket = new WebSocket(streamUrl);
        socket.addEventListener("open", () => {
          attempt = 0;
          setOperationsStream((current) => ({ ...current, status: "connected" }));
          pingTimer = window.setInterval(() => {
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "ping" }));
          }, 20_000);
        });
        socket.addEventListener("message", (event) => {
          try {
            const message = JSON.parse(String(event.data)) as {
              type?: string;
              lastSequence?: number;
              events?: Array<{ sequence?: number }>;
              event?: { sequence?: number };
            };
            if (message.type === "snapshot") {
              const received = message.events?.length ?? 0;
              cursor = Math.max(cursor, message.lastSequence ?? 0);
              setOperationsStream({ status: "connected", eventCount: received, lastSequence: cursor });
            } else if (message.type === "event") {
              cursor = Math.max(cursor, message.event?.sequence ?? cursor);
              setOperationsStream((current) => ({
                status: "connected",
                eventCount: current.eventCount + 1,
                lastSequence: cursor,
              }));
            }
          } catch {
            // Invalid upstream messages are ignored; the validated stream remains connected.
          }
        });
        socket.addEventListener("close", scheduleReconnect);
        socket.addEventListener("error", () => socket?.close());
      } catch {
        if (!disposed) {
          setOperationsStream((current) => ({ ...current, status: "local-only" }));
          scheduleReconnect();
        }
      }
    }

    void connect();
    return () => {
      disposed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (pingTimer) window.clearInterval(pingTimer);
      socket?.close();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    const refresh = async () => {
      if (disposed) return;
      setLiveRefreshing(true);
      try {
        let response: Response | null = null;
        for (let attempt = 0; attempt < 2; attempt += 1) {
          // Incident metadata and source media have different identities. Keep
          // the feed light and fetch media only for the headline selected by the
          // operator; this prevents a generic clip from appearing beside the
          // wrong incident while the specific query is still pending.
          response = await fetch("/api/live?limit=18&days=30&includeMedia=false", {
            signal: controller.signal,
            cache: "no-store",
          });
          if (response.ok || response.status < 500) break;
          await new Promise((resolve) => window.setTimeout(resolve, 250));
        }
        if (!response?.ok) throw new Error("Live feed unavailable");
        const payload = (await response.json()) as LiveIntelligence;
        if (disposed) return;
        const changes = detectIncidentChanges(previousLiveIncidentsRef.current, payload.incidents);
        previousLiveIncidentsRef.current = payload.incidents;
        setLiveChangeCount(changes.length);
        setLiveIntelligence(payload);
      } catch {
        // Retain the last good snapshot; its generated time remains visible.
      } finally {
        if (!disposed) setLiveRefreshing(false);
      }
    };
    void refresh();
    const interval = window.setInterval(() => void refresh(), 120_000);
    return () => {
      disposed = true;
      controller.abort();
      window.clearInterval(interval);
    };
  }, [liveRefreshNonce]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/weather?lat=${activeLocation.latitude}&lon=${activeLocation.longitude}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Weather context unavailable");
        return (await response.json()) as WeatherContext;
      })
      .then(setWeatherContext)
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeLocation.latitude, activeLocation.longitude]);

  useEffect(() => {
    if (activeLocation.id !== "eit" || campusDataset) return;
    const controller = new AbortController();
    void fetch(`/api/terrain?lat=${activeLocation.latitude}&lon=${activeLocation.longitude}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Public elevation context unavailable");
        return await response.json() as {
          terrainControlPoints: TwinTerrainControlPoint[];
          resolutionMeters: number;
        };
      })
      .then((payload) => {
        if (payload.terrainControlPoints.length < 4) return;
        const base = createEitCampusDataset();
        setPublicTerrainDataset({
          ...base,
          id: `${base.id}-glo90`,
          version: `${base.version}+glo90`,
          label: `${base.label} · public ${payload.resolutionMeters} m DEM`,
          terrainControlPoints: payload.terrainControlPoints,
          provenance: [...base.provenance, payload.terrainControlPoints[0].provenance],
          prototypeLabel: "OSM FOOTPRINTS · COPERNICUS GLO-90 TERRAIN · ESTIMATED HEIGHTS/OCCUPANCY",
          disclaimer: `${base.disclaimer} Elevation is imported from a 90 m DEM and is not a campus survey; drainage and micro-topography remain estimated.`,
        });
        setCampusImportStatus("OSM footprints and public Copernicus GLO-90 elevation are active; heights, use, drainage and occupancy remain estimated.");
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [activeLocation.id, activeLocation.latitude, activeLocation.longitude, campusDataset]);

  const mapIncidents = useMemo<AegisIncident[]>(() => {
    const exercise: AegisIncident = {
      id: `INC-${activeLocation.id.toUpperCase()}-${coreHazard.toUpperCase()}-01`,
      title: `${activeLocation.name} ${selectedHazard.label} Exercise`,
      type: coreHazard,
      severity: "high",
      coordinates: [activeLocation.longitude, activeLocation.latitude],
      live: false,
      reality: "simulated",
      dataMode: "simulated-demo",
      freshnessBand: "unknown",
      freshnessLabel: "Simulation timeline",
      sourceStatus: "live",
      status: "simulated",
      description: `${activeLocation.fidelity} deterministic hazard and evacuation scenario.`,
      source: "AEGIS simulation",
    };
    const observed = (liveIntelligence?.incidents ?? [])
      .filter((incident) => incident.location.coordinates)
      .map<AegisIncident>((incident) => ({
        id: incident.id,
        title: incident.title,
        type: incident.category,
        severity:
          incident.severity === "medium"
            ? "moderate"
            : incident.severity === "unknown"
              ? "low"
              : incident.severity,
        coordinates: [
          incident.location.coordinates!.longitude,
          incident.location.coordinates!.latitude,
        ],
        live: incidentIsCurrentObserved(incident),
        reality: incident.reality ?? "observed",
        dataMode: incident.dataMode,
        freshnessBand: incident.freshness?.band ?? "unknown",
        freshnessLabel: incident.freshness?.label ?? "Freshness unavailable",
        sourceStatus: incident.provenance.status,
        status: incident.state,
        occurredAt: incident.observedAt,
        description: incident.summary,
        source: incident.provenance.sourceName,
      }))
      .sort((first, second) => {
        const liveDifference = Number(Boolean(second.live)) - Number(Boolean(first.live));
        if (liveDifference) return liveDifference;
        const severityRank: Record<AegisIncident["severity"], number> = {
          critical: 4,
          high: 3,
          moderate: 2,
          low: 1,
        };
        const severityDifference = severityRank[second.severity] - severityRank[first.severity];
        if (severityDifference) return severityDifference;
        const firstTime = Date.parse(first.occurredAt ?? "");
        const secondTime = Date.parse(second.occurredAt ?? "");
        return (Number.isFinite(secondTime) ? secondTime : 0)
          - (Number.isFinite(firstTime) ? firstTime : 0);
      })
      .slice(0, 20);
    // Keep the exercise as a distinct amber record in Scenario/Response while
    // retaining the observed/context records for situational awareness. The
    // map renderer classifies them independently, so a preset can never be
    // mistaken for a live disaster report even when both are on screen.
    return viewMode === "monitor" ? observed : [exercise, ...observed];
  }, [activeLocation, coreHazard, liveIntelligence, selectedHazard.label, viewMode]);
  const headlineIncident = useMemo(() => {
    const incidents = liveIntelligence?.incidents ?? [];
    return incidents.find((incident) => incident.location.coordinates && incidentIsCurrentObserved(incident))
      ?? incidents.find((incident) => incident.location.coordinates)
      ?? incidents[0];
  }, [liveIntelligence]);
  const headlineIsLive = Boolean(
    headlineIncident
    && incidentIsCurrentObserved(headlineIncident),
  );
  useEffect(() => {
    if (!playing) return;
    const timer = window.setInterval(() => {
      setMinute((current) => (current >= 120 ? 0 : current + 1));
    }, 550);
    return () => window.clearInterval(timer);
  }, [playing]);

  useEffect(() => {
    const openCommand = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandPaletteOpen(true);
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setCopilotOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setComparisonOpen(false);
        setCascadeOpen(false);
        setCopilotOpen(false);
        setLiveNoticeOpen(false);
        setLiveMediaOpen(false);
        setScenarioMenuOpen(false);
        setLayerPanelOpen(false);
        setProviderPanelOpen(false);
        setWorkspaceOpen(false);
        setCommandPaletteOpen(false);
        setRecoveryOpen(false);
        setAlertsOpen(false);
        setAuditOpen(false);
      }
    };
    window.addEventListener("keydown", openCommand);
    return () => window.removeEventListener("keydown", openCommand);
  }, []);

  const generatePlan = useCallback(() => {
    setViewMode("respond");
    setRightPanelOpen(false);
    setPlanDepartureMinute(minute);
    setPlanState("calculating");
    setEvacuationVisible(true);
    window.setTimeout(() => setPlanState("ready"), 780);
  }, [minute]);

  const changeOperationalMode = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (mode === "monitor") {
      enterWorldView();
      return;
    }
    setActiveNav(mode === "simulate" ? "simulation" : "incident");
    enterTwinView();
    if (mode === "respond") generatePlan();
  }, [enterTwinView, enterWorldView, generatePlan]);

  const resetPanelLayout = useCallback(() => {
    scenarioPanel.reset();
    planPanel.reset();
    newsPanel.reset();
    commandPanel.reset();
    providerPanel.reset();
    setRightPanelOpen(false);
    setLayerPanelOpen(false);
    setProviderPanelOpen(false);
  }, [commandPanel, newsPanel, planPanel, providerPanel, scenarioPanel]);

  const askCopilot = useCallback(async (requestedQuestion?: string) => {
    const resolvedQuestion = (requestedQuestion ?? question).trim();
    if (!resolvedQuestion) return;
    setAutomaticDecisionActive(false);
    setAsking(true);
    try {
      const response = await fetch("/api/agent-activity", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: resolvedQuestion,
          state: {
            incident: {
              id: `INC-${activeLocation.id}-${coreHazard}`,
              name: `${activeLocation.name} ${selectedHazard.label} planning scenario`,
              dataClass: "SIMULATED",
              location: [activeLocation.longitude, activeLocation.latitude],
            },
            simulation: {
              minute,
              hazard: coreHazard,
              maximumHazardValue: demonstration.result.metrics.maximumHazardValue,
              maximumHazardUnit: demonstration.result.metrics.maximumHazardUnit,
              blockedRoads: demonstration.result.metrics.peakUnavailableRoads,
              exposedPopulation: demonstration.result.metrics.peakExposedPopulation,
              confidence: averageConfidence / 100,
            },
            evacuation: {
              status: planState,
              movementProfile: evacuationMode,
              departureMinute: evacuationPlan?.departureMinute ?? null,
              totalMinutes: evacuationPlan?.after.estimatedClearanceMinutes ?? null,
              routes: evacuationPlan?.routes.slice(0, 3).map((route) => ({
                id: route.id,
                status: route.status,
                etaMinutes: route.etaMinutes,
                riskScore: route.riskScore,
                reliability: route.reliability,
              })) ?? [],
              coveragePct: evacuationPlan?.after.coveragePct ?? null,
              peopleRemainingExposed: evacuationPlan?.after.peopleRemainingExposed ?? null,
              destinations: evacuationPlan?.endPoints.slice(0, 4).map((point) => point.label) ?? [],
              stages: evacuationPlan?.stages.slice(0, 4).map((stage) => ({
                order: stage.order,
                zone: stage.zoneName,
                population: stage.populationAssigned,
                assistanceRequired: stage.assistanceRequired,
                departureWindow: stage.departureWindow,
              })) ?? [],
            },
            infrastructure: {
              hospitalLoadPct,
              bridgeRiskPct,
              shelterLoadPct,
            },
          },
          evidence: [],
          approvalRequired: true,
        }),
      });
      if (!response.ok) throw new Error("Analysis failed");
      const payload = await response.json() as {
        decision: OperationsDecision;
        narrative?: string;
        activity?: { execution?: Partial<DecisionExecution> };
      };
      setDecision(payload.decision);
      setDecisionNarrative(typeof payload.narrative === "string" && payload.narrative.trim() ? payload.narrative.trim() : null);
      setDecisionExecution({
        mode: payload.activity?.execution?.mode === "hosted-model" ? "hosted-model" : "deterministic-fallback",
        provider: payload.activity?.execution?.provider ?? "AEGIS local engine",
        model: payload.activity?.execution?.model ?? "deterministic-operations-v1",
      });
    } catch {
      setDecision(deterministicDecision({
        location: activeLocation.name,
        hazard: selectedHazard.label,
        minute,
        peakMinute: demonstration.result.metrics.peakMinute,
        maximumValue: demonstration.result.metrics.maximumHazardValue,
        maximumUnit: demonstration.result.metrics.maximumHazardUnit,
        unavailableRoads: demonstration.result.metrics.peakUnavailableRoads,
        exposure: demonstration.result.metrics.peakExposedPopulation,
        confidence: averageConfidence / 100,
        topAction: impactSnapshot.recoveryPlan.actions[0]?.action,
        remainingExposure: impactSnapshot.humanImpact.peopleRemainingInPlanningEnvelope,
      }));
      setDecisionNarrative(null);
      setDecisionExecution({
        mode: "deterministic-fallback",
        provider: "AEGIS local engine",
        model: "deterministic-operations-v1",
      });
    } finally {
      setAsking(false);
    }
  }, [activeLocation, averageConfidence, bridgeRiskPct, coreHazard, demonstration.result.metrics, evacuationMode, evacuationPlan, hospitalLoadPct, impactSnapshot, minute, planState, question, selectedHazard.label, shelterLoadPct]);

  const recordAudit = useCallback((
    action: string,
    detail: string,
    classification: WorkspaceAuditEvent["classification"] = "operator-action",
  ) => {
    const event: WorkspaceAuditEvent = {
      id: makeWorkspaceId("audit"),
      at: new Date().toISOString(),
      action,
      detail,
      classification,
    };
    try {
      setAuditHistory(appendAuditEvent(window.localStorage, event));
    } catch {
      setAuditHistory((current) => [event, ...current].slice(0, 200));
    }
    void fetch("/api/persistence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: event.id,
        kind: "workspace",
        name: event.action,
        status: "recorded",
        payload: event,
        actor: "operator",
      }),
    }).catch(() => undefined);
  }, []);

  const loadPlanningScenario = useCallback((preset: LoadedPlanningScenario) => {
    const location = QUICK_LOCATIONS.find((candidate) => candidate.id === preset.locationId);
    if (!location) return;
    void beginSelectionWorkflow({ points: [] });
    setScenarioName(preset.name);
    setActiveLocation(location);
    setHazard(preset.hazard);
    setScenarioStrength(preset.strength);
    setMinute(preset.minute);
    setPlaying(false);
    setViewMode("simulate");
    setSceneView("twin");
    setActiveNav("simulation");
    setRightPanelOpen(true);
    setPanelTab("impact");
    setScenarioMenuOpen(false);
    const offsetLng = location.longitude + (location.id === "eit" ? 0.0016 : 0.003);
    const offsetLat = location.latitude + (location.id === "eit" ? 0.0012 : 0.002);
    const safeLng = location.longitude - (location.id === "eit" ? 0.0018 : 0.0035);
    const safeLat = location.latitude - (location.id === "eit" ? 0.0014 : 0.003);
    const hazardLabel = preset.hazard === "earthquake" ? "EPICENTER"
      : preset.hazard === "wildfire" ? "IGNITION POINT"
      : preset.hazard === "cyclone" ? "STORM CENTER"
      : preset.hazard === "industrial" ? "RELEASE POINT"
      : "FLOOD SOURCE";
    setPlanState("ready");
    setEvacuationVisible(true);
    setSurgeCapacity(false);
    setLiveRoadRoutes(null);
    setSourceIncident(undefined);
    setWeatherContext(null);
    setFieldOverlays(createFieldOverlays(location));
    setMapSelection({
      points: [
        {
          id: `origin-${preset.id}`,
          coordinates: [offsetLng, offsetLat],
          role: "origin",
          label: "EVAC ORIGIN",
        },
        {
          id: `dest-${preset.id}`,
          coordinates: [safeLng, safeLat],
          role: "destination",
          label: "SAFE POINT",
        },
        {
          id: `hazard-${preset.id}`,
          coordinates: [location.longitude, location.latitude],
          role: "hazard-source",
          label: `${preset.name} · ${hazardLabel}`,
        },
      ],
    });
    setFocusRequest({
      center: [location.longitude, location.latitude],
      zoom: location.fidelity === "EIT SITE MODEL" ? 17.2 : 15.4,
      pitch: 62,
      bearing: -26,
      durationMs: 1_500,
      label: `${preset.name} · loaded planning inputs`,
      requestId: `scenario-${preset.id}-${Date.now()}`,
    });
    recordAudit(
      "Planning scenario loaded",
      `${preset.name} · ${location.name} · ${preset.hazard} · input strength ${preset.strength}`,
    );
  }, [beginSelectionWorkflow, recordAudit]);

  const explainEvacuationProcedure = useCallback(() => {
    const prompt = `Explain the current evacuation procedure for ${activeLocation.name} at T+${minute} minutes, including departure stages, preferred route, destination capacity, assistance demand and remaining exposure.`;
    setQuestion(prompt);
    setCopilotOpen(true);
    void askCopilot(prompt);
  }, [activeLocation.name, askCopilot, minute]);

  const saveCurrentWorkspace = useCallback(() => {
    const previous = savedWorkspaces
      .filter((workspace) => workspace.name === scenarioName)
      .toSorted((first, second) => second.revision - first.revision)[0];
    const now = new Date().toISOString();
    const workspace: ScenarioWorkspace = {
      schemaVersion: 1,
      id: makeWorkspaceId("scenario"),
      name: scenarioName.trim(),
      revision: nextWorkspaceRevision(previous),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      seed: demonstration.scenario.seed,
      location: { ...activeLocation },
      hazard,
      scenarioStrength,
      selectedMinute: minute,
      viewMode,
      layout: workspaceLayout,
      layerVisibility: { ...layerVisibility },
      layerThreshold,
      selection: {
        points: mapSelection.points.map((point) => ({ ...point })),
        area: mapSelection.area ? {
          name: mapSelection.area.properties.name,
          coordinates: mapSelection.area.geometry.coordinates[0].map(([lon, lat]) => [lon, lat] as [number, number]),
        } : undefined,
      },
      annotations: annotations.map((annotation) => ({ ...annotation })),
      sourceIncident,
    };
    try {
      setSavedWorkspaces(saveScenarioWorkspace(window.localStorage, workspace));
    } catch {
      setSavedWorkspaces((current) => [workspace, ...current].slice(0, 40));
    }
    recordAudit("Scenario version saved", `${workspace.name} v${workspace.revision} · seed ${workspace.seed}`);
    void fetch("/api/persistence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: workspace.id,
        kind: "scenario",
        name: workspace.name,
        status: "saved",
        seed: workspace.seed,
        payload: workspace,
        actor: "operator",
      }),
    }).catch(() => undefined);
  }, [activeLocation, annotations, demonstration.scenario.seed, hazard, layerThreshold, layerVisibility, mapSelection.area, mapSelection.points, minute, recordAudit, savedWorkspaces, scenarioName, scenarioStrength, sourceIncident, viewMode, workspaceLayout]);

  const loadWorkspace = useCallback((workspace: ScenarioWorkspace) => {
    void beginSelectionWorkflow({ points: [] });
    setScenarioName(workspace.name);
    setActiveLocation({
      ...workspace.location,
      fidelity: workspace.location.fidelity === "EIT SITE MODEL" ? "EIT SITE MODEL" : "GLOBAL PROTOTYPE",
    });
    setHazard(workspace.hazard);
    setScenarioStrength(workspace.scenarioStrength);
    setMinute(workspace.selectedMinute);
    setViewMode(workspace.viewMode);
    setWorkspaceLayout(workspace.layout);
    setLayerVisibility((current) => ({ ...current, ...workspace.layerVisibility }));
    setLayerThreshold(workspace.layerThreshold);
    setSourceIncident(workspace.sourceIncident);
    const savedOperatingArea = workspace.selection.area;
    const restoredOperatingArea = savedOperatingArea && savedOperatingArea.coordinates.length >= 4
      ? {
        type: "Feature" as const,
        properties: { name: savedOperatingArea.name },
        geometry: {
          type: "Polygon" as const,
          coordinates: [savedOperatingArea.coordinates.map(([lon, lat]) => [lon, lat] as [number, number])],
        },
      }
      : undefined;
    setMapSelection({
      points: workspace.selection.points.map((point) => ({ ...point })),
      area: restoredOperatingArea,
    });
    setAnnotations(workspace.annotations.map((annotation) => ({ ...annotation })));
    setSceneView(workspace.viewMode === "monitor" ? "world" : "twin");
    setFocusRequest({
      center: [workspace.location.longitude, workspace.location.latitude],
      zoom: workspace.location.fidelity === "EIT SITE MODEL" ? 17.2 : 15.7,
      pitch: 67,
      bearing: -28,
      durationMs: 1_400,
      requestId: `workspace-${workspace.id}-${Date.now()}`,
    });
    setWorkspaceOpen(false);
    setEvacuationVisible(false);
    setPlanState("idle");
    recordAudit("Scenario version loaded", `${workspace.name} v${workspace.revision}`);
  }, [beginSelectionWorkflow, recordAudit]);

  const deleteWorkspace = useCallback((workspace: ScenarioWorkspace) => {
    try {
      setSavedWorkspaces(removeScenarioWorkspace(window.localStorage, workspace.id));
    } catch {
      setSavedWorkspaces((current) => current.filter((item) => item.id !== workspace.id));
    }
    recordAudit("Scenario version removed", `${workspace.name} v${workspace.revision}`);
  }, [recordAudit]);

  const importCampusDataset = useCallback(async (file: File) => {
    if (file.size > 12_000_000) {
      setCampusImportStatus("Import rejected: the campus JSON exceeds the 12 MB browser limit.");
      return;
    }
    try {
      const value = JSON.parse(await file.text()) as unknown;
      const result = parseTwinCampusDataset(value);
      if (!result.ok) {
        setCampusImportStatus(`Import rejected: ${result.issues.slice(0, 3).join("; ")}`);
        return;
      }
      setCampusDataset(result.dataset);
      setCampusImportStatus(`Active: ${result.dataset.label} · ${result.summary}.`);
      setActiveLocation({
        id: "eit",
        name: "Echelon Institute of Technology",
        region: "Kabulpur, Faridabad, India",
        latitude: result.dataset.center.lat,
        longitude: result.dataset.center.lon,
        fidelity: "EIT SITE MODEL",
      });
      setSceneView("twin");
      setViewMode("simulate");
      setFocusRequest({
        center: [result.dataset.center.lon, result.dataset.center.lat],
        zoom: 17.2,
        pitch: 67,
        bearing: -28,
        durationMs: 1_500,
        requestId: `campus-import-${Date.now()}`,
      });
      recordAudit("Campus dataset imported", `${result.dataset.label} · ${result.summary}`, "imported-context");
    } catch {
      setCampusImportStatus("Import rejected: the selected file is not valid JSON.");
    }
  }, [recordAudit]);

  const clearCampusDataset = useCallback(() => {
    setCampusDataset(undefined);
    setCampusImportStatus("OSM footprints are active; heights, terrain, use and occupancy remain estimated.");
    recordAudit("Campus dataset reset", "Returned to bundled OSM footprint prototype", "imported-context");
  }, [recordAudit]);

  const applyScenarioPreset = useCallback((preset: (typeof SCENARIO_PRESETS)[number]) => {
    const location: ActiveLocation = {
      ...preset.location,
      fidelity: preset.location.fidelity === "EIT SITE MODEL" ? "EIT SITE MODEL" : "GLOBAL PROTOTYPE",
    };
    setScenarioName(preset.name);
    setHazard(preset.hazard);
    setScenarioStrength(preset.strength);
    setMinute(preset.minute);
    setWorkspaceOpen(false);
    focusLocation(location);
    recordAudit("Scenario preset applied", `${preset.name} · ${preset.hazard}`);
  }, [focusLocation, recordAudit]);

  const applyWorkspaceLayout = useCallback((layout: WorkspaceLayoutId) => {
    setWorkspaceLayout(layout);
    if (layout === "map-only") {
      setRightPanelOpen(false);
      setLayerPanelOpen(false);
      setProviderPanelOpen(false);
    } else if (layout === "response") {
      changeOperationalMode("respond");
    } else if (layout === "analysis") {
      setRecoveryOpen(true);
      enterTwinView();
    }
    recordAudit("Workspace layout changed", layout);
  }, [changeOperationalMode, enterTwinView, recordAudit]);

  const addCurrentBookmark = useCallback(() => {
    const bookmark: WorkspaceBookmark = {
      id: makeWorkspaceId("bookmark"),
      label: activeLocation.name,
      location: { ...activeLocation },
      createdAt: new Date().toISOString(),
    };
    try {
      setBookmarks(saveBookmark(window.localStorage, bookmark));
    } catch {
      setBookmarks((current) => [bookmark, ...current].slice(0, 30));
    }
    recordAudit("Location bookmarked", activeLocation.name, "imported-context");
  }, [activeLocation, recordAudit]);

  const removeSavedBookmark = useCallback((bookmark: WorkspaceBookmark) => {
    try {
      setBookmarks(removeBookmark(window.localStorage, bookmark.id));
    } catch {
      setBookmarks((current) => current.filter((item) => item.id !== bookmark.id));
    }
  }, []);

  const addMapAnnotation = useCallback((label: string, note: string) => {
    const anchor = mapSelection.points.at(-1)?.coordinates
      ?? [activeLocation.longitude, activeLocation.latitude] as [number, number];
    const annotation: WorkspaceAnnotation = {
      id: makeWorkspaceId("annotation"),
      label,
      note,
      coordinates: anchor,
      classification: "operator-annotation",
      createdAt: new Date().toISOString(),
    };
    setAnnotations((current) => [...current, annotation].slice(-60));
    recordAudit("Map annotation added", label);
  }, [activeLocation.latitude, activeLocation.longitude, mapSelection.points, recordAudit]);

  const exportWorkspaceJson = useCallback(() => {
    downloadTextFile(
      `AEGIS-${activeLocation.id}-T${minute}.json`,
      buildWorkspaceJson({
        generatedAt: new Date().toISOString(),
        scenario: demonstration.scenario,
        result: demonstration.result,
        impactSnapshot,
        evacuationPlan: evacuationVisible ? evacuationPlan : null,
        visibleMapLayers,
        mapSelection,
        annotations,
      }),
      "application/json;charset=utf-8",
    );
    recordAudit("Snapshot exported", `${activeLocation.name} · T+${minute} min`);
  }, [activeLocation, annotations, demonstration, evacuationPlan, evacuationVisible, impactSnapshot, mapSelection, minute, recordAudit, visibleMapLayers]);

  const exportVisibleCsv = useCallback(() => {
    const rows = [
      { classification: "SIMULATED", name: "Maximum hazard", value: demonstration.result.metrics.maximumHazardValue, unit: demonstration.result.metrics.maximumHazardUnit },
      { classification: "ESTIMATED", name: "Population exposure envelope", value: impactSnapshot.humanImpact.peopleWithinExposureEnvelope, unit: "people" },
      { classification: "SIMULATED", name: "Affected buildings", value: impactSnapshot.summary.affectedBuildings, unit: "buildings" },
      { classification: "SIMULATED", name: "Closed roads", value: impactSnapshot.summary.closedRoads, unit: "roads" },
      { classification: "SIMULATED", name: "Unavailable facilities", value: impactSnapshot.summary.unavailableCriticalFacilities, unit: "facilities" },
      { classification: "ESTIMATED", name: "Evacuation coverage", value: evacuationVisible ? evacuationPlan.after.coveragePct : 0, unit: "%" },
    ];
    downloadTextFile(`AEGIS-${activeLocation.id}-visible.csv`, buildVisibleDataCsv(rows), "text/csv;charset=utf-8");
    recordAudit("Visible data exported", `${rows.length} classified measures`);
  }, [activeLocation.id, demonstration.result.metrics, evacuationPlan.after.coveragePct, evacuationVisible, impactSnapshot, recordAudit]);

  const printIncidentSummary = useCallback(() => {
    const report = buildPrintableSummaryHtml({
      title: "AEGIS incident summary",
      location: `${activeLocation.name}, ${activeLocation.region}`,
      scenario: selectedHazard.label,
      seed: demonstration.scenario.seed,
      minute,
      metrics: [
        { label: "Maximum hazard", value: `${demonstration.result.metrics.maximumHazardValue.toFixed(2)} ${demonstration.result.metrics.maximumHazardUnit}`, classification: "SIMULATED" },
        { label: "Affected buildings", value: String(impactSnapshot.summary.affectedBuildings), classification: "SIMULATED" },
        { label: "Population exposure envelope", value: impactSnapshot.humanImpact.peopleWithinExposureEnvelope.toLocaleString("en-IN"), classification: "ESTIMATED" },
        { label: "Evacuation coverage", value: evacuationVisible ? `${Math.round(evacuationPlan.after.coveragePct)}%` : "Plan not generated", classification: "SIMULATED" },
      ],
      recommendations: impactSnapshot.recoveryPlan.actions.slice(0, 6).map((action) => action.action),
      generatedAt: new Date().toISOString(),
    });
    const printWindow = window.open("", "_blank", "width=980,height=760");
    if (printWindow) {
      printWindow.opener = null;
      printWindow.document.open();
      printWindow.document.write(report);
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 250);
    }
    recordAudit("Printable summary opened", `${activeLocation.name} · T+${minute} min`);
  }, [activeLocation, demonstration.result.metrics, demonstration.scenario.seed, evacuationPlan.after.coveragePct, evacuationVisible, impactSnapshot, minute, recordAudit, selectedHazard.label]);

  const approveEvacuationPlan = useCallback(() => {
    setPlanState("accepted");
    if (planState === "accepted") return;
    const receipt: DecisionReceipt = {
      id: makeWorkspaceId("receipt"),
      createdAt: new Date().toISOString(),
      scenarioId: demonstration.scenario.metadata.id,
      simulationRunId: demonstration.result.runId,
      scenarioName,
      seed: demonstration.scenario.seed,
      minute,
      decision: surgeCapacity ? "evacuation-plan-modified" : "evacuation-plan-approved",
      planId: evacuationPlan.id,
      clearanceMinutes: evacuationPlan.after.estimatedClearanceMinutes,
      coveragePct: evacuationPlan.after.coveragePct,
      routesCrossingClosures: evacuationPlan.after.routesCrossingClosures,
      remainingExposure: evacuationPlan.after.peopleRemainingExposed,
      warnings: evacuationPlan.warnings,
      operatorNote: "Human-approved hackathon exercise plan; not a public evacuation order.",
      classification: "simulation-decision-receipt",
    };
    try {
      setDecisionReceipts(appendDecisionReceipt(window.localStorage, receipt));
    } catch {
      setDecisionReceipts((current) => [receipt, ...current].slice(0, 100));
    }
    void fetch("/api/persistence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: receipt.id,
        kind: "recommendation",
        name: receipt.decision,
        status: "human-approved",
        seed: receipt.seed,
        payload: receipt,
        actor: "operator",
      }),
    }).catch(() => undefined);
    recordAudit("Evacuation plan approved", `${receipt.planId} · ${Math.round(receipt.coveragePct ?? 0)}% coverage`, "simulated-result");
  }, [demonstration.result.runId, demonstration.scenario.metadata.id, demonstration.scenario.seed, evacuationPlan, minute, planState, recordAudit, scenarioName, surgeCapacity]);

  const commandActions = useMemo<CommandAction[]>(() => [
    { id: "world", label: "Open world operations", detail: "Return to the rotating incident globe", shortcut: "G", group: "Navigate", onRun: enterWorldView },
    { id: "site", label: "Open site 3D", detail: "Fly to the active local digital twin", shortcut: "T", group: "Navigate", onRun: enterTwinView },
    { id: "simulate", label: "Run scenario", detail: "Open the deterministic hazard studio", shortcut: "S", group: "Scenario", onRun: () => changeOperationalMode("simulate") },
    { id: "replay", label: "Replay mission", detail: "Reset and play the complete 120-minute timeline", shortcut: "R", group: "Scenario", onRun: () => { setMinute(0); setSceneView("twin"); setViewMode("simulate"); setPlaying(true); } },
    { id: "evacuate", label: "Generate evacuation", detail: "Create constrained routes and staged departures", shortcut: "E", group: "Scenario", onRun: generatePlan },
    { id: "what-if", label: "Compare what-if branches", detail: "Contained, baseline and severe outcomes", group: "Scenario", onRun: () => setComparisonOpen(true) },
    { id: "workspace", label: "Manage workspace", detail: "Save, load, bookmark and annotate", group: "Workspace", onRun: () => setWorkspaceOpen(true) },
    { id: "recovery", label: "Recovery and re-entry", detail: "Restoration priorities and inspection holds", group: "Workspace", onRun: () => setRecoveryOpen(true) },
    { id: "alerts", label: "Operational alerts", detail: "Service gaps and configured thresholds", group: "Workspace", onRun: () => setAlertsOpen(true) },
    { id: "audit", label: "Decision history", detail: "Receipts and operator audit trail", group: "Workspace", onRun: () => setAuditOpen(true) },
    { id: "snapshot", label: "Export snapshot", detail: "Download classified JSON state", group: "Export", onRun: exportWorkspaceJson },
    { id: "print", label: "Print incident summary", detail: "Open a concise printable report", group: "Export", onRun: printIncidentSummary },
  ], [changeOperationalMode, enterTwinView, enterWorldView, exportWorkspaceJson, generatePlan, printIncidentSummary]);

  return (
    <div className={styles.shell} data-layout={workspaceLayout}>
      {entryVisible ? (
        <button className={styles.entry} onClick={() => setEntryVisible(false)} aria-label="Enter AEGIS operations center">
          <span className={styles.entryEmblem}>
            {/* eslint-disable-next-line @next/next/no-img-element -- native SVG avoids the vinext image-runtime hook crash */}
            <img src="/aegis-mark.svg" alt="" width="58" height="69" />
            <i /><b />
          </span>
          <strong>AEGIS</strong>
          <small>Adaptive Emergency Geospatial Intelligence System</small>
        </button>
      ) : null}
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.brandMark} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- native SVG avoids the vinext image-runtime hook crash */}
            <img src="/aegis-mark.svg" alt="" width="22" height="26" />
            <i />
          </div>
          <div>
            <strong>AEGIS</strong>
            <span>Emergency Operations Console</span>
          </div>
        </div>

        <div className={styles.modeSwitch} aria-label="Operational mode">
          {(["monitor", "simulate", "respond"] as ViewMode[]).map((mode) => (
            <button
              key={mode}
              className={viewMode === mode ? styles.modeActive : ""}
              onClick={() => changeOperationalMode(mode)}
            >
              {mode === "monitor" ? "Monitor" : mode === "simulate" ? "Scenario" : "Response"}
            </button>
          ))}
        </div>

        <div className={styles.headerStatus}>
          <button
            type="button"
            className={styles.healthLabel}
            onClick={() => setProviderPanelOpen((current) => !current)}
            aria-expanded={providerPanelOpen}
            aria-controls="provider-health-panel"
          >
            <i className={providerReadiness && providerReadiness.summary.degraded === 0 ? styles.healthGreen : styles.healthAmber} />
            <span>
              {providerReadiness
                ? `${providerReadiness.summary.ready} services connected`
                : "Checking services"}
            </span>
          </button>
          <div className={styles.clock}>
            <span>{clock ? formatClock(clock) : "--:--:--"}</span>
            <small>IST</small>
          </div>
          <button
            className={styles.iconButton}
            aria-label="Open command palette"
            title="Command palette · Ctrl K"
            onClick={() => setCommandPaletteOpen(true)}
          >
            <Command size={16} />
          </button>
          <FeatureNavigation active="operations" compact />
          <button
            className={styles.iconButton}
            aria-label="Open scenario workspace"
            title="Scenario workspace"
            onClick={() => setWorkspaceOpen(true)}
          >
            <FolderOpen size={16} />
          </button>
          <button
            className={styles.iconButton}
            aria-label={`Open ${productAlerts.length} operational alerts`}
            title="Operational alerts"
            onClick={() => setAlertsOpen(true)}
          >
            <ShieldAlert size={16} />
            {productAlerts.length ? <i className={styles.notificationDot} /> : null}
          </button>
          <button
            className={styles.iconButton}
            aria-label="Reset workspace"
            title="Reset workspace"
            onClick={resetPanelLayout}
          >
            <RotateCcw size={16} />
          </button>
          <button className={styles.iconButton} aria-label="Notifications" onClick={() => setLiveNoticeOpen(true)}>
            <Bell size={17} />
            <i className={styles.notificationDot} />
          </button>
          <button
            className={styles.mobileMenu}
            onClick={() => setRightPanelOpen((value) => !value)}
            aria-label={rightPanelOpen ? "Hide command panel" : "Show command panel"}
            title={rightPanelOpen ? "Hide command panel" : "Show command panel"}
          >
            <Menu size={19} />
          </button>
        </div>
      </header>

      {providerPanelOpen ? (
        <section
          id="provider-health-panel"
          data-floating-panel="provider-health"
          className={panelClassName(styles.providerPanel, providerPanel)}
          style={providerPanel.style}
          aria-label="Service setup and runtime status"
        >
          <button
            type="button"
            className={styles.dragHandle}
            aria-label="Move service setup panel"
            title="Drag to move; resize from the lower corner"
            {...providerPanel.dragHandleProps}
          ><GripHorizontal size={18} /></button>
          <div className={styles.providerPanelHeader}>
            <div><span>Service setup</span><strong>Online services</strong></div>
            <PanelControls panel={providerPanel} label="service setup" onClose={() => setProviderPanelOpen(false)} />
          </div>
          {!providerPanel.minimized ? (
            <>
              <div className={styles.providerSummary}>
                <strong>{providerReadiness?.summary.ready ?? 0}</strong>
                <span>configured</span>
                <strong>{providerReadiness?.summary.optional ?? 0}</strong>
                <span>optional disabled</span>
              </div>
              <small className={styles.providerNotice}>
                Durable event stream: {operationsStream.status.replace("-", " ")}
                {operationsStream.status === "connected"
                  ? ` · cursor ${operationsStream.lastSequence} · ${operationsStream.eventCount} events received`
                  : " · browser storage remains available"}
              </small>
              <div className={styles.providerList}>
                {(providerReadiness?.providers ?? []).map((provider) => (
                  <div key={provider.id}>
                    <i className={styles[`provider_${provider.readiness.replace("-", "_")}`]} />
                    <span><b>{provider.label}</b><small>{provider.detail}</small></span>
                    <em>{provider.readiness === "ready" ? "configured" : provider.readiness.replace(/-/g, " ")}</em>
                  </div>
                ))}
                {!providerReadiness ? <p>Provider readiness is temporarily unavailable.</p> : null}
              </div>
              <small className={styles.providerNotice}>{providerReadiness?.notice}</small>
            </>
          ) : null}
        </section>
      ) : null}

      <div className={styles.alertStrip} data-live={headlineIsLive ? "true" : "false"}>
        <div className={styles.alertLead}>
          <Radio size={14} />
          Incident updates
        </div>
        <button onClick={() => setLiveNoticeOpen(true)}>
            <StatusTag tone={headlineIsLive ? "red" : "neutral"}>
              {headlineIsLive ? "Live source" : headlineIncident ? "Archived context" : "Connecting"}
          </StatusTag>
          <strong>{headlineIncident?.location.name || "Global incident feeds"}</strong>
          <span>{headlineIncident?.title || "Waiting for source-labelled events"}</span>
          <small>{headlineIncident?.provenance.sourceName || "Provider status available"}</small>
          <ArrowUpRight size={14} />
        </button>
        <div className={styles.alertSource}>{liveIntelligence?.mode === "live" ? "live providers" : liveIntelligence?.mode === "mixed" ? "mixed provider state" : liveIntelligence ? "provider unavailable" : "online first"}</div>
      </div>

      <main className={styles.workspace}>
        <aside className={styles.rail} aria-label="AEGIS sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                title={`${item.label} — ${item.brief}`}
                aria-label={`${item.label}: ${item.brief}`}
                className={activeNav === item.id ? styles.railActive : ""}
                onClick={() => {
                  setActiveNav(item.id);
                  if (item.id === "global") {
                    enterWorldView();
                  } else if (item.id === "incident") {
                    enterTwinView();
                    setRightPanelOpen(true);
                  } else if (item.id === "simulation") {
                    changeOperationalMode("simulate");
                  } else if (item.id === "cascade") {
                    setCascadeOpen(true);
                  } else if (item.id === "evidence") {
                    setLiveNoticeOpen(true);
                  } else if (item.id === "analytics") {
                    setPanelTab("intelligence");
                    setRightPanelOpen(true);
                  }
                }}
              >
                <Icon size={18} />
                <span className={styles.railLabel}>{item.label}</span>
                <span className={styles.railBrief} aria-hidden="true"><strong>{item.label}</strong><small>{item.brief}</small></span>
              </button>
            );
          })}
          <div className={styles.railSpacer} />
          <button
            title="Reset workspace"
            aria-label="Reset workspace"
            onClick={resetPanelLayout}
          ><Settings2 size={18} /><span className={styles.railLabel}>Reset</span></button>
          <div className={styles.operatorBadge}>X</div>
        </aside>

        <section className={styles.mapStage}>
          <Suspense fallback={<div className={styles.mapLoading}><Globe2 size={26} /><span>Loading geospatial engine</span></div>}>
            <OperationalMap
              autoFlyToEit={false}
              hazardType={hazard}
              incidents={layerVisibility.incidents ? mapIncidents : []}
              layers={visibleMapLayers}
              twinScene={layerVisibility.structures ? twinScene : undefined}
              externalOverlays={layerVisibility.field ? operationalOverlays : []}
              onOverlayMove={({ id, coordinates }) => {
                setFieldOverlays((current) => current.map((overlay) => (
                  overlay.id === id ? { ...overlay, coordinates } : overlay
                )));
                setAnnotations((current) => current.map((annotation) => (
                  annotation.id === id ? { ...annotation, coordinates } : annotation
                )));
              }}
              selection={viewMode === "monitor" ? EMPTY_MAP_SELECTION : mapSelection}
              onSelectionChange={updateMapSelection}
              onSelectionClear={clearOperatorSelection}
              onAreaComplete={completeOperatingArea}
              onIncidentSelect={focusMapIncident}
              focusRequest={focusRequest}
              viewMode={sceneView}
              onViewModeChange={setSceneView}
              showViewModeControl={false}
              onLocationPick={selectGlobeLocation}
              forceOffline={false}
              ariaLabel="AEGIS global operations and EIT digital twin map"
            />
          </Suspense>

          <div className={styles.semanticLegend} aria-label={sceneView === "world" ? "Incident marker legend" : "Operational color legend"}>
            {sceneView === "world" ? (
              <>
                <span><i className={styles.legendObserved} />Current observed</span>
                <span><i className={styles.legendContext} />Source context</span>
                {viewMode !== "monitor" ? <span><i className={styles.legendSimulation} />Simulation</span> : null}
              </>
            ) : (
              <>
                <span><i className={styles.legendDamage} />Simulated damage</span>
                <span><i className={styles.legendRoute} />Escape route</span>
                <span><i className={styles.legendSafe} />Safe area</span>
                <span><i className={styles.legendUnsafe} />Unsafe / unavailable</span>
              </>
            )}
          </div>

          <div className={styles.locationBar}>
            <div className={styles.locationIdentity}>
              <div className={styles.livePulse}><i /></div>
              <div>
                <span>{activeSection.label}</span>
                <strong>{sceneView === "world" ? "Worldwide incident overview" : `${activeLocation.name} · ${activeLocation.region}`}</strong>
                <small>{activeSection.brief}</small>
              </div>
            </div>
            {sceneView === "world" ? (
              <WorldLocationSearch
                activeName={activeLocation.name}
                activeLatitude={activeLocation.latitude}
                activeLongitude={activeLocation.longitude}
                quickLocations={QUICK_LOCATIONS.map((location) => ({
                  ...location,
                  type: location.id === "eit" ? "college" : "city",
                  zoom: location.id === "eit" ? 16.2 : 10.5,
                  fidelity: location.fidelity,
                }))}
                onSelect={focusWorldLocation}
              />
            ) : null}
            <div className={styles.sceneSwitch} aria-label="Geospatial scene mode">
              <button className={sceneView === "world" ? styles.sceneActive : ""} onClick={enterWorldView}>
                <Globe2 size={15} />
                Global map
              </button>
              <button className={sceneView === "twin" ? styles.sceneActive : ""} onClick={enterTwinView}>
                <Building2 size={15} />
                Site model
              </button>
            </div>
            <div className={styles.coordinates}>
              <Crosshair size={13} />
              {Math.abs(activeLocation.latitude).toFixed(4)}° {activeLocation.latitude >= 0 ? "N" : "S"} · {Math.abs(activeLocation.longitude).toFixed(4)}° {activeLocation.longitude >= 0 ? "E" : "W"}
              <StatusTag tone={activeLocation.fidelity === "EIT SITE MODEL" ? "green" : "amber"}>{locationFidelityLabel(activeLocation)}</StatusTag>
            </div>
            {weatherContext?.current ? (
              <div className={styles.weatherChip} title={`${weatherContext.source} imported weather context`}>
                <CloudRain size={14} />
                <span>{weatherContext.current.temperature_2m?.toFixed(1) ?? "—"}°C</span>
                <span>{weatherContext.current.precipitation?.toFixed(1) ?? "0.0"} mm</span>
                <span>{weatherContext.current.wind_speed_10m?.toFixed(0) ?? "—"} km/h</span>
                <StatusTag tone={weatherContext.mode === "live-model-feed" ? "green" : "amber"}>
                  {weatherContext.mode === "live-model-feed" ? "IMPORTED" : "ESTIMATED"}
                </StatusTag>
              </div>
            ) : null}
            <button
              className={`${styles.searchButton} ${layerPanelOpen ? styles.toolButtonActive : ""}`}
              aria-label="Manage map layers"
              aria-expanded={layerPanelOpen}
              onClick={() => setLayerPanelOpen((current) => !current)}
            >
              <Layers3 size={15} />
              <span>Layers</span>
            </button>
            {sceneView === "twin" ? (
              <button className={styles.searchButton} aria-label="Search another location" onClick={() => setSearchOpen(true)}>
                <Search size={15} />
                <span>Search world</span>
              </button>
            ) : null}
          </div>

          {layerPanelOpen ? (
            <section className={styles.layerPanel} aria-label="Map layer manager">
              <div className={styles.layerPanelHeader}>
                <div><span>Map layers</span><strong>Visible operational data</strong></div>
                <button type="button" onClick={() => setLayerPanelOpen(false)} aria-label="Close layer manager"><X size={15} /></button>
              </div>
              <div className={styles.layerPanelMeta}>
                <span>{averageConfidence}% model confidence</span>
                <span>T+{String(minute).padStart(3, "0")} min</span>
                <span>{providerReadiness?.summary.ready ?? 0} providers ready</span>
                <span>{measurementSummary.distanceKm.toFixed(2)} km · {measurementSummary.areaSqKm.toFixed(2)} km²</span>
              </div>
              <div className={styles.layerTools}>
                <label><Search size={13} /><input value={layerQuery} onChange={(event) => setLayerQuery(event.target.value)} placeholder="Search layers" aria-label="Search layers" /></label>
                <select
                  aria-label="Solo one layer"
                  defaultValue=""
                  onChange={(event) => {
                    const selected = event.target.value as OperationalLayerId | "";
                    if (!selected) return;
                    setLayerVisibility(Object.fromEntries(
                      (Object.keys(DEFAULT_LAYER_VISIBILITY) as OperationalLayerId[]).map((id) => [id, id === selected]),
                    ) as Record<OperationalLayerId, boolean>);
                    event.currentTarget.value = "";
                  }}
                >
                  <option value="">Solo a layer…</option>
                  {LAYER_DEFINITIONS.map((layer) => <option key={layer.id} value={layer.id}>{layer.label}</option>)}
                </select>
                <div className={styles.layerPresets}>
                  <button type="button" onClick={() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY)}>All</button>
                  <button type="button" onClick={() => setLayerVisibility({ ...DEFAULT_LAYER_VISIBILITY, incidents: false, field: false, evacuation: false, facilities: false })}>Impact</button>
                  <button type="button" onClick={() => setLayerVisibility({ ...DEFAULT_LAYER_VISIBILITY, hazard: false, flow: false, incidents: false, field: false })}>Response</button>
                  <button type="button" onClick={() => setLayerVisibility({ ...DEFAULT_LAYER_VISIBILITY, hazard: false, flow: false, damage: false, evacuation: false })}>Context</button>
                </div>
                <label className={styles.layerThreshold}>
                  <span>Impact threshold</span><b>{layerThreshold}%</b>
                  <input type="range" min="0" max="90" step="10" value={layerThreshold} onChange={(event) => setLayerThreshold(Number(event.target.value))} />
                </label>
              </div>
              <div className={styles.layerGroups}>
                {LAYER_GROUPS.map((group) => {
                  const needle = layerQuery.trim().toLowerCase();
                  const layers = LAYER_DEFINITIONS.filter((layer) => layer.group === group && (
                    !needle || `${layer.label} ${layer.detail} ${layer.classification}`.toLowerCase().includes(needle)
                  ));
                  if (!layers.length) return null;
                  const groupVisible = layers.every((layer) => layerVisibility[layer.id]);
                  return (
                    <section key={group}>
                      <div className={styles.layerGroupHeader}>
                        <strong>{group}</strong>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={groupVisible}
                          onClick={() => setLayerVisibility((current) => {
                            const next = { ...current };
                            layers.forEach((layer) => { next[layer.id] = !groupVisible; });
                            return next;
                          })}
                        >{groupVisible ? "Hide group" : "Show group"}</button>
                      </div>
                      {layers.map((layer) => (
                        <button
                          type="button"
                          role="switch"
                          aria-checked={layerVisibility[layer.id]}
                          className={styles.layerRow}
                          key={layer.id}
                          onClick={() => setLayerVisibility((current) => ({ ...current, [layer.id]: !current[layer.id] }))}
                        >
                          <i className={styles[`layerTone_${layer.tone}`]} />
                          <span><b>{layer.label}</b><small>{layer.detail}</small></span>
                          <em>{layer.classification}</em>
                          <span className={styles.layerSwitch}><i /></span>
                        </button>
                      ))}
                    </section>
                  );
                })}
              </div>
              <button className={styles.layerReset} type="button" onClick={() => setLayerVisibility(DEFAULT_LAYER_VISIBILITY)}>
                <RotateCcw size={14} /> Restore layer visibility
              </button>
            </section>
          ) : null}

          {viewMode !== "monitor" ? <div data-floating-panel="scenario" className={panelClassName(styles.scenarioCard, scenarioPanel)} style={scenarioPanel.style}>
            <button
              type="button"
              className={styles.dragHandle}
              aria-label="Move scenario panel"
              title="Drag to move · resize from the lower corner"
              {...scenarioPanel.dragHandleProps}
            >
              <GripHorizontal size={18} />
            </button>
            <div className={styles.scenarioHeader}>
              <div className={styles.scenarioHeading}>
                <div><span>Scenario setup</span><StatusTag tone="neutral">Planning model</StatusTag></div>
                <small>Configure the hazard, operating area and case</small>
              </div>
              <button className={styles.hazardSelector} onClick={() => setScenarioMenuOpen((value) => !value)} aria-expanded={scenarioMenuOpen}>
                <SelectedHazardIcon size={16} />
                <span><small>Hazard model</small><strong>{selectedHazard.label}</strong></span>
                <ChevronDown size={14} />
              </button>
              <PanelControls panel={scenarioPanel} label="scenario" />
            </div>

            {scenarioMenuOpen && (
              <div className={styles.scenarioMenu}>
                {HAZARDS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={hazard === item.id ? styles.scenarioSelected : ""}
                      onClick={() => {
                        setHazard(item.id);
                        setScenarioMenuOpen(false);
                        setMinute(0);
                        setPlanState("idle");
                        setEvacuationVisible(false);
                        setSurgeCapacity(false);
                      }}
                    >
                      <Icon size={16} style={{ color: item.accent }} />
                      <span><strong>{item.label}</strong><small>{item.summary}</small></span>
                      {hazard === item.id && <Check size={14} />}
                    </button>
                  );
                })}
                <div className={styles.comingSoon}>
                  <span>Expansion-ready hazards</span>
                  <p>{COMING_SOON.join(" · ")}</p>
                </div>
              </div>
            )}

            <div className={styles.scenarioInputs}>
              <div className={styles.scenarioInputHeading}>
                <label htmlFor="scenario-strength"><span>Hazard intensity</span><strong>{control.label}</strong></label>
                <output htmlFor="scenario-strength">{control.value}</output>
              </div>
              <input
                id="scenario-strength"
                type="range"
                min="20"
                max="140"
                value={scenarioStrength}
                onChange={(event) => {
                  setScenarioStrength(Number(event.target.value));
                }}
                aria-label={control.label}
                aria-valuetext={control.value}
              />
              <div className={styles.inputMeta}>
                {control.detail.map((item) => <span key={item}>{item}</span>)}
              </div>
            </div>

            <div className={styles.scenarioContext}>
              <header><span>Operating area</span><small>Current map selection</small></header>
              <strong title={`${activeLocation.name} · ${activeLocation.region}`}>{activeLocation.name}</strong>
              <small className={styles.scenarioRegion}>{activeLocation.region}</small>
              <div className={styles.scenarioCoordinates}>
                <span><b>X</b>{activeLocation.longitude.toFixed(4)}</span>
                <span><b>Y</b>{activeLocation.latitude.toFixed(4)}</span>
                <span><b>Z</b>Terrain</span>
                <span><b>TIME</b>T+{minute} min</span>
              </div>
              <p>{operatingAreaMessage}</p>
            </div>

            <section className={styles.scenarioLibrary} aria-label="Loaded planning scenarios">
              <header><span>Simulation presets</span><small>{LOADED_PLANNING_SCENARIOS.length} ready-to-run cases · separate from live reports</small></header>
              <div>
                {LOADED_PLANNING_SCENARIOS.map((preset) => {
                  const location = QUICK_LOCATIONS.find((candidate) => candidate.id === preset.locationId);
                  const hazardDefinition = HAZARDS.find((candidate) => candidate.id === preset.hazard);
                  const presetControl = scenarioControl(preset.hazard, preset.strength);
                  if (!location || !hazardDefinition) return null;
                  return (
                    <button
                      type="button"
                      key={preset.id}
                      aria-pressed={scenarioName === preset.name}
                      onClick={() => loadPlanningScenario(preset)}
                      style={{ "--scenario-accent": hazardDefinition.accent } as CSSProperties}
                    >
                      <span className={styles.scenarioPresetTop}>
                        <i aria-hidden="true" />
                        <span><strong>{preset.name}</strong><small>{location.name} · {location.region}</small></span>
                        {scenarioName === preset.name ? <Check size={13} aria-hidden="true" /> : <ArrowUpRight size={13} aria-hidden="true" />}
                      </span>
                      <p>{preset.brief}</p>
                      <span className={styles.scenarioPresetMeta}>
                        <b>{hazardDefinition.shortLabel}</b>
                        <span>{presetControl.value}</span>
                        <span>T+{preset.minute} min</span>
                      </span>
                      {preset.proxyLabel ? <em className={styles.scenarioProxyLabel}>{preset.proxyLabel}</em> : null}
                    </button>
                  );
                })}
              </div>
            </section>

            <button className={styles.branchButton} onClick={() => setComparisonOpen(true)}>
              <Zap size={14} />
              Branch what-if scenario
            </button>
          </div> : null}

          {viewMode !== "monitor" ? <div className={styles.depthLegend}>
            <div><span>{hazardMetricLabel(coreHazard)}</span><StatusTag tone="blue">Modelled</StatusTag></div>
            <div
              className={styles.legendGradient}
              style={{ background: `linear-gradient(90deg, transparent, ${selectedHazard.accent}66, ${selectedHazard.accent}, #ff6d62)` }}
            />
            <div className={styles.legendScale}><span>Low</span><span>Moderate</span><span>High</span><span>Extreme</span></div>
          </div> : null}

          {evacuationVisible && (
            <div data-floating-panel="evacuation" className={panelClassName(styles.planOverlay, planPanel)} style={planPanel.style}>
              <button
                type="button"
                className={styles.dragHandle}
                aria-label="Move evacuation panel"
                title="Drag to move · resize from the lower corner"
                {...planPanel.dragHandleProps}
              >
                <GripHorizontal size={18} />
              </button>
              <div className={styles.planTop}>
                <div className={styles.planIcon}><Route size={18} /></div>
                <div>
                  <span>Evacuation plan · {evacuationPlan?.id ?? "OPT-EIT"}</span>
                  <strong>{planState === "calculating" ? "Calculating constrained routes…" : "Two-stage evacuation ready"}</strong>
                </div>
                <PanelControls panel={planPanel} label="evacuation" onClose={() => setEvacuationVisible(false)} />
              </div>
              {planState !== "calculating" && evacuationPlan ? (
                <>
                  <div className={styles.planModeRow}>
                    <span>Movement profile</span>
                    <select value={evacuationMode} onChange={(event) => {
                      setEvacuationMode(event.target.value as "bus" | "car" | "pedestrian");
                      setPlanState("ready");
                    }} aria-label="Evacuation movement profile">
                      <option value="pedestrian">Pedestrian</option>
                      <option value="bus">Bus</option>
                      <option value="car">Car</option>
                    </select>
                    <small>Ambulance and heavy-rescue passability remains visible per road during inspection.</small>
                  </div>
                  <div className={styles.routeRows}>
                    {evacuationPlan.routes.slice(0, 3).map((routeItem, index) => (
                      <div key={routeItem.id}>
                        <i className={styles.routeBlue} />
                        <span><b>R-{String(index + 1).padStart(2, "0")}</b> {routeItem.status}</span>
                        <strong>{Math.round(routeItem.etaMinutes).toString().padStart(2, "0")} min</strong>
                      </div>
                    ))}
                  </div>
                  <div className={styles.planMetrics}>
                    <div><span>Clearance</span><b>{Math.round(evacuationPlan.after.estimatedClearanceMinutes)} min</b><small>modelled</small></div>
                    <div><span>Coverage</span><b>{Math.round(evacuationPlan.after.coveragePct)}%</b><small>{evacuationPlan.after.peopleCoveredByPlan.toLocaleString("en-IN")} people</small></div>
                    <div><span>Route conflicts</span><b>{evacuationPlan.after.routesCrossingClosures}</b><small>closure crossings</small></div>
                  </div>
                  <div className={styles.planActions}>
                    <button
                      type="button"
                      className={`${styles.secondaryAction} ${styles.clearSelectionAction}`}
                      onClick={clearOperatorSelection}
                    >
                      <X size={14} /> Clear map selection
                    </button>
                    <button
                      className={styles.secondaryAction}
                      onClick={() => {
                        if (!surgeCapacity) {
                          setPlanState("calculating");
                          setSurgeCapacity(true);
                          window.setTimeout(() => setPlanState("ready"), 620);
                        } else {
                          setPlanState("idle");
                          setEvacuationVisible(false);
                          setActiveNav("simulation");
                        }
                      }}
                    >{surgeCapacity ? "Modify endpoints" : "Activate surge capacity"}</button>
                    <button
                      className={styles.primaryAction}
                      onClick={approveEvacuationPlan}
                    >
                      {planState === "accepted" ? <><Check size={15} /> Approved in simulation</> : "Approve plan"}
                    </button>
                  </div>
                </>
              ) : null}
            </div>
          )}

          <div className={styles.timeline}>
            <div className={styles.transport}>
              <button onClick={() => setMinute(Math.max(0, minute - 5))} aria-label="Rewind five minutes"><Rewind size={16} /></button>
              <button className={styles.playButton} onClick={() => setPlaying((value) => !value)} aria-label={playing ? "Pause simulation" : "Play simulation"}>
                {playing ? <Pause size={17} fill="currentColor" /> : <Play size={17} fill="currentColor" />}
              </button>
              <button onClick={() => setMinute(Math.min(120, minute + 5))} aria-label="Forward five minutes"><FastForward size={16} /></button>
            </div>
            <div className={styles.timeReadout}>
              <span>Simulation time</span>
              <strong>T+{String(minute).padStart(3, "0")}:00</strong>
            </div>
            <div className={styles.timelineTrack}>
              <input
                type="range"
                min="0"
                max="120"
                value={minute}
                onChange={(event) => setMinute(Number(event.target.value))}
                aria-label="Simulation time"
              />
              <div className={styles.eventTicks}>
                <i style={{ left: "13%" }} /><i style={{ left: "26%" }} /><i style={{ left: "42%" }} /><i style={{ left: "68%" }} />
              </div>
              <div className={styles.timeScale}><span>00</span><span>30</span><span>60</span><span>90</span><span>120 min</span></div>
            </div>
            <div className={styles.timelineActions}>
              <button onClick={() => { setMinute(0); setPlaying(false); }}><RefreshCw size={14} /> Reset</button>
              <button onClick={() => setComparisonOpen(true)}><SlidersHorizontal size={14} /> Compare</button>
            </div>
          </div>
        </section>

        <aside
          data-floating-panel="incident"
          className={`${panelClassName(styles.commandPanel, commandPanel)} ${rightPanelOpen ? styles.commandPanelOpen : ""}`}
          style={commandPanel.style}
        >
          <div className={styles.panelHeader}>
            <button
              type="button"
              className={styles.dragHandle}
              aria-label="Move incident panel"
              title="Drag to move · resize from the lower corner"
              {...commandPanel.dragHandleProps}
            >
              <GripHorizontal size={18} />
            </button>
            <div>
              <span>Incident</span>
              <strong>INC-{activeLocation.id.replace(/[^a-z0-9]+/gi, "-").toUpperCase()}-{coreHazard.toUpperCase()}</strong>
              <small className={styles.panelBrief}>Calculated effects and access state at T+{minute} min</small>
            </div>
            <StatusTag tone={currentFrame.severity === "minimal" || currentFrame.severity === "minor" ? "amber" : "red"}>
              {currentFrame.severity.toUpperCase()}
            </StatusTag>
            <PanelControls panel={commandPanel} label="incident" onClose={() => setRightPanelOpen(false)} />
          </div>

          <div className={styles.provenanceRow}>
            <span><Database size={12} /> Real geospatial context</span>
            <span><Boxes size={12} /> Deterministic twin model</span>
          </div>

          <div className={styles.metricsGrid}>
            <Metric
              label={hazardMetricLabel(coreHazard)}
              value={`${demonstration.result.metrics.maximumHazardValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })} ${demonstration.result.metrics.maximumHazardUnit}`}
              detail={`peak at T+${demonstration.result.metrics.peakMinute} min`}
              tone="blue"
            />
            <Metric label="Road access" value={`${roadAccessPct}%`} detail={`${demonstration.result.metrics.peakUnavailableRoads} unavailable`} tone="amber" />
            <Metric label="Population" value={demonstration.result.metrics.peakExposedPopulation.toLocaleString("en-IN")} detail="projected exposure" tone="red" />
            <Metric label="Assistance demand" value={impactSnapshot.humanImpact.mobilityAssistanceEstimate.toLocaleString("en-IN")} detail="mobility-assistance planning estimate" tone="amber" />
            <Metric label="Affected structures" value={affectedBuildingCount.toString()} detail={`${severeDamageScreeningCount} severe damage-screening states`} tone="red" />
            <Metric label="Model confidence" value={`${averageConfidence}%`} detail="simulation confidence, not observed truth" tone="green" />
          </div>

          <div className={styles.tabs} role="tablist">
            {(["impact", "intelligence", "resources"] as PanelTab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={panelTab === tab}
                className={panelTab === tab ? styles.tabActive : ""}
                onClick={() => setPanelTab(tab)}
              >
                <span>{tab}</span>
                <small>{PANEL_TAB_BRIEFS[tab]}</small>
              </button>
            ))}
          </div>

          <div className={styles.panelBody}>
            {panelTab === "impact" && (
              <>
                {priorityBuilding ? (
                  <section className={styles.buildingXray}>
                    <div className={styles.sectionTitle}>
                      <span><b>3D building impact</b><small>External depth, floor exposure and access screening</small></span>
                      <StatusTag tone={priorityBuilding.accessStatus === "closed" ? "red" : "amber"}>
                        {priorityBuilding.damageBand.toUpperCase()}
                      </StatusTag>
                    </div>
                    <strong>{priorityBuilding.buildingName}</strong>
                    <div className={styles.buildingXrayGrid}>
                      <div><span>Waterline</span><b>{priorityBuilding.currentExternalDepthM.toFixed(2)} m</b></div>
                      <div><span>Floors affected</span><b>{priorityBuilding.floorsAffected}</b></div>
                      <div><span>Access</span><b>{priorityBuilding.accessStatus}</b></div>
                      <div><span>Exposure</span><b>{priorityBuilding.occupantsInExposureEnvelope.toLocaleString("en-IN")}</b></div>
                    </div>
                    <p>{priorityBuilding.recommendedAction}</p>
                    <small>Estimated campus massing · simulated impact · not surveyed BIM</small>
                  </section>
                ) : null}
                <section className={styles.casualtySection}>
                  <div className={styles.sectionTitle}><span><b>Human impact</b><small>Exposure and mobility-support estimates, not casualties</small></span><StatusTag tone="red">Simulated</StatusTag></div>
                  <div className={styles.casualtyGrid}>
                    <div><span>People inside impact envelope</span><strong>{impactSnapshot.humanImpact.peopleWithinExposureEnvelope.toLocaleString("en-IN")}</strong><small>Aggregate scenario exposure</small></div>
                    <div><span>Mobility-assistance demand</span><strong>{impactSnapshot.humanImpact.mobilityAssistanceEstimate.toLocaleString("en-IN")}</strong><small>Planning estimate; field confirmation required</small></div>
                    <div><span>People in isolated zones</span><strong>{impactSnapshot.humanImpact.peopleInIsolatedZones.toLocaleString("en-IN")}</strong><small>Current simulated access state</small></div>
                    <div><span>Observed casualties</span><strong>—</strong><small>Unavailable and not modelled for this exercise.</small></div>
                  </div>
                  <p className={styles.humanImpactNotice}>{impactSnapshot.humanImpact.notice}</p>
                </section>
                <section className={styles.secondaryConsequences}>
                  <div><span><b>Secondary consequences</b><small>Contamination, erosion, debris and service effects</small></span><small>Calculated · T+{minute} min</small></div>
                  <div>
                    {secondaryConsequenceSummary.map((item) => (
                      <article key={item.kind}>
                        <span>{item.kind.replaceAll("-", " ")}</span>
                        <strong>{Math.round(item.maximum * 100)}%</strong>
                        <i><b style={{ width: `${Math.round(item.maximum * 100)}%` }} /></i>
                        <small>{item.count} affected model cells</small>
                      </article>
                    ))}
                  </div>
                </section>
                <section className={styles.riskSection}>
                  <div className={styles.sectionTitle}><span><b>Infrastructure dependencies</b><small>Hazard-to-road-to-critical-access service chain</small></span><button onClick={() => setCascadeOpen(true)}><Network size={13} /> Open graph</button></div>
                  <div className={styles.cascadeLine}>
                    <div className={styles.cascadeNode}><SelectedHazardIcon size={15} /><span>{selectedHazard.shortLabel}</span></div>
                    <i />
                    <div className={styles.cascadeNode}><Route size={15} /><span>Roads</span></div>
                    <i />
                    <div className={`${styles.cascadeNode} ${styles.cascadeCritical}`}><Hospital size={15} /><span>Access</span></div>
                  </div>
                </section>

                <section className={styles.riskSection}>
                  <div className={styles.sectionTitle}><span><b>Road impact</b><small>Open, restricted and closed links at this time</small></span><small>T+{minute} min</small></div>
                  <div className={styles.effectList}>
                    {roadEffects.map((impact) => {
                      const tone = impact.status === "closed" ? "red" : impact.status === "open" ? "blue" : "amber";
                      return <div key={impact.roadId}>
                        <span className={styles.eventTime}>T+{String(impact.peakMinute).padStart(2, "0")}</span>
                        <span><b>{impact.roadName}</b><small>{impact.status}</small></span>
                        <i className={styles[`event_${tone}`]} />
                      </div>
                    })}
                  </div>
                </section>

                <section className={styles.capacitySection}>
                  <div className={styles.sectionTitle}><span><b>Critical capacity</b><small>Projected hospital and shelter occupancy</small></span></div>
                  <div className={styles.capacityRow}><Hospital size={15} /><span><b>{hospitalImpact?.facilityName ?? "Hospital H-01"}</b><small>Projected emergency load</small></span><strong>{hospitalLoadPct}%</strong></div>
                  <MiniBar value={hospitalLoadPct} tone={hospitalLoadPct >= 80 ? "amber" : "green"} />
                  <div className={styles.capacityRow}><Warehouse size={15} /><span><b>{shelterImpact?.facilityName ?? "Shelter S-02"}</b><small>Projected occupancy</small></span><strong>{shelterLoadPct}%</strong></div>
                  <MiniBar value={shelterLoadPct} tone={shelterLoadPct >= 80 ? "amber" : "green"} />
                </section>
              </>
            )}

            {panelTab === "intelligence" && (
              <>
                <section className={styles.riskSection}>
                  <div className={styles.sectionTitle}><span><b>Operational assessments</b><small>Current access, facilities and population-support findings</small></span><StatusTag tone="amber">Modelled</StatusTag></div>
                  <div className={styles.agentList}>
                    {[
                      {
                        role: "Access state",
                        finding: `${impactSnapshot.summary.closedRoads} closed and ${impactSnapshot.summary.restrictedRoads} restricted road links at T+${impactSnapshot.selectedMinute} min.`,
                      },
                      {
                        role: "Critical facilities",
                        finding: `${impactSnapshot.summary.unavailableCriticalFacilities} unavailable and ${impactSnapshot.summary.degradedCriticalFacilities} degraded facilities.`,
                      },
                      {
                        role: "Population support",
                        finding: `${impactSnapshot.humanImpact.mobilityAssistanceEstimate.toLocaleString("en-IN")} people may require mobility assistance.`,
                      },
                    ].map((assessment) => (
                      <div key={assessment.role}>
                        <div className={styles.agentIcon}><Activity size={15} /></div>
                        <span><b>{assessment.role}</b><small>{assessment.finding}</small></span>
                        <strong>{averageConfidence}%</strong>
                      </div>
                    ))}
                  </div>
                </section>
                <section className={styles.evidenceSummary}>
                  <div className={styles.sectionTitle}><span><b>Data classification</b><small>Separates imported context from calculated estimates</small></span></div>
                  <div><StatusTag tone="green">Imported</StatusTag><span>Open map, terrain and weather context</span></div>
                  <div><StatusTag tone="blue">Simulated</StatusTag><span>Flood depth, impacts and response</span></div>
                  <div><StatusTag tone="neutral">Estimated</StatusTag><span>Population and facility capacity</span></div>
                </section>
              </>
            )}

            {panelTab === "resources" && (
              <section className={styles.resourceList}>
                <div className={styles.sectionTitle}><span><b>Response resources</b><small>Assigned transport, role, dispatch and arrival timing</small></span></div>
                {evacuationVisible && evacuationPlan.resourceAssignments.length ? (
                  evacuationPlan.resourceAssignments.slice(0, 8).map((assignment) => (
                    <div key={`${assignment.unitId}-${assignment.stageId}`}>
                      <span className={styles.resourceIcon}><Siren size={16} /></span>
                      <span>
                        <b>{assignment.unitName}</b>
                        <small>{assignment.role} · dispatch T+{assignment.dispatchMinute} · arrival T+{assignment.estimatedArrivalMinute}</small>
                      </span>
                      <StatusTag tone="blue">{assignment.assignedPopulationCapacity.toLocaleString("en-IN")} CAP</StatusTag>
                    </div>
                  ))
                ) : (
                  <div>
                    <span className={styles.resourceIcon}><Users size={16} /></span>
                    <span><b>No units assigned</b><small>Generate an evacuation plan to stage available transport and response capacity.</small></span>
                    <StatusTag tone="neutral">PENDING</StatusTag>
                  </div>
                )}
              </section>
            )}
          </div>

          <div className={styles.responseAction}>
            <div>
              <span>Evacuation planning</span>
              <small>Routes · resources · capacity · constraints</small>
            </div>
            <div className={styles.responseButtons}>
              <button type="button" onClick={explainEvacuationProcedure}>
                <MessageSquareText size={15} /> Explain procedure
              </button>
              <button type="button" onClick={generatePlan} disabled={planState === "calculating"}>
                {planState === "calculating" ? <RefreshCw size={16} className={styles.spin} /> : <Route size={16} />}
                Generate evacuation plan
              </button>
            </div>
          </div>
        </aside>
      </main>

      <button className={styles.copilotLauncher} onClick={() => setCopilotOpen(true)}>
        <Command size={16} />
        Decision brief
        <kbd>Ctrl B</kbd>
      </button>

      {searchOpen ? (
        <div className={styles.modalBackdrop}>
          <button className={styles.modalDismiss} onClick={() => setSearchOpen(false)} aria-label="Close world search" />
          <section className={styles.searchPanel} role="dialog" aria-modal="true" aria-label="Search world locations">
            <div className={styles.modalHeader}>
              <div><span>Location search</span><strong>Select an operational area</strong></div>
              <StatusTag tone="green">Open map data</StatusTag>
              <button onClick={() => setSearchOpen(false)} aria-label="Close world search"><X size={17} /></button>
            </div>
            <form className={styles.worldSearchForm} onSubmit={(event) => { event.preventDefault(); void runSearch(); }}>
              <Search size={17} />
              <input
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  setSearchDataClass("IMPORTED");
                  setSearchFeedback(null);
                }}
                placeholder="City, district, landmark or coordinates"
                aria-label="World location search"
              />
              <button disabled={searching || searchQuery.trim().length < 2}>
                {searching ? <RefreshCw size={15} className={styles.spin} /> : "Search"}
              </button>
            </form>
            <div className={styles.searchSectionLabel}>Saved locations</div>
            <div className={styles.quickLocations}>
              {QUICK_LOCATIONS.map((location) => (
                <button key={location.id} onClick={() => focusLocation(location)}>
                  <Crosshair size={14} />
                  <span><b>{location.name}</b><small>{location.region}</small></span>
                  <StatusTag tone={location.fidelity === "EIT SITE MODEL" ? "green" : "amber"}>{location.fidelity === "EIT SITE MODEL" ? "MAP REF" : "GLOBAL"}</StatusTag>
                </button>
              ))}
            </div>
            {searchResults.length > 0 ? (
              <div className={styles.searchResults}>
                <div className={styles.searchSectionLabel}>{searchDataClass === "REFERENCE" ? "Offline reference results" : "OpenStreetMap results · imported"}</div>
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    onClick={() => focusLocation({
                      id: `osm-${result.id}`,
                      name: result.label.split(",")[0],
                      region: result.label.split(",").slice(1, 3).join(",").trim() || result.type,
                      latitude: result.latitude,
                      longitude: result.longitude,
                      fidelity: "GLOBAL PROTOTYPE",
                    })}
                  >
                    <MapPinned size={15} />
                    <span><b>{result.label.split(",")[0]}</b><small>{result.label}</small></span>
                    <ArrowUpRight size={14} />
                  </button>
                ))}
              </div>
            ) : null}
            {searchFeedback ? <div className={styles.searchFeedback} role="status">{searchFeedback}</div> : null}
            <div className={styles.searchFoot}>
              <Database size={13} /> Search: {searchDataClass === "REFERENCE" ? "AEGIS offline reference gazetteer (live place provider unavailable)." : "OpenStreetMap Nominatim."} Place an origin, safe point, hazard source, or area directly with the map tools.
            </div>
          </section>
        </div>
      ) : null}

      {comparisonOpen ? (
        <div className={styles.modalBackdrop}>
          <button className={styles.modalDismiss} onClick={() => setComparisonOpen(false)} aria-label="Close scenario comparison" />
          <section className={styles.comparisonPanel} role="dialog" aria-modal="true" aria-label="Scenario comparison">
            <div className={styles.modalHeader}>
              <div><span>Scenario comparison</span><strong>{selectedHazard.label} · {activeLocation.name}</strong></div>
              <StatusTag tone="blue">{decisionExecution.mode === "hosted-model" ? decisionExecution.provider : "Local deterministic fallback"}</StatusTag>
              <button onClick={() => setComparisonOpen(false)} aria-label="Close scenario comparison"><X size={17} /></button>
            </div>
            <div className={styles.comparisonModeBar} role="group" aria-label="Comparison display mode">
              {(["cards", "side-by-side", "swipe"] as const).map((mode) => (
                <button type="button" key={mode} aria-pressed={comparisonMode === mode} onClick={() => setComparisonMode(mode)}>{mode.replaceAll("-", " ")}</button>
              ))}
              {comparisonMode === "swipe" ? (
                <label><span>Contained</span><input aria-label="Comparison swipe position" type="range" min="10" max="90" value={comparisonSwipe} onChange={(event) => setComparisonSwipe(Number(event.target.value))} /><span>Severe</span></label>
              ) : null}
            </div>
            <div className={styles.comparisonGrid} data-mode={comparisonMode} style={{ "--comparison-swipe": `${comparisonSwipe}%` } as CSSProperties}>
              {comparisonRuns.map((branch) => (
                <article key={branch.id} className={branch.id === "baseline" ? styles.comparisonBaseline : ""}>
                  <div><span>{branch.label.toUpperCase()}</span><StatusTag tone={branch.id === "severe" ? "red" : branch.id === "baseline" ? "blue" : "green"}>{branch.control.value}</StatusTag></div>
                  <strong>{branch.run.result.metrics.peakExposedPopulation.toLocaleString("en-IN")}</strong>
                  <small>people in exposure envelope</small>
                  <dl>
                    <div><dt>{hazardMetricLabel(coreHazard)}</dt><dd>{branch.run.result.metrics.maximumHazardValue.toLocaleString("en-IN", { maximumFractionDigits: 2 })} {branch.run.result.metrics.maximumHazardUnit}</dd></div>
                    <div><dt>Roads unavailable</dt><dd>{branch.run.result.metrics.peakUnavailableRoads}</dd></div>
                    <div><dt>Evacuation coverage</dt><dd>{Math.round(branch.run.evacuationPlan?.after.coveragePct ?? 0)}%</dd></div>
                    <div><dt>Affected area</dt><dd>{branch.run.result.metrics.peakAffectedAreaSqKm.toFixed(2)} km²</dd></div>
                  </dl>
                  <button onClick={() => {
                    setScenarioStrength(branch.strength);
                    setComparisonOpen(false);
                    setMinute(0);
                    setPlanState("idle");
                    setEvacuationVisible(false);
                  }}>Apply branch</button>
                </article>
              ))}
            </div>
            <div className={styles.comparisonFoot}>
              <Info size={14} /> Same deterministic seed; only the displayed scenario driver changes. Results are simulated prototype estimates, not forecasts.
            </div>
          </section>
        </div>
      ) : null}

      {cascadeOpen ? (
        <div className={styles.modalBackdrop}>
          <button className={styles.modalDismiss} onClick={() => setCascadeOpen(false)} aria-label="Close cascade graph" />
          <section className={styles.cascadePanel} role="dialog" aria-modal="true" aria-label="Infrastructure cascade graph">
            <div className={styles.modalHeader}>
              <div><span>Infrastructure dependency assessment</span><strong>{activeLocation.name} · T+{minute} minutes</strong></div>
              <StatusTag tone="red">{currentFrame.severity.toUpperCase()}</StatusTag>
              <button onClick={() => setCascadeOpen(false)} aria-label="Close cascade graph"><X size={17} /></button>
            </div>
            <div className={styles.cascadeCanvas}>
              <div className={styles.cascadeHero}>
                <SelectedHazardIcon size={24} />
                <span>Primary hazard</span>
                <strong>{selectedHazard.label}</strong>
                <small>{demonstration.result.metrics.maximumHazardValue.toFixed(2)} {demonstration.result.metrics.maximumHazardUnit}</small>
              </div>
              <div className={styles.cascadeFlowLarge}>
                <article><Route size={20} /><span>ACCESS</span><strong>{roadAccessPct}%</strong><small>{demonstration.result.metrics.peakUnavailableRoads} links unavailable</small></article>
                <i />
                <article><Zap size={20} /><span>UTILITIES</span><strong>{Math.round((1 - Math.min(0.8, demonstration.result.metrics.peakUnavailableRoads / 18)) * 100)}%</strong><small>service continuity estimate</small></article>
                <i />
                <article><Hospital size={20} /><span>HEALTH</span><strong>{hospitalLoadPct}%</strong><small>projected emergency load</small></article>
                <i />
                <article><Warehouse size={20} /><span>SHELTER</span><strong>{shelterLoadPct}%</strong><small>projected occupancy</small></article>
              </div>
            </div>
            <div className={styles.cascadeDetailGrid}>
              <article><span>FIRST FAILURE</span><strong>{roadEffects[0]?.roadName ?? "Campus access road"}</strong><small>T+{roadEffects[0]?.peakMinute ?? minute} min · {roadEffects[0]?.status ?? "restricted"}</small></article>
              <article><span>DOMINO EFFECT</span><strong>Ambulance travel time</strong><small>Access loss propagates into medical response delay</small></article>
              <article><span>BEST SCREENED INTERVENTION</span><strong>{interventionRanking.ranked[0]?.title ?? "No intervention screened"}</strong><small>{interventionRanking.ranked[0]?.benefitScore === null ? "Planning advisory · field approval required" : `${Math.round((interventionRanking.ranked[0]?.benefitScore ?? 0) * 100)}% comparative benefit score · ${interventionRanking.ranked[0]?.description}`}</small></article>
            </div>
            <div className={styles.comparisonFoot}>
              <Info size={14} /> {interventionRanking.notice}
            </div>
          </section>
        </div>
      ) : null}

      {liveNoticeOpen ? (
        <div data-floating-panel="live-intelligence" className={panelClassName(styles.liveNotice, newsPanel)} style={newsPanel.style} role="dialog" aria-label="Live disaster intelligence">
          <button
            type="button"
            className={styles.dragHandle}
            aria-label="Move live intelligence panel"
            title="Drag to move · resize from the lower corner"
            {...newsPanel.dragHandleProps}
          >
            <GripHorizontal size={18} />
          </button>
          <div className={styles.liveNoticeTop}>
            <div className={styles.newsSignal} data-live={headlineIsLive ? "true" : "false"}><Radio size={15} /><i /></div>
            <div><span>{liveRefreshing ? "Refreshing incident feeds" : liveChangeCount ? `${liveChangeCount} changes since last refresh` : headlineIsLive ? "Live source-labelled incident" : headlineIncident ? "Archived source-labelled context" : "Incident intelligence"}</span><strong>{headlineIncident?.title ?? "No active incident selected"}</strong></div>
            <PanelControls panel={newsPanel} label="live intelligence" onClose={() => setLiveNoticeOpen(false)} />
          </div>
          <div className={styles.liveNoticeVisual}>
            <div className={styles.satelliteScan}>
              <Radio size={35} />
              <span>{headlineIsLive ? "Live incident source scan" : "Source-labelled incident context"}</span>
              <small>Open source media only when a matching publisher asset is returned. No unrelated footage is substituted.</small>
            </div>
            <div className={styles.newsStats}>
              {(headlineIncident?.impactMetrics ?? []).slice(0, 3).map((metric) => (
                <div key={metric.key}><b>{String(metric.value)}{metric.unit ? ` ${metric.unit}` : ""}</b><span>{metric.label}</span></div>
              ))}
              {!headlineIncident?.impactMetrics.length ? <div><b>—</b><span>No source-confirmed impact totals</span></div> : null}
            </div>
          </div>
          <p>{headlineIncident?.summary ?? "Connected providers have not returned a current incident brief. Provider readiness and failures remain visible."}</p>
          {(liveIntelligence?.incidents.length ?? 0) > 0 ? (
            <div className={styles.liveSignalList}>
              <span>Recent incident reports</span>
              {liveIntelligence?.incidents.slice(0, 3).map((incident) => (
                <button
                  key={incident.id}
                  disabled={!incident.location.coordinates}
                  onClick={() => {
                    focusIncidentOnWorld(incident);
                    setLiveNoticeOpen(false);
                  }}
                >
                  <i className={styles[`signal_${incident.severity === "medium" ? "amber" : incident.severity === "low" ? "blue" : "red"}`]} />
                  <span><b>{incident.title}</b><small>{incident.provenance.sourceName} · {incident.category}</small></span>
                  <ArrowUpRight size={12} />
                </button>
              ))}
            </div>
          ) : null}
          <div className={styles.liveNoticeSources}>
            <StatusTag tone={headlineIsLive ? "red" : "neutral"}>{headlineIsLive ? "Live source" : headlineIncident ? "Archived context" : "No report"}</StatusTag>
            <span>{headlineIncident ? `${headlineIncident.provenance.sourceName} · ${headlineIncident.observedAt ?? "time unavailable"}` : "No report is being presented as live"}</span>
          </div>
          <div className={styles.liveNoticeActions}>
            <button type="button" disabled={liveRefreshing} onClick={() => setLiveRefreshNonce((value) => value + 1)}>
              <RefreshCw size={14} className={liveRefreshing ? styles.spin : ""} /> Refresh feeds
            </button>
            <button type="button" disabled={!headlineIncident?.location.coordinates} onClick={() => {
              if (!headlineIncident) return;
              focusIncidentOnWorld(headlineIncident);
              setLiveNoticeOpen(false);
            }}><MapPinned size={14} /> Focus on map</button>
            <button type="button" disabled={!headlineIncident?.location.coordinates} onClick={() => {
              const coordinate = headlineIncident?.location.coordinates;
              if (!coordinate || !headlineIncident) return;
              const nextHazard = hazardFromIncidentCategory(headlineIncident.category);
              setHazard(nextHazard);
              setScenarioName(`${headlineIncident.title} planning scenario`);
              setViewMode("simulate");
              focusLocation({
                id: `scenario-${headlineIncident.id}`,
                name: headlineIncident.location.name || headlineIncident.title,
                region: `${headlineIncident.provenance.sourceName} · imported incident context`,
                latitude: coordinate.latitude,
                longitude: coordinate.longitude,
                fidelity: "GLOBAL PROTOTYPE",
              });
              setSourceIncident({
                id: headlineIncident.id,
                title: headlineIncident.title,
                provider: headlineIncident.provenance.sourceName,
                observedAt: headlineIncident.observedAt,
              });
              setLiveNoticeOpen(false);
              recordAudit("Incident converted to scenario", `${headlineIncident.title} · ${nextHazard}`, "imported-context");
            }}><Boxes size={14} /> Create scenario</button>
            <button type="button" onClick={() => setLiveMediaOpen(true)}>
              <Video size={14} /> View source media
            </button>
          </div>

        </div>
      ) : null}

      {selectionWorkflowVisible && selectionWorkflowAssessment ? (
        <SelectionWorkflowCard
          assessment={selectionWorkflowAssessment}
          onClear={clearOperatorSelection}
          onDismiss={() => setSelectionWorkflowVisible(false)}
          onOpenResponse={() => {
            setViewMode("respond");
            setActiveNav("incident");
            setPanelTab("resources");
            setRightPanelOpen(true);
            setEvacuationVisible(true);
            setSelectionWorkflowVisible(false);
          }}
        />
      ) : null}

      <LiveMediaDialog
        open={liveMediaOpen}
        onClose={() => setLiveMediaOpen(false)}
        incident={headlineIncident}
        media={liveIntelligence?.media}
      />

      <Suspense fallback={null}>
      {commandPaletteOpen ? (
        <CommandPalette actions={commandActions} onClose={() => setCommandPaletteOpen(false)} />
      ) : null}

      {workspaceOpen ? (
        <WorkspaceManagerPanel
          scenarioName={scenarioName}
          onScenarioNameChange={setScenarioName}
          seed={demonstration.scenario.seed}
          revision={currentWorkspaceRevision}
          saved={savedWorkspaces}
          bookmarks={bookmarks}
          annotations={annotations}
          currentLayout={workspaceLayout}
          onSave={saveCurrentWorkspace}
          onLoad={loadWorkspace}
          onDelete={deleteWorkspace}
          onApplyPreset={applyScenarioPreset}
          onLayout={applyWorkspaceLayout}
          onBookmark={addCurrentBookmark}
          onOpenBookmark={(bookmark) => {
            focusLocation({
              ...bookmark.location,
              fidelity: bookmark.location.fidelity === "EIT SITE MODEL" ? "EIT SITE MODEL" : "GLOBAL PROTOTYPE",
            });
            setWorkspaceOpen(false);
          }}
          onRemoveBookmark={removeSavedBookmark}
          onAddAnnotation={addMapAnnotation}
          onRemoveAnnotation={(annotation) => setAnnotations((current) => current.filter((item) => item.id !== annotation.id))}
          onExportJson={exportWorkspaceJson}
          onExportCsv={exportVisibleCsv}
          onPrint={printIncidentSummary}
          campusDatasetLabel={activeCampusDataset?.label ?? "OSM prototype"}
          campusImportStatus={campusImportStatus}
          onImportCampusDataset={importCampusDataset}
          onClearCampusDataset={clearCampusDataset}
          onClose={() => setWorkspaceOpen(false)}
        />
      ) : null}

      {recoveryOpen ? <RecoveryPanel snapshot={impactSnapshot} onClose={() => setRecoveryOpen(false)} /> : null}
      {alertsOpen ? <AlertPanel alerts={productAlerts} onClose={() => setAlertsOpen(false)} /> : null}
      {auditOpen ? <AuditPanel receipts={decisionReceipts} audit={auditHistory} onClose={() => setAuditOpen(false)} /> : null}
      </Suspense>

      {copilotOpen ? (
        <div className={styles.copilotBackdrop}>
          <button className={styles.modalDismiss} onClick={() => setCopilotOpen(false)} aria-label="Close AEGIS decision brief" />
          <section className={styles.copilot} role="dialog" aria-modal="true" aria-label="AEGIS decision brief">
            <div className={styles.copilotHeader}>
              <div className={styles.copilotMark}><MessageSquareText size={18} /></div>
              <div><span>Decision support</span><strong>Current scenario and impact data</strong></div>
              <StatusTag tone="blue">Calculated</StatusTag>
              <button onClick={() => setCopilotOpen(false)} aria-label="Close decision brief"><X size={17} /></button>
            </div>
            <div className={styles.copilotBody}>
              <div className={styles.copilotQuestion}>
                <span>OPERATOR</span>
                <p>{question}</p>
              </div>
              <div className={styles.copilotAnswer}>
                <div className={styles.answerSection}><span>SUMMARY</span><p>{displayedDecision.summary}</p></div>
                {displayedDecisionNarrative ? (
                  <div className={styles.modelNarrative}>
                    <span>{automaticDecisionActive ? "Local deterministic assessment" : "Model-authored explanation"} · human review required</span>
                    <p>{displayedDecisionNarrative}</p>
                    <small>{decisionExecution.provider} · {decisionExecution.model}</small>
                  </div>
                ) : null}
                <div className={styles.answerEvidence}><span>Supporting evidence</span>{displayedDecision.evidence.map((item) => <p key={item}><Check size={12} />{item}</p>)}</div>
                {question.toLowerCase().includes("evacuat") ? (
                  <div className={styles.evacuationProcedure}>
                    <div><span>Current evacuation procedure</span><StatusTag tone="blue">Calculated plan</StatusTag></div>
                    <ol>{evacuationProcedure.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    <p><Info size={13} /> {evacuationProcedure.warning}</p>
                    <small>{evacuationProcedure.source} · {evacuationProcedure.remaining.toLocaleString("en-IN")} people remain exposed in the current model state.</small>
                  </div>
                ) : null}
                <div className={styles.answerSection}><span>PREDICTION</span><p>{displayedDecision.prediction}</p></div>
                <div className={styles.recommendationBlock}>
                  <div><span>RECOMMENDATION</span><StatusTag tone="green">{Math.round(displayedDecision.confidence * 100)}% CONFIDENCE</StatusTag></div>
                  <p>{displayedDecision.recommendation}</p>
                  <small>Advisory only · operator approval required</small>
                </div>
              </div>
            </div>
            <div className={styles.copilotPrompts}>
              {["Explain evacuation procedure", "What if Bridge B fails?", "Prioritize hospitals", "Explain the latest change"].map((prompt) => (
                <button key={prompt} onClick={() => {
                  setQuestion(prompt);
                  if (prompt === "Explain evacuation procedure") void askCopilot(prompt);
                }}>{prompt}</button>
              ))}
            </div>
            <form className={styles.copilotInput} onSubmit={(event) => { event.preventDefault(); void askCopilot(); }}>
              <input value={question} onChange={(event) => setQuestion(event.target.value)} aria-label="Ask AEGIS" />
              <button disabled={asking} aria-label="Run decision analysis">{asking ? <RefreshCw size={16} className={styles.spin} /> : <ArrowUpRight size={16} />}</button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
