"use client";

import {
  AlertTriangle,
  ChevronRight,
  Clock3,
  ExternalLink,
  Film,
  LoaderCircle,
  Radio,
  RefreshCw,
  ShieldCheck,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveMediaPlayback } from "@/lib/live/embed";
import type { IncidentMediaResult, MediaVideo } from "@/lib/live/types";
import styles from "./LiveMediaDialog.module.css";

type DialogIncident = {
  title: string;
  category: string;
  observedAt?: string;
  reality?: "observed" | "simulated";
  location: { name: string };
  provenance: { sourceName: string };
};

type DialogVideo = Omit<MediaVideo, "provenance"> & {
  provenance?: MediaVideo["provenance"];
};

type DialogMedia = {
  query?: string;
  notice: string;
  videos: DialogVideo[];
  links: Array<{
    label: string;
    url: string;
    kind: string;
    publisher?: string;
    publishedAt?: string;
    notice?: string;
  }>;
};

export interface LiveMediaDialogProps {
  open: boolean;
  onClose: () => void;
  incident?: DialogIncident;
  media?: DialogMedia;
}

function formatTimestamp(value: string | undefined): string {
  if (!value) return "Publication time unavailable";
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return "Publication time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(time) + " UTC";
}

function videoKey(video: DialogVideo): string {
  return `${video.provenance?.sourceId ?? "source"}:${video.id}`;
}

/**
 * In-product source viewer. Opening this dialog never navigates away from AEGIS;
 * the original publisher link remains an explicit fallback action.
 */
export function LiveMediaDialog({ open, onClose, incident, media }: LiveMediaDialogProps) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const [requestAttempt, setRequestAttempt] = useState(0);
  const [incidentMedia, setIncidentMedia] = useState<{
    requestKey: string;
    result?: IncidentMediaResult;
    failed?: boolean;
  }>();
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);

  const incidentQuery = incident
    ? [incident.title, incident.location.name, incident.category, "official footage"].filter(Boolean).join(" ")
    : "";
  // Include the open cycle so a previously viewed clip is not flashed while a
  // fresh incident-specific lookup is being made after reopening the dialog.
  const requestKey = `${incidentQuery}:${requestAttempt}:${open ? "open" : "closed"}`;
  const matchingResponse = incidentMedia?.requestKey === requestKey ? incidentMedia : undefined;
  // Parent media can belong to a different headline. Never flash it in an
  // incident-specific viewer while that incident's own request is pending.
  const activeMedia = incidentQuery ? matchingResponse?.result : media;
  const isLoading = Boolean(incidentQuery && !matchingResponse);
  const requestFailed = matchingResponse?.failed === true;
  const videos = useMemo(() => activeMedia?.videos.slice(0, 6) ?? [], [activeMedia?.videos]);
  const selectedVideo = videos.find((video) => videoKey(video) === selectedKey) ?? videos[0];
  const playback = selectedVideo ? resolveMediaPlayback(selectedVideo) : { kind: "unavailable" as const };
  const fallbackLinks = activeMedia?.links.slice(0, 4) ?? [];

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open || !incidentQuery) return;

    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      controller.abort();
      setIncidentMedia({ requestKey, failed: true });
    }, 12_000);
    void fetch(`/api/live/media?q=${encodeURIComponent(incidentQuery)}&limit=6`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Incident media unavailable");
        return await response.json() as IncidentMediaResult;
      })
      .then((result) => {
        if (!controller.signal.aborted) setIncidentMedia({ requestKey, result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setIncidentMedia({ requestKey, failed: true });
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [incidentQuery, open, requestKey]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus());

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], video[controls], iframe, [tabindex]:not([tabindex="-1"])'
        )
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  const incidentLabel = incident?.reality === "simulated"
    ? "SIMULATED INCIDENT"
    : incident
      ? "OBSERVED INCIDENT RECORD"
      : "SOURCE MEDIA";
  const sourceLabel = selectedVideo?.provenance?.sourceName ?? selectedVideo?.channelTitle ?? "No playable source returned";

  return (
    <div
      className={styles.backdrop}
      data-live-media-dialog="open"
      data-media-state={isLoading ? "loading" : requestFailed ? "failed" : videos.length ? "ready" : "unavailable"}
    >
      <button type="button" className={styles.dismissLayer} onClick={onClose} aria-label="Close source media viewer" />
      <section
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-media-title"
        aria-describedby="live-media-disclaimer"
      >
        <header className={styles.header}>
          <div className={styles.headingMark}><Radio size={17} /><i /></div>
          <div className={styles.headingCopy}>
            <span>INCIDENT SOURCE VIEWER</span>
            <h2 id="live-media-title">{incident?.title ?? media?.query ?? "Field media"}</h2>
            <small>{incident?.location.name ?? "Publisher-provided disaster context"}</small>
          </div>
          <button ref={closeRef} type="button" className={styles.close} onClick={onClose} aria-label="Close source media viewer">
            <X size={19} />
          </button>
        </header>

        <div className={styles.truthBar}>
          <span><ShieldCheck size={13} /> {incidentLabel}</span>
          <span><AlertTriangle size={13} /> {selectedVideo ? "SOURCE VIDEO · NOT VERIFIED LIVE" : "NO VERIFIED LIVE CAMERA AVAILABLE"}</span>
        </div>

        <div className={styles.layout}>
          <main className={styles.stage} aria-busy={isLoading}>
            <div className={styles.player}>
              {selectedVideo && playback.kind === "direct" ? (
                <video
                  key={playback.url}
                  src={playback.url}
                  poster={selectedVideo.thumbnailUrl}
                  title={`${selectedVideo.title} · ${selectedVideo.channelTitle}`}
                  controls
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : selectedVideo && playback.kind === "youtube" ? (
                <iframe
                  key={playback.url}
                  src={playback.url}
                  title={`${selectedVideo.title} · ${selectedVideo.channelTitle}`}
                  loading="eager"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                />
              ) : (
                <div className={styles.emptyPlayer} role="status">
                  {isLoading ? <LoaderCircle className={styles.loadingIcon} size={38} /> : <Film size={38} />}
                  <strong>{isLoading ? "Checking footage for this incident" : requestFailed ? "Media provider unavailable" : "No verified live footage available"}</strong>
                  <span>{isLoading
                    ? "Searching the selected incident and location. Clips from other disasters will not be substituted."
                    : "No matching playable source was returned for this incident. A live incident report does not mean a live camera is available."}</span>
                  {!isLoading && incidentQuery ? (
                    <button type="button" className={styles.retry} onClick={() => setRequestAttempt((attempt) => attempt + 1)}>
                      <RefreshCw size={14} /> Check again
                    </button>
                  ) : null}
                </div>
              )}
            </div>

            <div className={styles.mediaDetails}>
              <div>
                <span>{sourceLabel}</span>
                <strong>{selectedVideo?.title ?? "Source-backed incident intelligence"}</strong>
                <small>{selectedVideo?.channelTitle ?? incident?.provenance.sourceName ?? "Connected public providers"}</small>
              </div>
              <div className={styles.time}><Clock3 size={14} /> {selectedVideo ? "Published " : "Incident record "}{formatTimestamp(selectedVideo?.publishedAt ?? incident?.observedAt)}</div>
            </div>

            <p id="live-media-disclaimer" className={styles.disclaimer}>
              {selectedVideo?.provenance?.notice ?? activeMedia?.notice ?? "No video is presented as a verified live camera without publisher, capture-time and location confirmation. Publication time is not capture time."}
            </p>

            {selectedVideo ? (
              <div className={styles.sourceActions}>
                <div>
                  <span>Source</span>
                  <strong>{selectedVideo.provenance?.sourceName ?? selectedVideo.channelTitle}</strong>
                  <small>{selectedVideo.license ?? selectedVideo.provenance?.license ?? "Reuse terms available from publisher"}</small>
                </div>
                <a href={selectedVideo.watchUrl} target="_blank" rel="noreferrer">
                  Publisher page <ExternalLink size={13} />
                </a>
              </div>
            ) : null}
          </main>

          <aside className={styles.queue} aria-label="Available source media">
            <div className={styles.queueTitle}>
              <span>INCIDENT SEARCH RESULTS</span>
              <b>{videos.length}</b>
            </div>
            {videos.map((video) => {
              const active = selectedVideo ? videoKey(video) === videoKey(selectedVideo) : false;
              return (
                <button
                  key={videoKey(video)}
                  type="button"
                  className={active ? styles.activeItem : styles.queueItem}
                  aria-pressed={active}
                  onClick={() => setSelectedKey(videoKey(video))}
                >
                  <span className={styles.thumb}>
                    {video.thumbnailUrl ? (
                      // Remote publisher thumbnails are metadata, not application assets; keeping them
                      // as lazy native images avoids a paid/image-proxy dependency in the zero-cost build.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={video.thumbnailUrl} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" />
                    ) : <Film size={18} />}
                  </span>
                  <span className={styles.itemCopy}>
                    <b>{video.title}</b>
                    <small>{video.channelTitle}</small>
                    <em>{formatTimestamp(video.publishedAt)}</em>
                  </span>
                  <ChevronRight size={14} />
                </button>
              );
            })}

            {!videos.length ? (
              <div className={styles.noQueue}>{isLoading ? "Checking incident-specific sources…" : "No matching in-site playable source. No unrelated example footage is shown."}</div>
            ) : null}

            {fallbackLinks.length ? (
              <div className={styles.fallbacks}>
                <span>EXTERNAL FALLBACKS</span>
                {fallbackLinks.map((link) => (
                  <a key={`${link.kind}:${link.url}`} href={link.url} target="_blank" rel="noreferrer">
                    <span><b>{link.label}</b><small>{link.publisher ?? link.notice ?? "External source"}</small></span>
                    <ExternalLink size={12} />
                  </a>
                ))}
              </div>
            ) : null}
          </aside>
        </div>
      </section>
    </div>
  );
}
