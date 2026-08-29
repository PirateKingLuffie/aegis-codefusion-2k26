"use client";

import {
  AlertTriangle,
  CalendarClock,
  ExternalLink,
  Globe2,
  MapPin,
  RefreshCw,
  Satellite,
  Search,
  ShieldCheck,
  Timer,
  Video,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeatureNavigation } from "@/components/navigation/FeatureNavigation";
import type {
  IncidentCategory,
  LiveIncident,
  LiveIntelligenceResponse,
} from "@/lib/live/types";
import { LiveMediaDialog } from "@/components/command-center/LiveMediaDialog";
import styles from "./LiveContextConsole.module.css";

type Filter = "all" | IncidentCategory;

const CATEGORIES: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All hazards" },
  { id: "flood", label: "Flood" },
  { id: "earthquake", label: "Earthquake" },
  { id: "cyclone", label: "Cyclone" },
  { id: "wildfire", label: "Wildfire" },
  { id: "landslide", label: "Landslide" },
];

function formatTime(value: string | undefined): string {
  if (!value) return "Time unavailable";
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  }).format(parsed) + " UTC";
}

function ageLabel(incident: LiveIncident): string {
  return incident.freshness?.label || "Freshness unavailable";
}

function severityClass(severity: LiveIncident["severity"]): string {
  return severity === "critical" || severity === "high" ? styles.red : severity === "medium" ? styles.amber : "";
}

function incidentMapUrl(incident: LiveIncident): string | undefined {
  const coordinates = incident.location.coordinates;
  if (!coordinates) return undefined;
  return `https://www.openstreetmap.org/?mlat=${coordinates.latitude}&mlon=${coordinates.longitude}#map=11/${coordinates.latitude}/${coordinates.longitude}`;
}

export function LiveContextConsole() {
  const [feed, setFeed] = useState<LiveIntelligenceResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState("7");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<string | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const requestController = useRef<AbortController | null>(null);
  const requestSequence = useRef(0);

  const refresh = useCallback(async (quiet = false) => {
    if (quiet && document.visibilityState !== "visible") return;
    requestController.current?.abort();
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    if (quiet) setRefreshing(true);
    else setLoading(true);
    const controller = new AbortController();
    requestController.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    try {
      const params = new URLSearchParams({ limit: "30", days, includeMedia: "false" });
      const response = await fetch(`/api/live?${params.toString()}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Live feed returned HTTP ${response.status}.`);
      const payload = await response.json() as LiveIntelligenceResponse;
      if (requestId !== requestSequence.current) return;
      setFeed(payload);
      setLastRefresh(payload.generatedAt);
      setError(null);
      setSelectedId((current) => current && payload.incidents.some((incident) => incident.id === current)
        ? current
        : payload.incidents[0]?.id ?? null);
    } catch (reason) {
      if (requestId !== requestSequence.current) return;
      setError(reason instanceof Error && reason.name === "AbortError"
        ? "The live feed timed out; retry when the upstream sources respond."
        : reason instanceof Error ? reason.message : "The live feed could not be refreshed.");
    } finally {
      window.clearTimeout(timeout);
      if (requestId === requestSequence.current) {
        requestController.current = null;
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [days]);

  useEffect(() => {
    const initial = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(initial);
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = window.setInterval(() => void refresh(true), 60_000);
    return () => window.clearInterval(interval);
  }, [autoRefresh, refresh]);

  useEffect(() => () => requestController.current?.abort(), []);

  const incidents = useMemo(() => {
    const source = feed?.incidents ?? [];
    const normalizedQuery = query.trim().toLowerCase();
    return source.filter((incident) => {
      if (filter !== "all" && incident.category !== filter) return false;
      if (!normalizedQuery) return true;
      return `${incident.title} ${incident.summary} ${incident.location.name} ${incident.category} ${incident.provenance.sourceName}`.toLowerCase().includes(normalizedQuery);
    });
  }, [feed?.incidents, filter, query]);

  const selected = useMemo(
    () => incidents.find((incident) => incident.id === selectedId) ?? incidents[0] ?? null,
    [incidents, selectedId],
  );

  const observedCount = feed?.counts.observed ?? 0;
  const liveSources = feed?.counts.liveSources ?? 0;
  const degradedSources = feed?.counts.degradedSources ?? 0;

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element -- static mark avoids image runtime dependency */}
            <img src="/aegis-mark.svg" alt="" width="22" height="27" />
          </span>
          <div className={styles.identityCopy}>
            <strong>AEGIS</strong>
            <span>Live evidence desk</span>
          </div>
        </div>
        <FeatureNavigation active="intelligence" />
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div>
            <div className={styles.eyebrow}>SOURCE-LABELLED SITUATIONAL AWARENESS</div>
            <h1>Live evidence desk</h1>
            <p>Track public disaster alerts, sensor context and source-backed impact reports in one place. “Live” means the named upstream record is current; satellite, camera and damage layers retain their own capture time.</p>
          </div>
          <div className={styles.heroActions}>
            <button type="button" className={styles.buttonPrimary} onClick={() => void refresh(false)} disabled={loading || refreshing}>
              <RefreshCw size={14} className={refreshing ? styles.spin : undefined} /> {refreshing ? "Refreshing" : "Refresh feeds"}
            </button>
            <button type="button" className={styles.buttonQuiet} onClick={() => setAutoRefresh((current) => !current)} aria-pressed={autoRefresh}>
              <Timer size={14} /> Auto-refresh {autoRefresh ? "on" : "off"}
            </button>
          </div>
        </section>

        <div className={`${styles.notice} ${error ? styles.error : ""}`} role={error ? "alert" : "note"}>
          {error ? <AlertTriangle size={15} /> : <ShieldCheck size={15} />}
          <span>{error ?? "Every record is marked observed, cached or simulated. AEGIS does not turn a forecast or modelled layer into a confirmed disaster boundary."}</span>
          {error ? <button type="button" onClick={() => setError(null)} aria-label="Dismiss feed error">×</button> : null}
        </div>

        <section className={styles.metrics} aria-label="Live evidence summary">
          <div className={styles.metric}><div className={styles.metricTop}><span>Observed records</span><i className={`${styles.metricDot} ${styles.live}`} /></div><strong>{observedCount}</strong><small>source-labelled incidents</small></div>
          <div className={styles.metric}><div className={styles.metricTop}><span>Live sources</span><i className={`${styles.metricDot} ${styles.ok}`} /></div><strong>{liveSources}</strong><small>{degradedSources} degraded or unavailable</small></div>
          <div className={styles.metric}><div className={styles.metricTop}><span>Visible now</span><i className={`${styles.metricDot} ${styles.warn}`} /></div><strong>{incidents.length}</strong><small>after current filter</small></div>
          <div className={styles.metric}><div className={styles.metricTop}><span>Last retrieval</span><i className={styles.metricDot} /></div><strong>{lastRefresh ? formatTime(lastRefresh).split(" ").slice(-2).join(" ") : "—"}</strong><small>{lastRefresh ? formatTime(lastRefresh) : "Waiting for feed"}</small></div>
        </section>

        <section className={styles.toolbar} aria-label="Live evidence filters">
          <label className={styles.search}>
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by place, source or hazard" aria-label="Filter live incidents" />
          </label>
          <select className={styles.select} value={days} onChange={(event) => setDays(event.target.value)} aria-label="Feed lookback window">
            <option value="1">Past 24 hours</option>
            <option value="7">Past 7 days</option>
            <option value="30">Past 30 days</option>
          </select>
          <div className={styles.filterRow} role="group" aria-label="Hazard filters">
            {CATEGORIES.map((item) => <button type="button" key={item.id} className={`${styles.filter} ${filter === item.id ? styles.filterActive : ""}`} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{item.label}</button>)}
          </div>
        </section>

        <div className={styles.grid}>
          <section className={styles.panel} aria-label="Incident feed">
            <header className={styles.panelHeader}><div><strong>Incident feed</strong><small>Observed and source-cached records</small></div><small>{loading ? "Loading" : `${incidents.length} records`}</small></header>
            <div className={styles.incidentList} aria-live="polite">
              {loading && !feed ? <div className={styles.empty}>Connecting to public incident providers…</div> : null}
              {!loading && !incidents.length ? <div className={styles.empty}>No records match this filter. Widen the hazard or time window and refresh.</div> : null}
              {incidents.map((incident) => {
                const live = incident.provenance.status === "live" && incident.freshness.band !== "archived";
                return (
                  <button type="button" key={incident.id} className={`${styles.incidentButton} ${selected?.id === incident.id ? styles.selected : ""}`} onClick={() => setSelectedId(incident.id)}>
                    <div className={styles.incidentTop}><span className={styles.incidentTitle}>{incident.title}</span><span className={`${styles.pill} ${live ? styles.live : incident.provenance.status === "cached" ? styles.cached : ""}`}>{live ? "Live" : incident.provenance.status === "cached" ? "Cached" : "Report"}</span></div>
                    <div className={styles.incidentMeta}><span><MapPin size={11} />{incident.location.name}</span><span className={severityClass(incident.severity)}>{incident.severity}</span><span>{ageLabel(incident)}</span></div>
                    <p className={styles.incidentSummary}>{incident.summary}</p>
                  </button>
                );
              })}
            </div>
          </section>

          <section className={`${styles.panel} ${styles.detail}`} aria-label="Selected incident evidence">
            {selected ? (
              <div className={styles.detailBody}>
                <div className={styles.detailKicker}>{selected.reality === "simulated" ? "SIMULATED RECORD" : selected.provenance.status === "cached" ? "SOURCE-CACHED RECORD" : "OBSERVED INCIDENT"}</div>
                <h2>{selected.title}</h2>
                <p className={styles.detailLead}>{selected.summary}</p>
                <div className={styles.tagRow}>
                  <span className={`${styles.tag} ${selected.provenance.status === "live" ? styles.red : styles.amber}`}>{selected.category}</span>
                  <span className={`${styles.tag} ${selected.severity === "critical" || selected.severity === "high" ? styles.red : ""}`}>{selected.severity} severity</span>
                  <span className={styles.tag}>{ageLabel(selected)}</span>
                </div>
                <div className={styles.evidenceGrid}>
                  <div className={styles.evidenceCard}><span><CalendarClock size={11} /> Observation time</span><strong>{formatTime(selected.observedAt ?? selected.updatedAt)}</strong><small>Upstream event timestamp</small></div>
                  <div className={styles.evidenceCard}><span><RefreshCw size={11} /> Retrieved</span><strong>{formatTime(selected.provenance.retrievedAt)}</strong><small>AEGIS provider fetch</small></div>
                  <div className={styles.evidenceCard}><span><Globe2 size={11} /> Location</span><strong>{selected.location.name}</strong><small>{selected.location.coordinates ? `${selected.location.coordinates.latitude.toFixed(4)}, ${selected.location.coordinates.longitude.toFixed(4)}` : "Coordinates unavailable"}</small></div>
                  <div className={styles.evidenceCard}><span><Satellite size={11} /> Data class</span><strong>{selected.dataMode.replace(/-/g, " ")}</strong><small>{selected.provenance.sourceName}</small></div>
                </div>

                <div className={styles.sectionTitle}><span>Reported impact metrics</span><small>Source values only</small></div>
                <div className={styles.metricList}>
                  {selected.impactMetrics.length ? selected.impactMetrics.slice(0, 8).map((metric) => <div className={styles.metricRow} key={metric.key}><div><span>{metric.label}</span><small>{metric.qualifier ?? "Provider-reported value"}</small></div><strong>{typeof metric.value === "number" ? metric.value.toLocaleString("en-IN") : String(metric.value)}{metric.unit ? ` ${metric.unit}` : ""}</strong></div>) : <div className={styles.empty}>No quantitative impact value was supplied by this source.</div>}
                </div>

                <div className={styles.sectionTitle}><span>Evidence actions</span><small>Verify before operational use</small></div>
                <div className={styles.linkRow}>
                  {incidentMapUrl(selected) ? <a className={styles.sourceLink} href={incidentMapUrl(selected)} target="_blank" rel="noreferrer"><MapPin size={12} /> Open map <ExternalLink size={11} /></a> : null}
                  <button type="button" className={`${styles.sourceLink} ${styles.official}`} onClick={() => setMediaOpen(true)}><Video size={12} /> View source media</button>
                  {selected.links.slice(0, 5).map((link) => <a className={`${styles.sourceLink} ${link.kind === "official" ? styles.official : ""}`} key={`${link.kind}:${link.url}`} href={link.url} target="_blank" rel="noreferrer">{link.label} <ExternalLink size={11} /></a>)}
                </div>
                <div className={styles.callout} style={{ marginTop: 16 }}><h3>Source notice</h3><p>{selected.provenance.notice ?? "Provider notice unavailable."}</p><p>AEGIS can calculate a scenario around this coordinate, but calculated depth, damage and route effects remain labelled <b>SIMULATED</b> until field or authoritative data confirms them.</p></div>
              </div>
            ) : <div className={styles.empty}>Select an incident to inspect its timestamps, impact metrics and source links.</div>}
          </section>

          <aside className={styles.rightStack} aria-label="Feed status and evidence guidance">
            <section className={styles.panel}>
              <header className={styles.panelHeader}><div><strong>Provider state</strong><small>Configuration and retrieval result</small></div><small>{feed?.mode ?? "waiting"}</small></header>
              <div className={styles.sourceList}>{(feed?.sources ?? []).map((source) => <div className={styles.sourceRow} key={source.id}><i className={`${styles.sourceDot} ${source.status === "live" ? styles.live : source.status === "degraded" ? styles.degraded : ""}`} /><span>{source.name}<small>{source.recordCount} records · {source.latencyMs ? `${source.latencyMs} ms` : "latency n/a"}</small></span><em className={styles.sourceState}>{source.status}</em></div>)}{!feed ? <div className={styles.empty}>Provider status appears after the first refresh.</div> : null}</div>
            </section>
            <section className={styles.callout}>
              <h3><Satellite size={14} /> What “live” means here</h3>
              <p>Alerts and sensor reports can be near-real-time. Satellite scenes and damage assessments have acquisition and processing delay; they are never presented as continuous video.</p>
              <div className={styles.freshnessLegend}>
                <div><i className={`${styles.legendSwatch} ${styles.live}`} /> Current upstream record</div>
                <div><i className={`${styles.legendSwatch} ${styles.near}`} /> Near-real-time observation</div>
                <div><i className={`${styles.legendSwatch} ${styles.recent}`} /> Recent or provider report</div>
                <div><i className={`${styles.legendSwatch} ${styles.archive}`} /> Cached historical context</div>
              </div>
            </section>
            <section className={styles.callout}>
              <h3><ShieldCheck size={14} /> Free evidence viewers</h3>
              <p>Use the linked source record to verify capture time, publisher and location. Public satellite context is available through <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA Worldview</a> and emergency mapping through <a href="https://mapping.emergency.copernicus.eu/" target="_blank" rel="noreferrer">Copernicus EMS</a>.</p>
            </section>
          </aside>
        </div>
      </main>

      <LiveMediaDialog
        open={mediaOpen}
        onClose={() => setMediaOpen(false)}
        incident={selected ? {
          title: selected.title,
          category: selected.category,
          observedAt: selected.observedAt,
          reality: selected.reality,
          location: { name: selected.location.name },
          provenance: { sourceName: selected.provenance.sourceName },
        } : undefined}
      />
    </div>
  );
}
