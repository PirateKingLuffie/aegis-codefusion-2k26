"use client";

import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type {
  FeatureCollection,
  GeoJsonProperties,
  LineString,
  MultiLineString,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from "geojson";

import styles from "./AegisMap.module.css";
import {
  EIT_CAMPUS_BOUNDARY,
  EIT_CAMPUS_BUILDINGS,
  EIT_CAMPUS_ROADS,
  EIT_FARIDABAD,
} from "./campus-data";
import type { FloodVisualData } from "./geometry";
import type {
  AegisCoordinate,
  AegisExternalOverlay,
  AegisIncident,
  AegisMapLayerKey,
  AegisMapLayers,
  AegisMapSelection,
  AegisMapTool,
} from "./types";

interface OfflineCampusTwinProps {
  layers: AegisMapLayers;
  flood: FloodVisualData;
  incidents: AegisIncident[];
  externalOverlays: AegisExternalOverlay[];
  selection: AegisMapSelection;
  draftArea: AegisCoordinate[];
  visibility: Record<AegisMapLayerKey, boolean>;
  waterVerticalExaggeration: number;
  tool: AegisMapTool;
  onMapClick: (coordinate: AegisCoordinate) => void;
  displayMode?: "continuity" | "operational";
  buildings?: FeatureCollection<Polygon, {
    name?: string;
    function?: string;
    heightM?: number;
    damageBand?: string;
    damageIndex?: number;
    floorsAffected?: number;
    currentExternalDepthM?: number;
  }>;
}

interface TwinProjection {
  width: number;
  height: number;
  scale: number;
  ratio: number;
}

const longitudeMeters = 111_320 * Math.cos(EIT_FARIDABAD[1] * Math.PI / 180);

function localMeters(coordinate: Position): [eastM: number, northM: number] {
  return [
    (coordinate[0] - EIT_FARIDABAD[0]) * longitudeMeters,
    (coordinate[1] - EIT_FARIDABAD[1]) * 111_320,
  ];
}

function project(
  coordinate: Position,
  elevationM: number,
  projection: TwinProjection,
): [number, number] {
  const [eastM, northM] = localMeters(coordinate);
  return [
    projection.width * 0.5 + (eastM - northM) * projection.scale * 0.72,
    projection.height * 0.53 + (eastM + northM) * projection.scale * 0.31 - elevationM * projection.scale * 1.18,
  ];
}

function inverseProject(x: number, y: number, projection: TwinProjection): AegisCoordinate {
  const diagonalX = (x - projection.width * 0.5) / (projection.scale * 0.72);
  const diagonalY = (y - projection.height * 0.53) / (projection.scale * 0.31);
  const eastM = (diagonalX + diagonalY) / 2;
  const northM = (diagonalY - diagonalX) / 2;
  return [
    EIT_FARIDABAD[0] + eastM / longitudeMeters,
    EIT_FARIDABAD[1] + northM / 111_320,
  ];
}

function footprintArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const [x1, y1] = localMeters(ring[index]);
    const [x2, y2] = localMeters(ring[index + 1]);
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

function traceRing(
  context: CanvasRenderingContext2D,
  ring: Position[],
  elevationM: number,
  projection: TwinProjection,
): void {
  context.beginPath();
  ring.forEach((coordinate, index) => {
    const [x, y] = project(coordinate, elevationM, projection);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
  context.closePath();
}

function forEachLine(
  collection: FeatureCollection<LineString | MultiLineString> | undefined,
  callback: (line: Position[], properties: GeoJsonProperties) => void,
): void {
  collection?.features.forEach((feature) => {
    if (feature.geometry.type === "LineString") {
      callback(feature.geometry.coordinates, feature.properties);
    } else {
      feature.geometry.coordinates.forEach((line) => callback(line, feature.properties));
    }
  });
}

function forEachPolygon(
  collection: FeatureCollection<Polygon | MultiPolygon> | undefined,
  callback: (ring: Position[], properties: GeoJsonProperties) => void,
): void {
  collection?.features.forEach((feature) => {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    polygons.forEach((polygon) => {
      const ring = polygon[0];
      if (ring?.length >= 3) callback(ring, feature.properties);
    });
  });
}

function drawPolygonLayer(
  context: CanvasRenderingContext2D,
  collection: FeatureCollection<Polygon | MultiPolygon> | undefined,
  projection: TwinProjection,
  fill: string,
  stroke: string,
  elevationM = 7,
): void {
  forEachPolygon(collection, (ring) => {
    traceRing(context, ring, elevationM, projection);
    context.fillStyle = fill;
    context.fill();
    context.strokeStyle = stroke;
    context.lineWidth = 1.6;
    context.stroke();
  });
}

function drawLine(
  context: CanvasRenderingContext2D,
  line: Position[],
  elevationM: number,
  projection: TwinProjection,
): void {
  context.beginPath();
  line.forEach((coordinate, index) => {
    const [x, y] = project(coordinate, elevationM, projection);
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  });
}

function drawPointCollection(
  context: CanvasRenderingContext2D,
  collection: FeatureCollection<Point> | undefined,
  color: string,
  label: string,
  projection: TwinProjection,
): void {
  collection?.features.forEach((feature) => {
    const [x, y] = project(feature.geometry.coordinates, 8, projection);
    context.beginPath();
    context.arc(x, y, 6.5, 0, Math.PI * 2);
    context.fillStyle = "rgba(4, 14, 19, 0.94)";
    context.fill();
    context.strokeStyle = color;
    context.lineWidth = 1.5;
    context.stroke();
    context.fillStyle = color;
    context.font = "700 8px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(label, x, y + 0.5);
  });
}

function buildingColor(
  use: string,
  damageBand = "none",
): { roof: string; side: string; edge: string } {
  if (damageBand === "critical" || damageBand === "severe") {
    return { roof: "#b51f35", side: "#5d121e", edge: "#ff6878" };
  }
  if (damageBand === "moderate") {
    return { roof: "#a94f2e", side: "#54291f", edge: "#ff9d67" };
  }
  if (damageBand === "minor") {
    return { roof: "#8a7138", side: "#41371f", edge: "#e8c66c" };
  }
  if (use === "command") return { roof: "#2f8092", side: "#173f49", edge: "#78e9fa" };
  if (use === "residential") return { roof: "#566873", side: "#283740", edge: "#9cb5be" };
  if (use === "laboratory" || use === "industrial") {
    return { roof: "#495d66", side: "#22343c", edge: "#7eb7c2" };
  }
  if (use === "amenity" || use === "assembly") {
    return { roof: "#62635d", side: "#30342f", edge: "#b6bea7" };
  }
  return { roof: "#3e4244", side: "#202426", edge: "#737b7e" };
}

export function OfflineCampusTwin({
  layers,
  flood,
  incidents,
  externalOverlays,
  selection,
  draftArea,
  visibility,
  waterVerticalExaggeration,
  tool,
  onMapClick,
  displayMode = "continuity",
  buildings,
}: OfflineCampusTwinProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    let frameId = 0;
    let lastPaint = 0;
    let disposed = false;

    const paint = (timestamp: number) => {
      if (disposed) return;
      if (document.visibilityState !== "visible" || timestamp - lastPaint < 50) {
        frameId = window.requestAnimationFrame(paint);
        return;
      }
      lastPaint = timestamp;

      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, rect.width);
      const height = Math.max(1, rect.height);
      const pixelWidth = Math.round(width * ratio);
      const pixelHeight = Math.round(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);

      const projection: TwinProjection = {
        width,
        height,
        scale: Math.min(width / 940, height / 600) * 1.48,
        ratio,
      };

      const background = context.createLinearGradient(0, 0, 0, height);
      background.addColorStop(0, "#050607");
      background.addColorStop(0.55, "#090a0b");
      background.addColorStop(1, "#020303");
      context.fillStyle = background;
      context.fillRect(0, 0, width, height);

      const horizonGlow = context.createRadialGradient(
        width * 0.52,
        height * 0.22,
        10,
        width * 0.52,
        height * 0.22,
        width * 0.52,
      );
      horizonGlow.addColorStop(0, "rgba(150, 135, 96, 0.12)");
      horizonGlow.addColorStop(1, "rgba(6, 7, 8, 0)");
      context.fillStyle = horizonGlow;
      context.fillRect(0, 0, width, height);

      const campusRing = EIT_CAMPUS_BOUNDARY.features[0].geometry.coordinates[0];
      const campusShadow = campusRing.map((coordinate) => {
        const [x, y] = project(coordinate, -3, projection);
        return [x + 14, y + 18] as [number, number];
      });
      context.beginPath();
      campusShadow.forEach(([x, y], index) => {
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.closePath();
      context.fillStyle = "rgba(0, 0, 0, 0.34)";
      context.fill();

      traceRing(context, campusRing, 0, projection);
      const ground = context.createLinearGradient(width * 0.2, height * 0.2, width * 0.8, height * 0.8);
      ground.addColorStop(0, "#171a18");
      ground.addColorStop(0.52, "#111311");
      ground.addColorStop(1, "#0b0c0c");
      context.fillStyle = ground;
      context.fill();
      context.strokeStyle = "rgba(92, 197, 210, 0.28)";
      context.lineWidth = 1.2;
      context.stroke();

      context.save();
      traceRing(context, campusRing, 0, projection);
      context.clip();
      context.strokeStyle = "rgba(94, 183, 193, 0.075)";
      context.lineWidth = 1;
      for (let ring = 1; ring <= 7; ring += 1) {
        context.beginPath();
        context.ellipse(
          width * 0.5,
          height * 0.53,
          ring * 72 * projection.scale,
          ring * 31 * projection.scale,
          0,
          0,
          Math.PI * 2,
        );
        context.stroke();
      }
      context.restore();

      EIT_CAMPUS_ROADS.features.forEach((feature) => {
        drawLine(context, feature.geometry.coordinates, 0.6, projection);
        context.strokeStyle = "rgba(3, 9, 12, 0.85)";
        context.lineWidth = feature.properties.class === "campus-road" ? 9 : 6;
        context.lineCap = "round";
        context.lineJoin = "round";
        context.stroke();
        drawLine(context, feature.geometry.coordinates, 0.7, projection);
        context.strokeStyle = feature.properties.class === "walkway"
          ? "rgba(137, 174, 174, 0.45)"
          : "rgba(86, 116, 119, 0.72)";
        context.lineWidth = feature.properties.class === "campus-road" ? 5 : 3;
        context.stroke();
      });

      if (visibility.floodDepth) {
        context.save();
        traceRing(context, campusRing, 0, projection);
        context.clip();
        flood.surface.features.forEach((feature) => {
          const waterHeight = Number(feature.properties.depthM) * waterVerticalExaggeration;
          traceRing(context, feature.geometry.coordinates[0], waterHeight, projection);
          const water = context.createLinearGradient(0, height * 0.35, width, height * 0.75);
          water.addColorStop(0, "rgba(47, 203, 226, 0.29)");
          water.addColorStop(0.55, "rgba(30, 123, 194, 0.35)");
          water.addColorStop(1, "rgba(74, 63, 177, 0.3)");
          context.fillStyle = water;
          context.fill();
          context.strokeStyle = `rgba(153, 245, 255, ${0.62 + Math.sin(timestamp / 420) * 0.16})`;
          context.lineWidth = 2.2 + Math.sin(timestamp / 500) * 0.45;
          context.setLineDash([9, 7]);
          context.lineDashOffset = -timestamp / 55;
          context.stroke();
          context.setLineDash([]);
        });
        context.restore();
      }

      const buildingFeatures = buildings?.features ?? EIT_CAMPUS_BUILDINGS.features;
      const labelledBuildings = new Set(
        [...buildingFeatures]
          .sort((first, second) => (
            footprintArea(second.geometry.coordinates[0]) - footprintArea(first.geometry.coordinates[0])
          ))
          .slice(0, 6),
      );
      const orderedBuildings = [...buildingFeatures].sort((first, second) => {
        const firstPoint = first.geometry.coordinates[0][0];
        const secondPoint = second.geometry.coordinates[0][0];
        return project(firstPoint, 0, projection)[1] - project(secondPoint, 0, projection)[1];
      });
      orderedBuildings.forEach((feature, buildingIndex) => {
        const ring = feature.geometry.coordinates[0];
        const heightM = Number(feature.properties.heightM ?? 10);
        const use = String(feature.properties.function ?? ("use" in feature.properties ? feature.properties.use : "building"));
        const damageBand = String(feature.properties.damageBand ?? "none");
        const colors = buildingColor(use, damageBand);
        const base = ring.map((coordinate) => project(coordinate, 0, projection));
        const roof = ring.map((coordinate) => project(coordinate, heightM, projection));

        for (let index = 0; index < ring.length - 1; index += 1) {
          context.beginPath();
          context.moveTo(base[index][0], base[index][1]);
          context.lineTo(base[index + 1][0], base[index + 1][1]);
          context.lineTo(roof[index + 1][0], roof[index + 1][1]);
          context.lineTo(roof[index][0], roof[index][1]);
          context.closePath();
          context.fillStyle = index % 2 === 0 ? colors.side : `${colors.side}d8`;
          context.fill();
          context.strokeStyle = "rgba(116, 172, 182, 0.14)";
          context.lineWidth = 0.75;
          context.stroke();
        }

        context.beginPath();
        roof.forEach(([x, y], index) => {
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
        context.fillStyle = colors.roof;
        context.fill();
        context.strokeStyle = colors.edge;
        context.lineWidth = use === "command" || damageBand !== "none" ? 1.7 : 0.9;
        context.stroke();

        const damageIndex = Number(feature.properties.damageIndex ?? 0);
        const sourceName = String(feature.properties.name ?? ("shortName" in feature.properties ? feature.properties.shortName : "BUILDING"));
        const buildingName = /imported building footprint/i.test(sourceName)
          ? `OSM BLOCK ${String(buildingIndex + 1).padStart(2, "0")}`
          : sourceName;
        if (labelledBuildings.has(feature)) {
          const labelPoint = roof[Math.floor(roof.length / 2)] ?? roof[0];
          context.font = "700 9px system-ui, sans-serif";
          context.textAlign = "center";
          context.textBaseline = "bottom";
          context.fillStyle = damageIndex >= 0.08 ? "#ffe9e9" : "rgba(225, 246, 249, 0.78)";
          context.fillText(buildingName.slice(0, 22), labelPoint[0], labelPoint[1] - 4);
          if (damageIndex >= 0.08) {
            context.font = "700 8px ui-monospace, monospace";
            context.fillStyle = "#ff7d88";
            const depth = Number(feature.properties.currentExternalDepthM ?? 0);
            const floors = Number(feature.properties.floorsAffected ?? 0);
            context.fillText(`${depth.toFixed(2)}m · ${floors}F`, labelPoint[0], labelPoint[1] + 8);
          }
        }
      });

      context.save();
      traceRing(context, campusRing, 0, projection);
      context.clip();

      if (visibility.safeZones) {
        drawPolygonLayer(context, layers.safeZones, projection, "rgba(51, 202, 117, 0.14)", "#52da8d");
        drawPolygonLayer(context, layers.responseCoverageZones, projection, "rgba(36, 190, 103, 0.12)", "#45df87", 7.5);
      }
      if (visibility.unavailableZones) {
        drawPolygonLayer(context, layers.unavailableZones, projection, "rgba(100, 105, 108, 0.38)", "#a0a5a8");
      }
      if (visibility.warnings) {
        drawPolygonLayer(context, layers.warnings, projection, "rgba(233, 174, 69, 0.18)", "#efbb55");
      }
      if (visibility.damage) {
        drawPolygonLayer(context, layers.damage, projection, "rgba(239, 45, 64, 0.46)", "#ff5664", 8);
      }
      if (visibility.utilityImpact) {
        drawPolygonLayer(context, layers.utilityImpact, projection, "rgba(224, 108, 59, 0.3)", "#ff9660", 8.5);
      }
      if (visibility.populationImpact) {
        drawPolygonLayer(context, layers.populationImpact, projection, "rgba(239, 183, 72, 0.18)", "#edbd64", 9);
      }
      if (visibility.recovery) {
        drawPolygonLayer(context, layers.recovery, projection, "rgba(85, 196, 126, 0.14)", "#8cd5a7", 9.5);
      }
      if (visibility.confidence) {
        context.setLineDash([4, 4]);
        drawPolygonLayer(context, layers.confidence, projection, "rgba(255,255,255,0.02)", "#d4d9db", 10);
        context.setLineDash([]);
      }
      if (visibility.roads && displayMode === "continuity") {
        forEachLine(layers.roads, (line, properties) => {
          drawLine(context, line, 2.2, projection);
          context.strokeStyle = properties?.status === "closed"
            ? "#777d81"
            : properties?.status === "restricted"
              ? "#efc15a"
              : "rgba(201, 225, 230, 0.76)";
          context.lineWidth = 2.2;
          context.setLineDash([]);
          context.stroke();
        });
      }

      if (visibility.floodFlow && displayMode === "continuity") {
        forEachLine(layers.floodFlow, (line) => {
          drawLine(context, line, 3.2, projection);
          context.strokeStyle = "rgba(186, 249, 255, 0.92)";
          context.lineWidth = 1.6;
          context.setLineDash([5, 8]);
          context.lineDashOffset = -timestamp / 44;
          context.stroke();
        });
      }

      if (visibility.evacuationRoutes) {
        forEachLine(layers.evacuationRoutes, (line, properties) => {
          drawLine(context, line, 5, projection);
          context.strokeStyle = "rgba(1, 9, 12, 0.9)";
          context.lineWidth = 7;
          context.setLineDash([]);
          context.stroke();
          drawLine(context, line, 5.2, projection);
          context.strokeStyle = properties?.status === "blocked"
            ? "#777d81"
            : properties?.status === "warning"
              ? "#f2c256"
              : "#2f8fff";
          context.lineWidth = 4.8;
          context.setLineDash([12, 7]);
          context.lineDashOffset = -timestamp / 58;
          context.stroke();

          const moverProgress = ((timestamp / 4_500) % 1 + 1) % 1;
          const segmentIndex = Math.min(line.length - 2, Math.floor(moverProgress * (line.length - 1)));
          const segmentProgress = moverProgress * (line.length - 1) - segmentIndex;
          const coordinate: Position = [
            line[segmentIndex][0] + (line[segmentIndex + 1][0] - line[segmentIndex][0]) * segmentProgress,
            line[segmentIndex][1] + (line[segmentIndex + 1][1] - line[segmentIndex][1]) * segmentProgress,
          ];
          const [x, y] = project(coordinate, 7, projection);
          context.beginPath();
          context.arc(x, y, 4.5, 0, Math.PI * 2);
          context.fillStyle = "#effff8";
          context.fill();
          context.strokeStyle = "#2f8fff";
          context.lineWidth = 2;
          context.stroke();
        });
      }

      context.restore();

      context.setLineDash([]);
      if (visibility.resources) drawPointCollection(context, layers.resources, "#f3ca58", "R", projection);
      if (visibility.hospitals) drawPointCollection(context, layers.hospitals, "#ff687b", "H", projection);
      if (visibility.shelters) drawPointCollection(context, layers.shelters, "#97e878", "S", projection);

      if (selection.area) {
        traceRing(context, selection.area.geometry.coordinates[0], 5.5, projection);
        context.fillStyle = "rgba(89, 225, 245, 0.07)";
        context.fill();
        context.strokeStyle = "#6ee7f7";
        context.lineWidth = 1.5;
        context.setLineDash([5, 5]);
        context.stroke();
      }
      if (draftArea.length > 1) {
        drawLine(context, draftArea, 6, projection);
        context.strokeStyle = "#78eafb";
        context.lineWidth = 1.6;
        context.setLineDash([4, 5]);
        context.stroke();
      }

      selection.points.forEach((point) => {
        const [x, y] = project(point.coordinates, 8, projection);
        context.beginPath();
        context.arc(x, y, 6.5, 0, Math.PI * 2);
        context.fillStyle = point.role === "origin"
          ? "#55d7f1"
          : point.role === "destination"
            ? "#60e8ae"
            : "#ff5d72";
        context.fill();
        context.strokeStyle = "#f2fdff";
        context.lineWidth = 1.2;
        context.stroke();
      });

      externalOverlays.forEach((overlay) => {
        const [x, y] = project(overlay.coordinates, 10, projection);
        context.beginPath();
        context.arc(x, y, 8, 0, Math.PI * 2);
        context.fillStyle = "rgba(4, 14, 19, 0.9)";
        context.fill();
        context.strokeStyle = overlay.color ?? "#6fe4f4";
        context.lineWidth = 1.4;
        context.stroke();
        context.font = "600 8px system-ui, sans-serif";
        context.fillStyle = "rgba(230, 248, 251, 0.82)";
        context.textAlign = "center";
        context.fillText(overlay.label, x, y - 13);
      });

      if (visibility.incidents) {
        incidents.forEach((incident, index) => {
          const [x, y] = project(incident.coordinates, 13, projection);
          const pulse = 10 + ((timestamp / 48 + index * 7) % 17);
          context.beginPath();
          context.arc(x, y, pulse, 0, Math.PI * 2);
          context.strokeStyle = "rgba(255, 74, 100, 0.32)";
          context.lineWidth = 1;
          context.stroke();
          context.beginPath();
          context.arc(x, y, 5.5, 0, Math.PI * 2);
          context.fillStyle = incident.severity === "critical" ? "#ff3858" : "#ff7b4d";
          context.fill();
          context.strokeStyle = "#f7fbff";
          context.stroke();
        });
      }

      context.setLineDash([]);
      frameId = window.requestAnimationFrame(paint);
    };

    frameId = window.requestAnimationFrame(paint);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frameId);
    };
  }, [
    draftArea,
    externalOverlays,
    flood,
    incidents,
    layers,
    selection,
    visibility,
    waterVerticalExaggeration,
    buildings,
    displayMode,
  ]);

  const handleClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const projection: TwinProjection = {
      width: rect.width,
      height: rect.height,
      scale: Math.min(rect.width / 940, rect.height / 600) * 1.48,
      ratio: 1,
    };
    onMapClick(inverseProject(event.clientX - rect.left, event.clientY - rect.top, projection));
  };

  return (
    <div className={styles.offlineTwin}>
      <canvas
        ref={canvasRef}
        className={styles.offlineTwinCanvas}
        onClick={handleClick}
        aria-label={`${displayMode === "operational" ? "EIT OSM isometric operational twin" : "Offline EIT continuity twin"}. Active tool: ${tool}`}
      />
      <div className={styles.offlineTwinLabel} aria-hidden="true">
        <span>{displayMode === "operational" ? "OSM FOOTPRINT SITE MODEL" : "LOCAL CONTINUITY MODEL"}</span>
        <strong>{displayMode === "operational" ? "EIT ISOMETRIC OPERATIONAL TWIN" : "EIT ISOMETRIC DIGITAL TWIN"}</strong>
      </div>
      <div className={styles.offlineCompass} aria-hidden="true">
        <span>N</span>
        <i />
      </div>
    </div>
  );
}
