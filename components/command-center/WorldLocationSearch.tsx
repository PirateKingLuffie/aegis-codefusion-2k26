"use client";

import { Crosshair, LoaderCircle, MapPin, Navigation, Search, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import styles from "./command-center.module.css";
import {
  formatCoordinate,
  parseCoordinateQuery,
  searchHitToSelection,
  searchOfflineWorldPlaces,
  type WorldLocationSelection,
  type WorldSearchHit,
} from "./world-search";

type WorldLocationSearchProps = {
  activeName: string;
  activeLatitude: number;
  activeLongitude: number;
  quickLocations: WorldLocationSelection[];
  onSelect: (selection: WorldLocationSelection) => void;
};

type SearchOption = {
  key: string;
  label: string;
  detail: string;
  source: "COORDINATES" | "OPENSTREETMAP" | "OFFLINE REFERENCE" | "QUICK ACCESS";
  selection: WorldLocationSelection;
};

function coordinateOption(query: string): SearchOption | null {
  const coordinate = parseCoordinateQuery(query);
  if (!coordinate) return null;
  const detail = formatCoordinate(coordinate.latitude, coordinate.longitude);
  return {
    key: `coordinates-${coordinate.latitude}-${coordinate.longitude}`,
    label: "Go to exact coordinates",
    detail,
    source: "COORDINATES",
    selection: {
      id: `coordinates-${coordinate.latitude.toFixed(5)}-${coordinate.longitude.toFixed(5)}`,
      name: "Coordinate selection",
      region: detail,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      type: "coordinates",
      zoom: 11.2,
      fidelity: "GLOBAL PROTOTYPE",
    },
  };
}

export function WorldLocationSearch({
  activeName,
  activeLatitude,
  activeLongitude,
  quickLocations,
  onSelect,
}: WorldLocationSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorldSearchHit[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [providerLabel, setProviderLabel] = useState("OpenStreetMap Nominatim");
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const listboxId = "aegis-world-search-results";

  const directCoordinate = useMemo(() => coordinateOption(query), [query]);
  const options = useMemo<SearchOption[]>(() => {
    if (directCoordinate) return [directCoordinate];
    if (results.length) {
      return results.map((result) => {
        const selection = searchHitToSelection(result);
        return {
          key: selection.id,
          label: selection.name,
          detail: result.label,
          source: result.dataClass === "REFERENCE" ? "OFFLINE REFERENCE" as const : "OPENSTREETMAP" as const,
          selection,
        };
      });
    }
    if (!query.trim()) {
      return quickLocations.map((selection) => ({
        key: `quick-${selection.id}`,
        label: selection.name,
        detail: selection.region,
        source: "QUICK ACCESS" as const,
        selection,
      }));
    }
    return [];
  }, [directCoordinate, query, quickLocations, results]);

  const selectOption = useCallback((option: SearchOption) => {
    requestRef.current?.abort();
    onSelect(option.selection);
    setQuery(option.selection.name);
    setResults([]);
    setExpanded(false);
    setActiveIndex(-1);
    setProviderLabel("OpenStreetMap Nominatim");
    setFeedback(`Globe focused on ${option.selection.name}.`);
  }, [onSelect]);

  const runSearch = useCallback(async () => {
    const normalizedQuery = query.trim();
    if (directCoordinate) {
      selectOption(directCoordinate);
      return;
    }
    if (normalizedQuery.length < 2) {
      setExpanded(true);
      setFeedback("Enter at least two characters, or paste a latitude and longitude pair.");
      return;
    }

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSearching(true);
    setFeedback(null);
    setActiveIndex(-1);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(normalizedQuery)}`, {
        signal: controller.signal,
      });
      const payload = (await response.json()) as {
        results?: WorldSearchHit[];
        notice?: string;
        source?: string;
      };
      if (!response.ok) throw new Error(payload.notice ?? "Search unavailable");
      const nextResults = (payload.results ?? [])
        .filter((result) => Number.isFinite(result.latitude) && Number.isFinite(result.longitude))
        .sort((first, second) => (second.importance ?? 0) - (first.importance ?? 0));
      setResults(nextResults);
      setProviderLabel(payload.source ?? "OpenStreetMap Nominatim");
      setExpanded(true);
      setActiveIndex(nextResults.length ? 0 : -1);
      setFeedback(payload.notice ?? (nextResults.length ? null : "No mapped location matched that search. Try a wider place name or exact coordinates."));
    } catch (error) {
      if (controller.signal.aborted) return;
      const fallbackResults = searchOfflineWorldPlaces(normalizedQuery);
      setResults(fallbackResults);
      setProviderLabel(fallbackResults.length ? "AEGIS offline gazetteer" : "OpenStreetMap Nominatim (unavailable)");
      setExpanded(true);
      setActiveIndex(fallbackResults.length ? 0 : -1);
      setFeedback(fallbackResults.length
        ? "Search service unavailable. Showing built-in reference locations; exact addresses require connectivity."
        : error instanceof Error ? error.message : "World search is temporarily unavailable. Exact coordinates still work.");
    } finally {
      if (requestRef.current === controller) setSearching(false);
    }
  }, [directCoordinate, query, selectOption]);

  useEffect(() => {
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setExpanded(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, []);

  useEffect(() => {
    const focusShortcut = (event: globalThis.KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isEditing = target?.matches("input, textarea, select, [contenteditable='true']");
      if (event.key === "/" && !isEditing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault();
        inputRef.current?.focus();
        setExpanded(true);
      }
    };
    window.addEventListener("keydown", focusShortcut);
    return () => window.removeEventListener("keydown", focusShortcut);
  }, []);

  useEffect(() => () => requestRef.current?.abort(), []);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (activeIndex >= 0 && options[activeIndex]) {
      selectOption(options[activeIndex]);
      return;
    }
    void runSearch();
  };

  const handleInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((current) => Math.min(options.length - 1, current + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((current) => Math.max(-1, current - 1));
    } else if (event.key === "Escape") {
      event.preventDefault();
      setExpanded(false);
      setActiveIndex(-1);
    }
  };

  const showPopover = expanded && (options.length > 0 || Boolean(feedback));

  return (
    <div className={styles.worldLocationSearch} ref={wrapperRef}>
      <form className={styles.worldLocationSearchForm} role="search" onSubmit={handleSubmit}>
        <Search aria-hidden="true" size={16} />
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder="Search any city, landmark or coordinates"
          aria-label="Search the world map"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={showPopover}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          aria-keyshortcuts="/"
          role="combobox"
          autoComplete="off"
          spellCheck={false}
          onFocus={() => setExpanded(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setResults([]);
            setFeedback(null);
            setProviderLabel("OpenStreetMap Nominatim");
            setActiveIndex(-1);
            setExpanded(true);
          }}
          onKeyDown={handleInputKeyDown}
        />
        {query ? (
          <button
            type="button"
            className={styles.worldSearchClear}
            aria-label="Clear world search"
            onClick={() => {
              setQuery("");
              setResults([]);
              setFeedback(null);
              setActiveIndex(-1);
              inputRef.current?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : <kbd title="Keyboard shortcut">/</kbd>}
        <button type="submit" className={styles.worldSearchSubmit} disabled={searching} aria-label="Run world search">
          {searching ? <LoaderCircle className={styles.spin} size={15} /> : <Navigation size={15} />}
          <span>{searching ? "Searching" : "Locate"}</span>
        </button>
      </form>

      {showPopover ? (
        <div className={styles.worldSearchPopover}>
          <div className={styles.worldSearchContext}>
            <span>{query.trim() ? (directCoordinate ? "Exact coordinate" : "Location results") : "Recent locations"}</span>
            <small>{activeName} · {formatCoordinate(activeLatitude, activeLongitude)}</small>
          </div>
          {options.length ? (
            <div id={listboxId} className={styles.worldSearchOptions} role="listbox" aria-label="World location results">
              {options.map((option, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listboxId}-${index}`}
                  key={option.key}
                  aria-selected={activeIndex === index}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectOption(option)}
                >
                  {option.source === "COORDINATES" ? <Crosshair size={15} /> : <MapPin size={15} />}
                  <span><b>{option.label}</b><small>{option.detail}</small></span>
                  <em>{option.source}</em>
                </button>
              ))}
            </div>
          ) : null}
          {feedback ? <p className={styles.worldSearchFeedback} role="status">{feedback}</p> : null}
          <div className={styles.worldSearchProvider}>
            <span>Place data: {providerLabel}</span>
            <span>Enter selects · ↑↓ navigates · Esc closes</span>
          </div>
        </div>
      ) : null}
      <span className={styles.worldSearchLiveStatus} aria-live="polite">{feedback}</span>
    </div>
  );
}
