"use client";

import {
  Bell,
  BellRing,
  ChevronLeft,
  CircleAlert,
  Crosshair,
  Database,
  LoaderCircle,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  Wifi,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IncidentCategory, LiveIncident } from "@/lib/live/types";
import type { AutomationRegion, AutomationReceipt } from "@/lib/automation/types";
import styles from "./AutomationConsole.module.css";

type AutomationMode = "live" | "demo";
type AutomationPolicy = {
  requireOfficialSource: boolean;
  maxAgeMinutes: number;
  maxRetrievalAgeMinutes: number;
  maxRegions?: number;
  maxIncidents?: number;
};
type AutomationCapabilities = {
  scheduledPolling?: boolean;
  browserNotifications?: boolean;
  serverDelivery?: boolean;
  deterministicEvaluation?: boolean;
  [key: string]: unknown;
};
type AutomationBootstrap = {
  capabilities?: AutomationCapabilities;
  defaultRegions?: AutomationRegion[];
  defaultPolicy?: Partial<AutomationPolicy>;
};
type MatchedIncident = {
  incident: LiveIncident;
  distanceKm?: number;
  eligible: boolean;
  reason: string;
};
type RegionEvaluation = {
  regionId: string;
  regionName: string;
  status: "watch" | "attention" | "no-current-match" | "degraded" | "paused" | string;
  matchedIncidents: MatchedIncident[];
  proposedAlerts: AutomationAlert[];
  suppressedCount: number;
};
type AutomationAlert = {
  id: string;
  regionId: string;
  regionName: string;
  incidentId: string;
  title: string;
  severity: string;
  category: string;
  summary: string;
  sourceUrl?: string;
  sourceName?: string;
  createdAt: string;
  expiresAt?: string;
  kind: "new" | "escalation" | "update" | "reminder" | string;
  humanReviewRequired: boolean;
  delivery: "not-sent" | string;
  mode: "live" | "demo" | string;
};
type AutomationSummary = {
  regionCount?: number;
  enabledRegionCount?: number;
  observedIncidentCount?: number;
  simulatedIncidentCount?: number;
  eligibleIncidentCount?: number;
  proposedAlertCount?: number;
  suppressedAlertCount?: number;
  unlocatedIncidentCount?: number;
  [key: string]: number | undefined;
};
type AutomationEvaluation = {
  evaluatedAt: string;
  mode: AutomationMode;
  regions: RegionEvaluation[];
  alerts: AutomationAlert[];
  receipts?: AutomationReceipt[];
  summary?: AutomationSummary;
  safetyNotice?: string;
  sources?: Array<{ name?: string; status?: string; retrievedAt?: string; recordCount?: number }>;
};
type NotificationLogEntry = {
  id: string;
  title: string;
  detail: string;
  createdAt: string;
  delivery: "browser" | "preview" | "blocked";
};

const STORAGE_WATCHES = "aegis.automation.watches.v1";
const STORAGE_LOG = "aegis.automation.notification-log.v1";
const STORAGE_NOTIFIED = "aegis.automation.notified.v1";
const STORAGE_RECEIPTS = "aegis.automation.receipts.v1";
const HAZARDS: IncidentCategory[] = [
  "flood",
  "earthquake",
  "wildfire",
  "cyclone",
  "severe-storm",
  "volcano",
  "landslide",
  "extreme-temperature",
  "industrial",
];
const HAZARD_LABELS: Record<string, string> = {
  flood: "Flood",
  earthquake: "Earthquake",
  wildfire: "Wildfire",
  cyclone: "Cyclone",
  "severe-storm": "Severe storm",
  volcano: "Volcano",
  landslide: "Landslide",
  "extreme-temperature": "Extreme heat/cold",
  industrial: "Industrial",
};
const DEFAULT_POLICY: AutomationPolicy = {
  requireOfficialSource: true,
  maxAgeMinutes: 24 * 60,
  maxRetrievalAgeMinutes: 180,
};

function readStoredArray<T>(key: string, predicate: (value: unknown) => value is T): T[] {
  if (typeof window === "undefined") return [];
  try {
    const value = JSON.parse(window.localStorage.getItem(key) ?? "[]") as unknown;
    return Array.isArray(value) ? value.filter(predicate) : [];
  } catch {
    return [];
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStoredWatch(value: unknown): value is AutomationRegion {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.name !== "string" || typeof value.enabled !== "boolean") return false;
  if (!Array.isArray(value.hazards) || typeof value.minimumSeverity !== "string" || typeof value.maxAgeMinutes !== "number" || typeof value.cooldownMinutes !== "number") return false;
  const geometry = value.geometry;
  if (!isRecord(geometry) || (geometry.kind !== "circle" && geometry.kind !== "bounds")) return false;
  if (geometry.kind === "circle") {
    const center = geometry.center;
    return isRecord(center) && typeof center.latitude === "number" && typeof center.longitude === "number" && typeof geometry.radiusKm === "number";
  }
  return [geometry.west, geometry.south, geometry.east, geometry.north].every((coordinate) => typeof coordinate === "number");
}

function isStoredLog(value: unknown): value is NotificationLogEntry {
  return isRecord(value) && typeof value.id === "string" && typeof value.title === "string" &&
    typeof value.detail === "string" && typeof value.createdAt === "string" &&
    (value.delivery === "browser" || value.delivery === "preview" || value.delivery === "blocked");
}

function isStoredReceipt(value: unknown): value is AutomationReceipt {
  return isRecord(value) && typeof value.dedupeKey === "string" && typeof value.regionId === "string" &&
    typeof value.incidentId === "string" && typeof value.sourceId === "string" && typeof value.fingerprint === "string" &&
    typeof value.severity === "string" && typeof value.firstSeenAt === "string" && typeof value.lastSeenAt === "string";
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function formatTime(value?: string): string {
  if (!value) return "—";
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(timestamp);
}

function formatAge(value?: string): string {
  if (!value) return "age unknown";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(value)) / 60_000));
  if (!Number.isFinite(minutes)) return "age unknown";
  return minutes < 1 ? "<1 min old" : `${minutes} min old`;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "region";
}

function regionCoordinates(region: AutomationRegion): string {
  if (region.geometry.kind === "circle") {
    return `${region.geometry.center.latitude.toFixed(3)}°, ${region.geometry.center.longitude.toFixed(3)}° · ${region.geometry.radiusKm} km radius`;
  }
  return `${region.geometry.south.toFixed(2)}…${region.geometry.north.toFixed(2)}° N · ${region.geometry.west.toFixed(2)}…${region.geometry.east.toFixed(2)}° E`;
}

function statusLabel(status: RegionEvaluation["status"]): string {
  if (status === "attention") return "ATTENTION";
  if (status === "no-current-match") return "NO MATCH IN FEED";
  if (status === "degraded") return "DEGRADED SOURCE";
  if (status === "paused") return "PAUSED";
  return "WATCHING";
}

function statusClass(status: RegionEvaluation["status"]): string {
  if (status === "attention") return styles.red;
  if (status === "no-current-match") return styles.gray;
  if (status === "degraded") return styles.amber;
  return styles.gray;
}

function freshnessClass(band?: string): string {
  if (band === "live" || band === "near-real-time") return styles.fresh;
  if (band === "recent") return styles.recent;
  return styles.old;
}

export function AutomationConsole() {
  const [watches, setWatches] = useState<AutomationRegion[]>([]);
  const [policy, setPolicy] = useState<AutomationPolicy>(DEFAULT_POLICY);
  const [capabilities, setCapabilities] = useState<AutomationCapabilities>({});
  const [mode, setMode] = useState<AutomationMode>("live");
  const [evaluation, setEvaluation] = useState<AutomationEvaluation | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [running, setRunning] = useState(false);
  const [autoMonitor, setAutoMonitor] = useState(false);
  const [intervalMinutes, setIntervalMinutes] = useState(5);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | "unsupported">("default");
  const [notificationLog, setNotificationLog] = useState<NotificationLogEntry[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState<{ text: string; error?: boolean } | null>(null);
  const [expandedRegion, setExpandedRegion] = useState<string | null>(null);
  const [newRegionOpen, setNewRegionOpen] = useState(false);
  const [newRegion, setNewRegion] = useState({ name: "", latitude: "28.39", longitude: "77.31", radiusKm: "5" });
  const [newHazards, setNewHazards] = useState<IncidentCategory[]>(["flood"]);
  const [newSeverity, setNewSeverity] = useState<AutomationRegion["minimumSeverity"]>("medium");
  const [newEnabled, setNewEnabled] = useState(true);
  const hasBootstrapWatches = useRef(false);
  const notifiedIds = useRef<Set<string>>(new Set());
  const receiptsRef = useRef<AutomationEvaluation["receipts"]>([]);

  const enabledWatches = useMemo(() => watches.filter((watch) => watch.enabled), [watches]);

  useEffect(() => {
    const hydration = window.setTimeout(() => {
      const storedWatches = readStoredArray(STORAGE_WATCHES, isStoredWatch).slice(0, 32);
      const storedLog = readStoredArray(STORAGE_LOG, isStoredLog).slice(0, 30);
      const storedNotified = readStoredArray(STORAGE_NOTIFIED, isString).slice(-100);
      const storedReceipts = readStoredArray(STORAGE_RECEIPTS, isStoredReceipt).slice(-512);
      setWatches(storedWatches);
      setNotificationLog(storedLog);
      notifiedIds.current = new Set(storedNotified);
      receiptsRef.current = storedReceipts;
      // An explicit stored empty array means the operator intentionally cleared
      // defaults; do not silently restore them on the next reload.
      try { hasBootstrapWatches.current = window.localStorage.getItem(STORAGE_WATCHES) !== null; } catch { hasBootstrapWatches.current = storedWatches.length > 0; }
      setNotificationPermission("Notification" in window ? window.Notification.permission : "unsupported");
      setStorageReady(true);
    }, 0);
    return () => window.clearTimeout(hydration);
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => {
      void fetch("/api/automation", { cache: "no-store" })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Automation configuration returned HTTP ${response.status}.`);
          return await response.json() as AutomationBootstrap;
        })
        .then((payload) => {
          setCapabilities(payload.capabilities ?? {});
          setPolicy((current) => ({ ...current, ...payload.defaultPolicy }));
          if (!hasBootstrapWatches.current && payload.defaultRegions?.length) {
            setWatches(payload.defaultRegions);
            hasBootstrapWatches.current = true;
          }
          setNotice(null);
        })
        .catch(() => {
          setNotice({ text: "Automation service is not reachable. Browser-local watches remain available; run checks when the API is online.", error: true });
        })
        .finally(() => setLoadingBootstrap(false));
    }, 0);
    return () => window.clearTimeout(initial);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    try { window.localStorage.setItem(STORAGE_WATCHES, JSON.stringify(watches)); } catch { /* storage is optional */ }
  }, [storageReady, watches]);

  useEffect(() => {
    if (!storageReady) return;
    try { window.localStorage.setItem(STORAGE_LOG, JSON.stringify(notificationLog.slice(0, 30))); } catch { /* storage is optional */ }
  }, [notificationLog, storageReady]);

  const addNotificationLog = useCallback((entry: NotificationLogEntry) => {
    setNotificationLog((current) => [entry, ...current.filter((item) => item.id !== entry.id)].slice(0, 30));
  }, []);

  const notifyAlerts = useCallback((alerts: AutomationAlert[]) => {
    if (!alerts.length) return;
    const canNotify = typeof window !== "undefined" && "Notification" in window && window.Notification.permission === "granted";
    for (const alert of alerts.slice(0, 5)) {
      if (notifiedIds.current.has(alert.id)) continue;
      notifiedIds.current.add(alert.id);
      addNotificationLog({
        id: alert.id,
        title: alert.title,
        detail: `${alert.regionName} · ${alert.severity.toUpperCase()} · ${alert.delivery}`,
        createdAt: new Date().toISOString(),
        delivery: canNotify ? "browser" : "preview",
      });
      if (canNotify) {
        try {
          new window.Notification(`AEGIS · ${alert.severity.toUpperCase()}`, {
            body: `${alert.title}\n${alert.regionName} · observed source: ${alert.sourceName ?? "source unavailable"}`,
            tag: `aegis-alert-${alert.id}`,
          });
        } catch {
          // Browser notification failures should never stop the evaluation.
        }
      }
    }
    try { window.localStorage.setItem(STORAGE_NOTIFIED, JSON.stringify([...notifiedIds.current].slice(-100))); } catch { /* optional */ }
  }, [addNotificationLog]);

  const runEvaluation = useCallback(async (quiet = false) => {
    if (!enabledWatches.length) {
      setNotice({ text: "Enable at least one region watch before running an evaluation.", error: true });
      return;
    }
    setRunning(true);
    if (!quiet) setNotice(null);
    try {
      const response = await fetch("/api/automation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({
          mode,
          regions: watches,
          policy,
          previousReceipts: receiptsRef.current,
        }),
      });
      if (!response.ok) throw new Error(`Evaluation returned HTTP ${response.status}.`);
      const payload = await response.json() as AutomationEvaluation;
      receiptsRef.current = payload.receipts ?? [];
      if (storageReady) {
        try { window.localStorage.setItem(STORAGE_RECEIPTS, JSON.stringify(receiptsRef.current.slice(-512))); } catch { /* storage is optional */ }
      }
      setEvaluation(payload);
      notifyAlerts(payload.alerts ?? []);
      if (!quiet) setNotice({ text: `${payload.summary?.proposedAlertCount ?? payload.alerts?.length ?? 0} alert proposal(s) generated. No external notification was sent.` });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Evaluation could not be completed.", error: true });
    } finally {
      setRunning(false);
    }
  }, [enabledWatches.length, mode, notifyAlerts, policy, storageReady, watches]);

  useEffect(() => {
    if (!autoMonitor) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void runEvaluation(true);
    }, intervalMinutes * 60_000);
    return () => window.clearInterval(timer);
  }, [autoMonitor, intervalMinutes, runEvaluation]);

  const requestNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) {
      setNotificationPermission("unsupported");
      setNotice({ text: "This browser does not support notifications. The in-page log still records proposed alerts.", error: true });
      return;
    }
    const permission = await window.Notification.requestPermission();
    setNotificationPermission(permission);
    setNotice({ text: permission === "granted" ? "Browser notifications enabled for this tab/device." : "Browser notifications remain disabled; alerts will stay in the in-page preview." });
  }, []);

  const updateWatch = useCallback((id: string, update: Partial<AutomationRegion>) => {
    setWatches((current) => current.map((watch) => watch.id === id ? { ...watch, ...update } : watch));
  }, []);

  const deleteWatch = useCallback((id: string) => {
    setWatches((current) => current.filter((watch) => watch.id !== id));
    setEvaluation(null);
  }, []);

  const addWatch = useCallback(() => {
    const name = newRegion.name.trim();
    const latitude = Number(newRegion.latitude);
    const longitude = Number(newRegion.longitude);
    const radiusKm = Number(newRegion.radiusKm);
    if (name.length < 2 || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 2_000) {
      setNotice({ text: "Enter a name, valid latitude/longitude and a radius between 0 and 2,000 km.", error: true });
      return;
    }
    const watch: AutomationRegion = {
      id: `${slug(name)}-${Date.now().toString(36)}`,
      name,
      enabled: newEnabled,
      geometry: { kind: "circle", center: { latitude, longitude }, radiusKm },
      hazards: newHazards.length ? newHazards : ["flood"],
      minimumSeverity: newSeverity,
      maxAgeMinutes: policy.maxAgeMinutes,
      cooldownMinutes: 60,
    };
    setWatches((current) => [...current, watch]);
    setNewRegion({ name: "", latitude: "28.39", longitude: "77.31", radiusKm: "5" });
    setNewRegionOpen(false);
    setNotice({ text: `${name} added as a browser-local region watch.` });
  }, [newEnabled, newHazards, newRegion, newSeverity, policy.maxAgeMinutes]);

  const summary = evaluation?.summary ?? {};
  const sourceCount = evaluation?.sources?.length ?? 0;
  const matchedIncidentCount = evaluation?.regions.reduce(
    (total, region) => total + region.matchedIncidents.length,
    0,
  );

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true"><ShieldCheck size={18} /></span>
          <div className={styles.identityText}><strong>AEGIS</strong><span>Automation &amp; alert policy</span></div>
        </div>
        <div className={styles.topStatus}>
          <i className={`${styles.statusDot} ${evaluation ? styles.online : ""}`} />
          <span>{evaluation ? "Evaluation ready" : "Dry-run console"}</span>
        </div>
        <Link className={styles.backLink} href="/"><ChevronLeft size={15} /> Command center</Link>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <span className={styles.eyebrow}>Autonomous calculations · human-controlled delivery</span>
            <h1>Regional watch automation</h1>
            <p>Subscribe regions to live intelligence, evaluate verified observations against a clear threshold policy and preview an auditable alert. Calculations run automatically; AEGIS never sends an emergency order from this screen.</p>
          </div>
          <div className={styles.heroActions}>
            <button className={styles.button} type="button" onClick={() => void requestNotifications()} disabled={notificationPermission === "granted"}>
              {notificationPermission === "granted" ? <BellRing size={14} /> : <Bell size={14} />}
              {notificationPermission === "granted" ? "Notifications on" : "Enable browser alerts"}
            </button>
            <button className={styles.buttonQuiet} type="button" onClick={() => { hasBootstrapWatches.current = true; setWatches([]); setEvaluation(null); receiptsRef.current = []; try { window.localStorage.setItem(STORAGE_WATCHES, "[]"); window.localStorage.setItem(STORAGE_RECEIPTS, "[]"); } catch { /* storage is optional */ } setNotice({ text: "Browser-local watches and deduplication receipts cleared." }); }} disabled={!watches.length}><Trash2 size={14} /> Clear local watches</button>
          </div>
        </section>

        {notice ? <div className={`${styles.notice} ${notice.error ? styles.error : ""}`} role="status"><CircleAlert size={14} /><span>{notice.text}</span><button type="button" aria-label="Dismiss notice" onClick={() => setNotice(null)}><X size={14} /></button></div> : null}

        <section className={styles.modeBar} aria-label="Automation status">
          <div className={styles.modeCell}><span>Evaluation mode</span><strong>{mode === "live" ? "Live intelligence" : "Demo incident set"}</strong><small>{mode === "live" ? "Observed records only · source freshness enforced" : "For rehearsal · never presented as observed"}</small></div>
          <div className={`${styles.modeCell} ${styles.amber}`}><span>Delivery</span><strong>DRY-RUN</strong><small>No external sends</small></div>
          <div className={`${styles.modeCell} ${styles.green}`}><span>Region watches</span><strong>{enabledWatches.length.toString().padStart(2, "0")}</strong><small>{watches.length} configured locally</small></div>
          <div className={`${styles.modeCell} ${styles.red}`}><span>Proposals</span><strong>{(summary.proposedAlertCount ?? evaluation?.alerts.length ?? 0).toString().padStart(2, "0")}</strong><small>Human review required</small></div>
        </section>

        <section className={styles.grid}>
          <div className={styles.panel}>
            <div className={styles.panelHeading}><div><span>01 · Subscriptions</span><strong>Regions under watch</strong><small>Each region keeps its own hazard and freshness threshold.</small></div><Crosshair size={16} /></div>
            <div className={styles.panelBody}>
              {loadingBootstrap ? <div className={styles.empty}><LoaderCircle className={styles.spin} size={18} /><span>Loading default region policy…</span></div> : null}
              {!loadingBootstrap && !watches.length ? <div className={styles.empty}><strong>No regions configured</strong>Add a circle or import defaults from the automation service.</div> : null}
              <div className={styles.watchList}>
                {watches.map((watch) => (
                  <article className={`${styles.watch} ${watch.enabled ? "" : styles.disabled}`} key={watch.id}>
                    <div className={styles.watchTop}>
                      <div className={styles.watchTitle}><strong>{watch.name}</strong><small>{regionCoordinates(watch)}</small></div>
                      <label className={styles.switch} title={watch.enabled ? "Pause region watch" : "Enable region watch"}><span className={styles.srOnly}>{watch.enabled ? `Pause ${watch.name} region watch` : `Enable ${watch.name} region watch`}</span><input type="checkbox" checked={watch.enabled} onChange={(event) => updateWatch(watch.id, { enabled: event.target.checked })} /><span className={styles.slider} /></label>
                    </div>
                    <div className={styles.watchMeta}><span className={styles.tag}>{watch.geometry.kind}</span><span className={`${styles.tag} ${styles.amber}`}>{watch.minimumSeverity}+ severity</span><span className={styles.tag}>{watch.maxAgeMinutes} min freshness</span>{watch.hazards.slice(0, 4).map((hazard) => <span className={styles.tag} key={hazard}>{HAZARD_LABELS[hazard] ?? hazard}</span>)}</div>
                    <div className={styles.watchActions}><button className={styles.iconButton} type="button" aria-label={`Delete ${watch.name} watch`} onClick={() => deleteWatch(watch.id)}><Trash2 size={13} /></button></div>
                  </article>
                ))}
              </div>

              <div className={styles.addForm}>
                {!newRegionOpen ? <button className={styles.buttonQuiet} type="button" onClick={() => setNewRegionOpen(true)}><Plus size={14} /> Add region watch</button> : (
                  <div className={styles.controls}>
                    <label className={styles.field}><span>Region name</span><input className={styles.input} value={newRegion.name} onChange={(event) => setNewRegion((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Assam flood corridor" /></label>
                    <div className={`${styles.fieldGrid} ${styles.three}`}><label className={styles.field}><span>Latitude</span><input className={styles.number} inputMode="decimal" value={newRegion.latitude} onChange={(event) => setNewRegion((current) => ({ ...current, latitude: event.target.value }))} /></label><label className={styles.field}><span>Longitude</span><input className={styles.number} inputMode="decimal" value={newRegion.longitude} onChange={(event) => setNewRegion((current) => ({ ...current, longitude: event.target.value }))} /></label><label className={styles.field}><span>Radius · km</span><input className={styles.number} inputMode="decimal" value={newRegion.radiusKm} onChange={(event) => setNewRegion((current) => ({ ...current, radiusKm: event.target.value }))} /></label></div>
                    <fieldset className={styles.field}><legend>Hazards</legend><div className={styles.hazards}>{HAZARDS.map((hazard) => <span className={styles.hazard} key={hazard}><input id={`new-${hazard}`} type="checkbox" checked={newHazards.includes(hazard)} onChange={(event) => setNewHazards((current) => event.target.checked ? [...new Set([...current, hazard])] : current.filter((item) => item !== hazard))} /><label htmlFor={`new-${hazard}`}>{HAZARD_LABELS[hazard]}</label></span>)}</div></fieldset>
                    <div className={styles.fieldGrid}><label className={styles.field}><span>Minimum severity</span><select className={styles.select} value={newSeverity} onChange={(event) => setNewSeverity(event.target.value as AutomationRegion["minimumSeverity"])}><option value="low">Low+</option><option value="medium">Medium+</option><option value="high">High+</option><option value="critical">Critical only</option></select></label><div className={styles.switchRow}><span className={styles.switchCopy}><strong>Start enabled</strong><small>Keep this watch in the next run.</small></span><label className={styles.switch}><span className={styles.srOnly}>Start the new region watch enabled</span><input type="checkbox" checked={newEnabled} onChange={(event) => setNewEnabled(event.target.checked)} /><span className={styles.slider} /></label></div></div>
                    <div className={styles.formActions}><button className={styles.buttonQuiet} type="button" onClick={() => setNewRegionOpen(false)}>Cancel</button><button className={styles.buttonPrimary} type="button" onClick={addWatch}><Plus size={14} /> Add watch</button></div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className={styles.panel}>
            <div className={styles.panelHeading}><div><span>02 · Policy and evaluation</span><strong>Threshold controls</strong><small>Adjust what can become a proposal; source facts remain labelled.</small></div><SlidersHorizontal size={16} /></div>
            <div className={styles.panelBody}>
              <div className={styles.controls}>
                <div className={styles.fieldGrid}><label className={styles.field}><span>Input set</span><select className={styles.select} value={mode} onChange={(event) => setMode(event.target.value as AutomationMode)}><option value="live">Live / observed feeds</option><option value="demo">Demo incident set</option></select><small>Demo is explicit and never masquerades as a live event.</small></label><label className={styles.field}><span>Maximum retrieval age</span><select className={styles.select} value={policy.maxRetrievalAgeMinutes} onChange={(event) => setPolicy((current) => ({ ...current, maxRetrievalAgeMinutes: Number(event.target.value) }))}><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="180">3 hours</option><option value="360">6 hours</option><option value="1440">24 hours</option></select><small>Feed snapshots retrieved before this window are suppressed; each region retains its own incident-age rule.</small></label></div>
                <div className={styles.switchRow}><span className={styles.switchCopy}><strong>Require official provenance</strong><small>Only source-labelled records can propose an alert.</small></span><label className={styles.switch}><span className={styles.srOnly}>Require official provenance</span><input type="checkbox" checked={policy.requireOfficialSource} onChange={(event) => setPolicy((current) => ({ ...current, requireOfficialSource: event.target.checked }))} /><span className={styles.slider} /></label></div>
                <div className={styles.switchRow}><span className={styles.switchCopy}><strong>Automatic tab checks</strong><small>{autoMonitor ? `Runs every ${intervalMinutes} min while this tab is visible.` : "Off until you start the monitor."}</small></span><label className={styles.switch}><span className={styles.srOnly}>Enable automatic tab checks</span><input type="checkbox" checked={autoMonitor} onChange={(event) => setAutoMonitor(event.target.checked)} /><span className={styles.slider} /></label></div>
                {autoMonitor ? <div className={styles.field}><span>Check interval</span><select className={styles.select} value={intervalMinutes} onChange={(event) => setIntervalMinutes(Number(event.target.value))}><option value="1">1 minute · demo</option><option value="5">5 minutes · recommended</option><option value="15">15 minutes · low traffic</option></select></div> : null}
              </div>
              <div className={styles.runStrip}><div className={styles.runStripCopy}><strong>{capabilities.deterministicEvaluation === false ? "Provider evaluation" : "Deterministic evaluation"}</strong><small>{evaluation ? `Last run ${formatTime(evaluation.evaluatedAt)} · ${sourceCount} source(s)` : "No evaluation has been run in this session."}</small></div><div className={styles.runActions}><button className={styles.buttonQuiet} type="button" onClick={() => void runEvaluation()} disabled={running || !enabledWatches.length}>{running ? <LoaderCircle className={styles.spin} size={14} /> : <RefreshCw size={14} />} Run now</button>{autoMonitor ? <button className={styles.buttonDanger} type="button" onClick={() => setAutoMonitor(false)}><Pause size={14} /> Pause</button> : <button className={styles.buttonPrimary} type="button" onClick={() => setAutoMonitor(true)} disabled={!enabledWatches.length}><Play size={14} /> Start monitor</button>}</div></div>
            </div>

            <div className={styles.results}>
              <div className={styles.resultSummary}><div className={styles.metric}><span>Regions checked</span><strong>{evaluation?.regions.length ?? "—"}</strong><small>configured watches</small></div><div className={`${styles.metric} ${styles.match}`}><span>Matches</span><strong>{matchedIncidentCount ?? "—"}</strong><small>inside selected regions</small></div><div className={`${styles.metric} ${styles.alert}`}><span>Proposals</span><strong>{summary.proposedAlertCount ?? evaluation?.alerts.length ?? "—"}</strong><small>human review required</small></div><div className={`${styles.metric} ${styles.clear}`}><span>Suppressed</span><strong>{summary.suppressedAlertCount ?? "—"}</strong><small>threshold/cooldown</small></div></div>
              <div className={styles.resultHeading}><h2>Evaluation detail</h2><span>{evaluation ? evaluation.mode.toUpperCase() : "WAITING"}</span></div>
              {!evaluation ? <div className={styles.empty}><strong>Run a check to populate the decision surface</strong>AEGIS will show observed source records, freshness, reason codes and proposed delivery state here.</div> : <div className={styles.regionResults}>{evaluation.regions.map((region, index) => <details className={styles.regionResult} open={expandedRegion === region.regionId || (expandedRegion === null && index === 0)} key={region.regionId} onToggle={(event) => { if (event.currentTarget.open) setExpandedRegion(region.regionId); }}><summary><strong>{region.regionName}</strong><span className={`${styles.tag} ${statusClass(region.status)} ${styles.resultState}`}>{statusLabel(region.status)}</span></summary><div className={styles.resultDetails}>{region.matchedIncidents.length ? region.matchedIncidents.map((match) => <div className={`${styles.incidentRow} ${match.eligible ? styles.eligible : ""}`} key={match.incident.id}><div className={styles.incidentLabels}><span className={styles.tag}>{match.incident.reality === "simulated" ? "SIMULATED" : "OBSERVED"}</span><span className={`${styles.freshness} ${freshnessClass(match.incident.freshness?.band)}`}>{match.incident.freshness?.label ?? "Freshness unknown"}</span><span className={styles.tag}>{match.incident.severity}</span>{typeof match.distanceKm === "number" ? <span className={styles.tag}>{match.distanceKm.toFixed(1)} km</span> : null}</div><strong>{match.incident.title}</strong><small>{match.reason} · {match.incident.provenance?.sourceName ?? "Source unavailable"} · {formatAge(match.incident.updatedAt ?? match.incident.observedAt)}</small></div>) : <p className={styles.resultReason}>No matching incident in the current source snapshot. This is a source result, not a claim that the region is risk-free.</p>}{region.proposedAlerts.length ? region.proposedAlerts.map((alert) => <div className={`${styles.incidentRow} ${styles.eligible}`} key={alert.id}><div className={styles.incidentLabels}><span className={`${styles.tag} ${styles.red}`}>PROPOSED · {alert.kind}</span><span className={styles.tag}>{alert.delivery}</span></div><strong>{alert.title}</strong><small>{alert.summary} · expires {formatTime(alert.expiresAt)}</small></div>) : null}</div></details>)}</div>}
              {evaluation?.safetyNotice ? <div className={styles.safety}><ShieldCheck size={14} /><span>{evaluation.safetyNotice}</span></div> : <div className={styles.safety}><ShieldCheck size={14} /><span><strong>Safety boundary:</strong> all proposals stay inside AEGIS until an authorised delivery provider and human approval policy are configured.</span></div>}
              <section className={styles.log}><div className={styles.resultHeading}><h2>Notification log preview</h2><span>{notificationPermission === "granted" ? "BROWSER READY" : "IN-PAGE ONLY"}</span></div>{notificationLog.length ? <div className={styles.logList}>{notificationLog.map((entry) => <div className={styles.logItem} key={entry.id}><Bell size={13} /><div><strong>{entry.title}</strong><small>{entry.detail}</small></div><em>{entry.delivery} · {formatTime(entry.createdAt)}</em></div>)}</div> : <p className={styles.panelHint}>No proposed notifications have been recorded yet. A run with matching incidents will add a preview here; it will never claim that a phone or government channel received it.</p>}</section>
            </div>
          </div>
        </section>

        <p className={styles.panelHint} style={{ marginTop: 16 }}><Database size={12} /> {capabilities.serverDelivery === false ? "Server delivery is intentionally disabled in this build." : "Server delivery is not connected in this build."} <Wifi size={12} /> Browser-local state is stored on this device only. For background phone push, deploy an authorised provider and configure consent, retention and audit rules.</p>
      </main>
    </div>
  );
}
