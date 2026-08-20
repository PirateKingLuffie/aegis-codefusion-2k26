import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const W = 1280;
const H = 720;
const ROOT = "E:/CodeFusion EIT Hackathon/AEGIS";
const ASSET_DIR = `${ROOT}/artifacts/ppt-assets`;
const OUTPUT_DIR = `${ROOT}/artifacts/presentation`;
const RENDER_DIR = `${ROOT}/artifacts/ppt-build/rendered`;
const OUTPUT_PPTX = `${OUTPUT_DIR}/AEGIS_CodeFusion_2K26.pptx`;

const C = {
  bg: "#050607",
  panel: "#0B0D0E",
  panel2: "#111416",
  line: "#272C2F",
  line2: "#3A4044",
  text: "#F2F2EE",
  muted: "#92989C",
  dim: "#60676B",
  red: "#FF4055",
  blue: "#2F8FFF",
  green: "#3DDC84",
  gray: "#73787C",
  amber: "#D4A64E",
};

const FONT = "Aptos";
const FONT_DISPLAY = "Aptos Display";

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function shape(slide, geometry, position, fill = "none", line = { style: "solid", fill: "none", width: 0 }, options = {}) {
  return slide.shapes.add({ geometry, position, fill, line, ...options });
}

function text(slide, value, x, y, width, height, size = 20, color = C.text, options = {}) {
  const box = shape(slide, "textbox", { left: x, top: y, width, height }, "none");
  box.text = value;
  box.text.style = {
    fontFamily: options.fontFamily ?? FONT,
    fontSize: size,
    bold: options.bold ?? false,
    color,
    alignment: options.align ?? "left",
    verticalAlignment: options.valign ?? "top",
    ...options.style,
  };
  return box;
}

function rect(slide, x, y, width, height, fill = C.panel, stroke = C.line, radius = 10) {
  return shape(
    slide,
    "roundRect",
    { left: x, top: y, width, height },
    fill,
    { style: "solid", fill: stroke, width: 1 },
    { borderRadius: radius },
  );
}

function line(slide, x, y, width, height, color = C.line, weight = 1, style = "solid") {
  return shape(slide, "line", { left: x, top: y, width, height }, "none", { style, fill: color, width: weight });
}

function dot(slide, x, y, diameter, color) {
  return shape(slide, "ellipse", { left: x, top: y, width: diameter, height: diameter }, color, { style: "solid", fill: color, width: 0 });
}

function label(slide, value, x, y, width, color = C.muted) {
  return text(slide, value.toUpperCase(), x, y, width, 22, 12, color, { bold: true });
}

function addHeader(slide, index, title, kicker = "AEGIS") {
  label(slide, kicker, 64, 38, 340, C.muted);
  text(slide, title, 64, 66, 1100, 66, 36, C.text, { bold: true, fontFamily: FONT_DISPLAY });
  text(slide, String(index).padStart(2, "0"), 1170, 42, 46, 24, 12, C.dim, { bold: true, align: "right" });
  line(slide, 64, 132, 1152, 0, C.line, 1);
}

function addFooter(slide, index, evidence = "AEGIS CONCEPT") {
  line(slide, 64, 674, 1152, 0, C.line, 1);
  text(slide, evidence, 64, 682, 500, 18, 10, C.dim, { bold: true });
  text(slide, `CODEFUSION 2K26  /  ${String(index).padStart(2, "0")}`, 900, 682, 316, 18, 10, C.dim, { bold: true, align: "right" });
}

function addNotes(slide, talkingPoints, sources = []) {
  void slide;
  void talkingPoints;
  void sources;
}

async function imageBytes(fileName) {
  try {
    const bytes = await fs.readFile(path.join(ASSET_DIR, fileName));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  } catch {
    return null;
  }
}

async function addScreenshot(slide, fileName, x, y, width, height, alt, options = {}) {
  const bytes = await imageBytes(fileName);
  rect(slide, x - 2, y - 2, width + 4, height + 4, C.panel2, options.stroke ?? C.line2, options.radius ?? 10);
  if (!bytes) {
    rect(slide, x, y, width, height, C.panel, C.line, options.radius ?? 8);
    label(slide, "ACTUAL AEGIS CAPTURE", x + 24, y + 24, width - 48, C.dim);
    text(slide, "Screenshot unavailable during export", x + 24, y + height / 2 - 18, width - 48, 40, 20, C.muted, { align: "center" });
    return null;
  }
  return slide.images.add({
    blob: bytes,
    contentType: "image/png",
    alt,
    fit: options.fit ?? "cover",
    position: { left: x, top: y, width, height },
    geometry: "roundRect",
    borderRadius: options.radius ?? 8,
    crop: options.crop,
  });
}

function bullet(slide, value, x, y, width, color = C.text, accent = C.gray, size = 17) {
  dot(slide, x, y + 8, 6, accent);
  return text(slide, value, x + 18, y, width - 18, 44, size, color);
}

function metric(slide, labelText, value, detail, x, y, width, accent = C.red) {
  line(slide, x, y, width, 0, C.line2, 1);
  label(slide, labelText, x, y + 14, width, C.muted);
  text(slide, value, x, y + 43, width, 52, 31, C.text, { bold: true, fontFamily: FONT_DISPLAY });
  text(slide, detail, x, y + 94, width, 34, 12, C.muted);
  dot(slide, x + width - 9, y + 17, 7, accent);
}

function stateTag(slide, value, x, y, width, color) {
  line(slide, x, y + 4, 3, 22, color, 3);
  label(slide, value, x + 14, y, width - 14, color);
}

function addStage(slide, number, titleValue, detail, x, y, width, accent) {
  text(slide, String(number).padStart(2, "0"), x, y, 34, 24, 11, accent, { bold: true });
  line(slide, x + 42, y + 9, width - 42, 0, C.line2, 1);
  text(slide, titleValue, x, y + 32, width, 30, 18, C.text, { bold: true });
  text(slide, detail, x, y + 68, width, 60, 14, C.muted);
}

async function main() {
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(RENDER_DIR, { recursive: true });

  const deck = Presentation.create({ slideSize: { width: W, height: H } });
  const INCLUDE_DETAILED_EXAMPLES = false;

  // 01 — Cover
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    await addScreenshot(slide, "01-world.png", 610, 0, 670, 720, "AEGIS world incident globe", {
      radius: 0,
      crop: { left: 0.18, top: 0.3, right: 0.04, bottom: 0.04 },
    });
    shape(slide, "rect", { left: 610, top: 0, width: 670, height: 118 }, "#071016", { style: "solid", fill: "#071016", width: 0 });
    shape(slide, "rect", { left: 590, top: 0, width: 40, height: 720 }, C.bg, { style: "solid", fill: C.bg, width: 0 });
    dot(slide, 68, 67, 16, C.red);
    shape(slide, "ellipse", { left: 61, top: 60, width: 30, height: 30 }, "none", { style: "solid", fill: C.line2, width: 2 });
    label(slide, "CodeFusion 2K26", 112, 63, 350, C.muted);
    text(slide, "AEGIS", 64, 177, 520, 104, 72, C.text, { bold: true, fontFamily: FONT_DISPLAY });
    text(slide, "Adaptive Emergency Geospatial\nIntelligence & Simulation", 68, 286, 500, 88, 26, C.muted, { bold: false });
    line(slide, 68, 410, 105, 0, C.red, 4);
    text(slide, "See the next consequence.\nChoose the best intervention.", 68, 438, 492, 104, 27, C.text, { bold: true });
    label(slide, "Team X", 68, 611, 160, C.dim);
    text(slide, "Sankalp Gupta  /  Team Leader", 68, 638, 440, 28, 16, C.text, { bold: true });
    text(slide, "CodeFusion 2K26 Hackathon", 68, 670, 500, 22, 13, C.muted);
    addNotes(slide, "AEGIS is a 3D emergency digital twin and decision-support system. It does not stop at showing a hazard; it predicts consequences, tests interventions, and explains the best constrained response for human approval.", ["AEGIS prototype capture, 2026-08-10.", "https://api.unstop.com/hackathons/codefusion-2k26-echelon-institute-of-technology-faridabad-1678346"]);
  }

  // 02 — Problem
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 2, "Disasters become systems failures, not isolated events.", "THE PROBLEM");
    text(slide, "A hazard triggers consequences across roads, hospitals, shelters and response capacity—while information remains fragmented.", 64, 154, 860, 54, 19, C.muted);
    const nodes = [
      ["HAZARD", "Flood depth rises", C.red],
      ["ACCESS", "Roads become unusable", C.gray],
      ["RESPONSE", "Emergency ETA increases", C.amber],
      ["HEALTH", "Hospital access falls", C.red],
      ["CAPACITY", "Shelter demand rises", C.amber],
      ["PEOPLE", "Risk compounds", C.red],
    ];
    nodes.forEach((item, index) => {
      const x = 64 + index * 190;
      rect(slide, x, 282, 162, 164, C.panel, C.line, 8);
      label(slide, item[0], x + 18, 302, 126, item[2]);
      text(slide, item[1], x + 18, 342, 126, 68, 18, C.text, { bold: true });
      text(slide, `T+${String(index * 8).padStart(2, "0")}`, x + 18, 412, 126, 20, 11, C.dim, { bold: true });
      if (index < nodes.length - 1) {
        shape(slide, "rightArrow", { left: x + 168, top: 351, width: 16, height: 24 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
      }
    });
    text(slide, "The operating question is not only “What is happening?”", 64, 520, 550, 40, 23, C.text, { bold: true });
    text(slide, "It is “What fails next—and what action produces the best outcome?”", 64, 568, 990, 46, 27, C.red, { bold: true });
    addFooter(slide, 2, "PROBLEM FRAMING  /  CASCADE RISK");
    addNotes(slide, "Emergency response is a dependency problem. The first event can make roads unusable, delay responders, reduce hospital access, and overload shelters. AEGIS is designed around those chains rather than treating each map layer independently.");
  }

  // 03 — Gap
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 3, "A dashboard shows the present. AEGIS computes the next decision.", "THE GAP");
    const rows = [
      ["MAP / DASHBOARD", "Shows alerts and layers", "Stops at awareness", C.gray],
      ["BASIC SIMULATOR", "Animates one hazard", "Rarely models response constraints", C.amber],
      ["GENERIC AI", "Produces fluent text", "Can invent unavailable facts", C.red],
      ["AEGIS", "Simulates → traces → optimizes → explains", "Ends with a human-approved plan", C.green],
    ];
    label(slide, "SYSTEM", 64, 166, 240, C.dim);
    label(slide, "WHAT IT DOES", 322, 166, 420, C.dim);
    label(slide, "WHERE IT STOPS", 774, 166, 442, C.dim);
    rows.forEach((row, index) => {
      const y = 210 + index * 94;
      line(slide, 64, y + 76, 1152, 0, index === 3 ? C.green : C.line, index === 3 ? 2 : 1);
      line(slide, 64, y + 5, 4, 46, row[3], 4);
      text(slide, row[0], 84, y, 220, 30, 16, row[3], { bold: true });
      text(slide, row[1], 322, y, 420, 54, 20, C.text, { bold: index === 3 });
      text(slide, row[2], 774, y, 430, 54, 18, index === 3 ? C.text : C.muted, { bold: index === 3 });
    });
    text(slide, "The novelty is the closed operational loop—not any single map, model or chatbot.", 64, 602, 1080, 40, 24, C.text, { bold: true });
    addFooter(slide, 3);
    addNotes(slide, "This comparison avoids the claim that every existing product is weak. The point is narrower: AEGIS connects capabilities that are usually separated, then makes the recommendation traceable and reversible.");
  }

  // 04 — Loop
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 4, "One operational loop turns evidence into approved action.", "THE AEGIS CONCEPT");
    const stages = [
      ["OBSERVE", "Maps, weather, incidents", C.blue],
      ["FUSE", "Normalize time, place, confidence", C.blue],
      ["SIMULATE", "Advance hazard state", C.red],
      ["PREDICT", "Calculate exposure and access", C.red],
      ["TRACE", "Follow cascading failures", C.amber],
      ["TEST", "Branch what-if scenarios", C.amber],
      ["OPTIMIZE", "Rank routes and resources", C.green],
      ["APPROVE", "Human accepts or changes", C.green],
    ];
    stages.forEach((stage, index) => {
      const row = index < 4 ? 0 : 1;
      const col = index % 4;
      const x = 64 + col * 292;
      const y = 180 + row * 205;
      addStage(slide, index + 1, stage[0], stage[1], x, y, 250, stage[2]);
      if (col < 3) {
        line(slide, x + 255, y + 51, 26, 0, C.line2, 2);
        shape(slide, "rightArrow", { left: x + 270, top: y + 44, width: 12, height: 14 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
      }
    });
    line(slide, 64, 570, 1152, 0, C.line2, 1);
    text(slide, "NUMERICAL MODEL", 64, 592, 200, 20, 11, C.red, { bold: true });
    text(slide, "Deterministic simulation + optimization", 64, 616, 430, 28, 18, C.text, { bold: true });
    text(slide, "AI ROLE", 660, 592, 150, 20, 11, C.blue, { bold: true });
    text(slide, "Query and explain structured state", 660, 616, 500, 28, 18, C.text, { bold: true });
    addFooter(slide, 4, "CORE LOOP  /  HUMAN CONTROL PRESERVED");
    addNotes(slide, "The numerical simulation and route optimization are deterministic. The language model is downstream: it queries the state, explains the recommendation, and admits when evidence is missing. The operator remains responsible for approval.");
  }

  // 05 — EIT scenario
  if (INCLUDE_DETAILED_EXAMPLES) {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 5, "The first scenario begins at Echelon Institute of Technology.", "FLAGSHIP USE CASE");
    await addScreenshot(slide, "02-campus-flood.png", 582, 162, 634, 454, "AEGIS EIT flood scenario");
    stateTag(slide, "DETERMINISTIC EXERCISE", 64, 164, 300, C.red);
    const steps = [
      "Select EIT from the world map",
      "Place the flood source and timeline",
      "Simulate depth, access and exposure",
      "Inspect affected roads and buildings",
      "Generate a capacity-aware evacuation",
      "Compare interventions before approval",
    ];
    steps.forEach((item, index) => {
      text(slide, String(index + 1).padStart(2, "0"), 64, 220 + index * 58, 34, 24, 11, index < 3 ? C.blue : C.green, { bold: true });
      text(slide, item, 111, 214 + index * 58, 420, 38, 18, C.text, { bold: index === 5 });
    });
    rect(slide, 64, 586, 454, 62, C.panel, C.line, 6);
    text(slide, "SIMULATED SCENARIO — NOT A REAL CAMPUS INCIDENT", 84, 605, 414, 24, 13, C.red, { bold: true, align: "center" });
    addFooter(slide, 5, "EIT FARIDABAD  /  FLAGSHIP FLOOD SCENARIO");
    addNotes(slide, "The campus scenario makes the idea concrete: choose a real location, define conditions, run the model, inspect consequences, and generate a response. It is always labelled as an exercise rather than a claim that flooding has occurred at EIT.", ["https://eitfaridabad.com/", "AEGIS prototype capture, 2026-08-10."]);
  }

  // 06 — World twin
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 5, "The map is the operational surface.", "GLOBAL 3D DIGITAL TWIN");
    await addScreenshot(slide, "01-world.png", 64, 162, 790, 452, "AEGIS global incident globe", {
      crop: { left: 0.18, top: 0.3, right: 0.04, bottom: 0.04 },
    });
    shape(slide, "rect", { left: 64, top: 162, width: 790, height: 108 }, "#071016", { style: "solid", fill: "#071016", width: 0 });
    label(slide, "WORLD VIEW  ·  SELECT ANY LOCATION", 92, 198, 420, C.blue);
    label(slide, "OPERATIONAL LAYERS", 902, 166, 300, C.muted);
    bullet(slide, "World-to-site navigation", 902, 207, 300, C.text, C.blue, 17);
    bullet(slide, "Real roads and map context", 902, 260, 300, C.text, C.blue, 17);
    bullet(slide, "Hospitals, shelters, resources", 902, 313, 300, C.text, C.green, 17);
    bullet(slide, "Time-dependent hazard overlays", 902, 366, 300, C.text, C.red, 17);
    bullet(slide, "Selectable incident and endpoints", 902, 419, 300, C.text, C.blue, 17);
    label(slide, "COLOR SEMANTICS", 902, 497, 300, C.muted);
    const legend = [["Damage", C.red], ["Evacuation", C.blue], ["Safe", C.green], ["Unavailable", C.gray]];
    legend.forEach((item, index) => {
      dot(slide, 902, 533 + index * 28, 8, item[1]);
      text(slide, item[0], 920, 526 + index * 28, 170, 24, 14, C.text, { bold: true });
    });
    addFooter(slide, 5, "GLOBAL MAP CONTEXT  /  SIMULATED OPERATIONAL STATE");
    addNotes(slide, "AEGIS begins at world scale and moves into a selected incident area. Map context is imported from providers; hazard and operational state are overlaid from AEGIS. Google photorealistic 3D is provider-key dependent and is not claimed as active in this capture.", ["https://www.openstreetmap.org/copyright", "https://developers.google.com/maps/documentation/javascript/3d/overview", "AEGIS prototype capture, 2026-08-10."]);
  }

  // 07 — Flood model
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 6, "The flood is computed as state—not played as a video.", "DETERMINISTIC SIMULATION");
    const colW = 332;
    rect(slide, 64, 170, colW, 416, C.panel, C.line, 8);
    rect(slide, 474, 170, colW, 416, C.panel, C.line, 8);
    rect(slide, 884, 170, colW, 416, C.panel, C.line, 8);
    label(slide, "01  INPUTS", 88, 196, 270, C.blue);
    ["Rainfall + duration", "Terrain elevation", "Drainage blockage", "River / initial level", "Road + building context", "Population exposure"].forEach((item, index) => bullet(slide, item, 88, 238 + index * 45, 276, C.text, C.blue, 16));
    label(slide, "02  STATE EVOLUTION", 498, 196, 270, C.red);
    ["Depth and rise rate", "Arrival and peak time", "Flow direction + velocity", "Recession phase", "Road accessibility", "Facility access"].forEach((item, index) => bullet(slide, item, 498, 238 + index * 45, 276, C.text, C.red, 16));
    label(slide, "03  DECISION OUTPUT", 908, 196, 270, C.green);
    ["Flood extent", "Closures and isolation", "Building exposure", "Evacuation demand", "Capacity pressure", "Confidence + explanation"].forEach((item, index) => bullet(slide, item, 908, 238 + index * 45, 276, C.text, C.green, 16));
    line(slide, 397, 372, 62, 0, C.line2, 2);
    shape(slide, "rightArrow", { left: 445, top: 365, width: 14, height: 14 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
    line(slide, 807, 372, 62, 0, C.line2, 2);
    shape(slide, "rightArrow", { left: 855, top: 365, width: 14, height: 14 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
    text(slide, "Same seed + same inputs = reproducible result", 64, 610, 640, 30, 22, C.text, { bold: true });
    text(slide, "Hackathon-grade decision support—not certified hydrodynamics", 734, 612, 482, 24, 14, C.muted, { align: "right" });
    addFooter(slide, 6, "SIMULATED  /  DETERMINISTIC  /  EXPLAINABLE");
    addNotes(slide, "The prototype does not claim to replace a calibrated hydrodynamic model. It demonstrates deterministic, time-dependent state and connects that state to accessibility, exposure, and response planning. Reproducibility makes the demo testable.");
  }

  // 08 — Evacuation
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 7, "One click turns hazard state into a capacity-aware evacuation.", "RESPONSE OPTIMIZATION");
    rect(slide, 520, 162, 696, 470, C.panel, C.line, 8);
    label(slide, "CAPACITY-AWARE ROUTE LOGIC", 550, 188, 430, C.muted);
    const routeStages = [
      ["01", "SELECT", "Origin + safe destination", C.blue],
      ["02", "SCORE", "Hazard exposure + capacity + time", C.amber],
      ["03", "PLAN", "Primary route + alternatives", C.green],
    ];
    routeStages.forEach((item, index) => {
      const y = 238 + index * 98;
      text(slide, item[0], 550, y, 46, 28, 12, item[3], { bold: true });
      line(slide, 604, y + 12, 88, 0, item[3], 2);
      text(slide, item[1], 716, y - 4, 130, 26, 15, item[3], { bold: true });
      text(slide, item[2], 850, y - 5, 314, 44, 17, C.text, { bold: true });
      if (index < routeStages.length - 1) {
        text(slide, "↓", 642, y + 54, 40, 26, 18, C.line2, { bold: true, align: "center" });
      }
    });
    line(slide, 550, 535, 636, 0, C.line2, 1);
    stateTag(slide, "HUMAN APPROVAL", 550, 560, 250, C.red);
    text(slide, "Review, modify or approve before dispatch.", 790, 558, 374, 36, 17, C.text, { bold: true, align: "right" });
    stateTag(slide, "GENERATE EVACUATION PLAN", 64, 166, 390, C.blue);
    text(slide, "AEGIS does not select the shortest route.", 64, 216, 408, 58, 24, C.text, { bold: true });
    text(slide, "It ranks routes that remain usable under predicted hazard, capacity and timing constraints.", 64, 281, 408, 84, 18, C.muted);
    label(slide, "OUTPUT", 64, 397, 180, C.dim);
    bullet(slide, "Recommended + alternate routes", 64, 430, 410, C.text, C.blue, 16);
    bullet(slide, "Staged departures and clearance", 64, 474, 410, C.text, C.blue, 16);
    bullet(slide, "Shelter and vehicle allocation", 64, 518, 410, C.text, C.green, 16);
    bullet(slide, "Coverage and remaining exposure", 64, 562, 410, C.text, C.red, 16);
    addFooter(slide, 7, "ROUTE RISK  /  SAFE CAPACITY  /  STAGING  /  HUMAN APPROVAL");
    addNotes(slide, "The operator can select evacuation origins and safe destinations. The planner uses simulated road status, route risk, shelter capacity and resource availability. Live OSRM road geometry can replace prototype network geometry when the provider is available.", ["https://project-osrm.org/", "https://www.openstreetmap.org/copyright", "AEGIS prototype capture, 2026-08-10."]);
  }

  // 09 — Cascade
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 8, "Cascades reveal the failures that follow.", "CASCADE ENGINE");
    rect(slide, 64, 168, 686, 448, C.panel, C.line, 8);
    label(slide, "CASCADE VIEW", 92, 194, 260, C.muted);
    const cascadeStages = [
      ["HAZARD", "Flood depth rises", C.red],
      ["ACCESS", "Road corridor closes", C.gray],
      ["SERVICE", "Emergency ETA rises", C.amber],
    ];
    cascadeStages.forEach((item, index) => {
      const x = 92 + index * 210;
      rect(slide, x, 252, 170, 108, C.panel2, C.line, 6);
      label(slide, item[0], x + 18, 270, 134, item[2]);
      text(slide, item[1], x + 18, 306, 134, 40, 17, C.text, { bold: true });
      if (index < cascadeStages.length - 1) {
        shape(slide, "rightArrow", { left: x + 182, top: 294, width: 16, height: 22 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
      }
    });
    line(slide, 92, 412, 630, 0, C.line2, 1);
    stateTag(slide, "INTERVENE AT ACCESS", 92, 444, 270, C.green);
    text(slide, "Open an alternate corridor before the delay reaches hospitals and shelters.", 92, 488, 598, 58, 21, C.text, { bold: true });
    text(slide, "The model explains where one action can break the chain.", 92, 558, 598, 28, 15, C.muted);
    label(slide, "EXAMPLE CHAIN", 806, 173, 350, C.muted);
    const chain = [
      ["Flood depth rises", C.red],
      ["Western road closes", C.gray],
      ["Traffic shifts east", C.amber],
      ["Ambulance ETA rises", C.amber],
      ["Hospital access falls", C.red],
      ["Priority rescues delay", C.red],
    ];
    chain.forEach((item, index) => {
      const y = 214 + index * 59;
      line(slide, 810, y + 6, 3, 34, item[1], 3);
      text(slide, item[0], 832, y, 350, 34, 17, C.text, { bold: true });
      if (index < chain.length - 1) line(slide, 811, y + 40, 0, 19, C.line2, 1);
    });
    text(slide, "Each link carries location, time, severity, confidence and cause.", 806, 583, 384, 52, 16, C.muted);
    addFooter(slide, 8, "CAUSE → EFFECT → OPERATIONAL CONSEQUENCE");
    addNotes(slide, "The cascade graph explains why a recommendation changes. Instead of showing a red road in isolation, AEGIS connects the closure to congestion, response delay, facility access, and downstream population risk.", ["AEGIS prototype capture, 2026-08-10."]);
  }

  // 10 — What-if
  if (INCLUDE_DETAILED_EXAMPLES) {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 10, "Test an intervention before committing scarce resources.", "WHAT-IF ENGINE");
    await addScreenshot(slide, "07-what-if.png", 64, 170, 1152, 320, "AEGIS baseline and what-if comparison", { fit: "cover" });
    const branches = [
      ["CONTAINED", "49 mm/h", "Lower exposure", C.green],
      ["BASELINE", "74 mm/h", "Reference state", C.blue],
      ["SEVERE", "99 mm/h", "Additional closures", C.red],
    ];
    branches.forEach((branch, index) => {
      const x = 64 + index * 388;
      line(slide, x, 526, 356, 0, branch[3], 3);
      label(slide, branch[0], x, 544, 350, branch[3]);
      text(slide, branch[1], x, 576, 350, 26, 20, C.text, { bold: true });
      text(slide, branch[2], x, 611, 350, 24, 14, C.muted);
    });
    addFooter(slide, 10, "ISOLATED BRANCHES  /  BASELINE NEVER MUTATED");
    addNotes(slide, "Every branch clones the current state and changes only named assumptions. This supports questions such as increased rainfall, a failed bridge, a closed hospital, or added buses. The operator compares consequences before approving a real response.", ["AEGIS prototype capture, 2026-08-10."]);
  }

  // 11 — Live intelligence
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 9, "Live intelligence connects model output to real-world events.", "LIVE INTELLIGENCE");
    rect(slide, 64, 162, 730, 478, C.panel, C.line, 8);
    label(slide, "EVENT-TO-DECISION FLOW", 94, 188, 340, C.muted);
    const intelligenceFlow = [
      ["01", "DETECT", "Receive public hazard, weather and publisher updates.", C.blue],
      ["02", "VERIFY", "Check location, time, availability and confidence.", C.green],
      ["03", "CONNECT", "Compare the event with the selected operational area.", C.amber],
      ["04", "PRESENT", "Show a concise alert with links for human review.", C.red],
    ];
    intelligenceFlow.forEach((item, index) => {
      const y = 238 + index * 82;
      text(slide, item[0], 94, y, 42, 26, 12, item[3], { bold: true });
      line(slide, 144, y + 11, 78, 0, item[3], 2);
      text(slide, item[1], 246, y - 4, 118, 26, 15, item[3], { bold: true });
      text(slide, item[2], 374, y - 6, 370, 46, 16, C.text);
    });
    line(slide, 94, 580, 650, 0, C.line2, 1);
    text(slide, "News and footage remain external evidence—not automatic sensor truth.", 94, 598, 650, 26, 15, C.muted, { bold: true });
    label(slide, "LIVE INPUTS", 842, 166, 330, C.muted);
    [
      ["NASA EONET", "Natural-event feed", C.blue],
      ["USGS", "Earthquake events", C.blue],
      ["OPEN-METEO", "Weather context", C.green],
      ["NEWS + VIDEO", "Publisher links / metadata", C.amber],
    ].forEach((item, index) => {
      const y = 208 + index * 72;
      line(slide, 842, y, 4, 42, item[2], 4);
      text(slide, item[0], 862, y - 2, 300, 24, 16, C.text, { bold: true });
      text(slide, item[1], 862, y + 26, 300, 24, 14, C.muted);
    });
    rect(slide, 842, 518, 342, 122, C.panel, C.line, 7);
    text(slide, "LIVE  /  CACHED  /  UNAVAILABLE", 864, 538, 300, 22, 12, C.red, { bold: true });
    text(slide, "Footage is linked or embedded from publishers—never presented as an unverified live camera.", 864, 574, 292, 54, 15, C.text, { bold: true });
    addFooter(slide, 9, "EVENT + TIME + CONFIDENCE ALWAYS VISIBLE");
    addNotes(slide, "The live layer normalizes events from multiple public providers and clearly reports degraded sources. News or footage is never silently treated as sensor truth. The Assam example is source-labelled and dated.", ["https://eonet.gsfc.nasa.gov/", "https://earthquake.usgs.gov/", "https://open-meteo.com/", "https://www.youtube.com/t/terms", "AEGIS prototype capture, 2026-08-10."]);
  }

  // 12 — Copilot
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 10, "The copilot explains AEGIS state; it does not invent it.", "GROUNDED OPERATIONS COPILOT");
    rect(slide, 64, 168, 504, 146, C.panel, C.line, 8);
    label(slide, "OPERATOR QUESTION", 88, 190, 300, C.blue);
    text(slide, "“What is our biggest risk\nin the next 30 minutes?”", 88, 230, 430, 70, 25, C.text, { bold: true });
    rect(slide, 64, 360, 504, 250, C.panel, C.line, 8);
    label(slide, "STRUCTURED STATE TOOLS", 88, 382, 330, C.muted);
    ["Incident + hazard timeline", "Road and facility state", "Population and capacity", "Routes + resource assignments", "Confidence + provenance"].forEach((item, index) => bullet(slide, item, 88, 423 + index * 36, 420, C.text, C.gray, 15));
    rect(slide, 650, 168, 566, 442, C.panel, C.line, 8);
    label(slide, "GROUNDED RESPONSE", 678, 190, 300, C.green);
    const responseParts = [
      ["SUMMARY", "Western access is the immediate operational risk."],
      ["EVIDENCE", "Closure forecast + hospital access + rising depth."],
      ["PREDICTION", "Emergency ETA increases without intervention."],
      ["RECOMMENDATION", "Stage evacuation; reserve alternate corridor."],
      ["RISKS / ALTERNATIVE", "Capacity pressure; activate surge branch."],
    ];
    responseParts.forEach((item, index) => {
      const y = 230 + index * 68;
      text(slide, item[0], 678, y, 160, 22, 11, index === 3 ? C.green : C.dim, { bold: true });
      text(slide, item[1], 838, y - 3, 340, 46, 15, C.text, { bold: index === 3 });
    });
    line(slide, 606, 208, 0, 350, C.line2, 1);
    shape(slide, "rightArrow", { left: 596, top: 372, width: 21, height: 22 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
    text(slide, "LLM: query + explain", 64, 632, 340, 26, 16, C.blue, { bold: true });
    text(slide, "Simulation / optimization: deterministic", 650, 632, 566, 26, 16, C.red, { bold: true, align: "right" });
    addFooter(slide, 10, "DETERMINISTIC DECISION CORE  /  OPTIONAL HOSTED COPILOT");
    addNotes(slide, "The copilot uses tools to retrieve AEGIS entities and numerical results. It must say when a fact is unavailable. Its job is explanation and interaction, while simulation and optimization remain deterministic and testable.");
  }

  // 13 — Architecture
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 11, "Facts, simulation, optimization and AI remain deliberately separated.", "TECHNICAL ARCHITECTURE");
    const layers = [
      ["LIVE + GEOSPATIAL INPUT", "OSM · optional Google 3D · Overpass · OSRM · Open-Meteo · NASA EONET · USGS · publisher metadata", C.blue],
      ["PROVENANCE + NORMALIZATION", "Location · time · source · confidence · provider health · cache state", C.gray],
      ["AEGIS DETERMINISTIC CORE", "Scenario plugins · timeline · impact engine · cascades · branches · evacuation optimizer", C.red],
      ["DECISION + INTERACTION", "3D command center · structured AI tools · explanations · audit · human approval", C.green],
    ];
    layers.forEach((item, index) => {
      const y = 164 + index * 106;
      rect(slide, 64, y, 1152, 82, C.panel, index === 2 ? C.red : C.line, 7);
      line(slide, 64, y, 5, 82, item[2], 5);
      text(slide, item[0], 92, y + 17, 310, 26, 14, item[2], { bold: true });
      text(slide, item[1], 418, y + 14, 760, 50, 16, C.text, { bold: index === 2 });
      if (index < layers.length - 1) {
        text(slide, "↓", 620, y + 84, 40, 22, 18, C.line2, { align: "center", bold: true });
      }
    });
    label(slide, "MVP STACK", 64, 606, 240, C.green);
    text(slide, "React + TypeScript · local API routes · deterministic engines · single operator", 64, 632, 710, 28, 16, C.text, { bold: true });
    label(slide, "DEPLOYMENT PATH", 856, 606, 360, C.amber);
    text(slide, "Oracle Free Tier + persistent geospatial services", 856, 632, 360, 28, 15, C.text, { bold: true, align: "right" });
    addFooter(slide, 11, "CLEAR SERVICE BOUNDARIES  /  HUMAN CONTROL PRESERVED");
    addNotes(slide, "This separation is a safety feature. Imported evidence is not simulation output, simulation output is not AI text, and AI text is not an automatic action. The current prototype is local; Oracle hosting and persistent geospatial services are the next deployment stage.", ["https://developers.google.com/maps/documentation/javascript/3d/overview", "https://www.openstreetmap.org/copyright", "https://project-osrm.org/", "https://open-meteo.com/", "https://eonet.gsfc.nasa.gov/", "https://earthquake.usgs.gov/"]);
  }

  // 14 — Evidence
  if (INCLUDE_DETAILED_EXAMPLES) {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 14, "The prototype completes a working end-to-end vertical slice.", "WORKING EVIDENCE");
    await addScreenshot(slide, "04-impact.png", 64, 164, 632, 448, "AEGIS impact and human exposure metrics");
    metric(slide, "PEAK DEPTH", "1.05 m", "at T+80 min", 750, 166, 204, C.blue);
    metric(slide, "PEAK EXPOSURE", "9,697", "people projected", 996, 166, 220, C.red);
    metric(slide, "ROAD IMPACT", "14", "roads unavailable", 750, 328, 204, C.gray);
    metric(slide, "MODEL CONFIDENCE", "72%", "prototype estimate", 996, 328, 220, C.green);
    metric(slide, "PLAN COVERAGE", "5,685", "58% of demand", 750, 490, 204, C.green);
    metric(slide, "CLEARANCE", "72 min", "0 closure crossings", 996, 490, 220, C.blue);
    rect(slide, 64, 626, 1152, 36, C.panel, C.line, 4);
    text(slide, "SIMULATED PROTOTYPE RESULT  /  74 mm/h DEFAULT EIT FLOOD RUN  /  NOT OBSERVED REAL-WORLD DAMAGE", 78, 635, 1124, 18, 12, C.red, { bold: true, align: "center" });
    addFooter(slide, 14, "REPRODUCIBLE DEFAULT SEED  /  VALUES MUST MATCH CAPTURE");
    addNotes(slide, "These values come from one reproducible default EIT flood run in the current prototype. They are evidence of working state propagation, not a claim of real damage or certified forecast accuracy. The screenshot and text must be updated together if the default run changes.", ["AEGIS deterministic prototype run and capture, 2026-08-10."]);
  }

  // 15 — Feasibility and scale
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    addHeader(slide, 12, "Ambitious where decisions matter; practical in how it is built.", "INNOVATION + FEASIBILITY");
    const columns = [
      ["WHAT IS DISTINCT", ["Closed decision loop", "Causal cascade reasoning", "Capacity-aware response", "Visible data provenance", "Grounded AI explanation"], C.red],
      ["MVP PLAN", ["Browser-first build", "One flood flagship", "Shared hazard engine", "Public online providers", "Single-operator flow"], C.green],
      ["HOW IT SCALES", ["Flood: flagship fidelity", "Earthquake cascade", "Wildfire spread", "Cyclone / storm surge", "Chemical plume"], C.blue],
    ];
    columns.forEach((column, index) => {
      const x = 64 + index * 388;
      rect(slide, x, 170, 356, 402, C.panel, C.line, 8);
      line(slide, x, 170, 356, 0, column[2], 4);
      label(slide, column[0], x + 24, 198, 308, column[2]);
      column[1].forEach((item, itemIndex) => bullet(slide, item, x + 24, 252 + itemIndex * 54, 308, C.text, column[2], 17));
    });
    text(slide, "Next: calibrated local terrain + drainage · persistent geospatial data · IoT / drone feeds · multi-agency operations", 64, 610, 1152, 38, 17, C.muted, { align: "center" });
    addFooter(slide, 12, "ONE FLAGSHIP MODEL  /  EXTEND THROUGH SHARED HAZARD PLUGINS");
    addNotes(slide, "AEGIS is feasible because the high-risk engineering is concentrated in one complete flood scenario while other hazards reuse a common state contract. Expansion improves local data and model calibration rather than hiding uncertainty behind visual polish.");
  }

  // 16 — Close
  {
    const slide = deck.slides.add();
    slide.background.fill = C.bg;
    dot(slide, 626, 70, 28, C.red);
    shape(slide, "ellipse", { left: 613, top: 57, width: 54, height: 54 }, "none", { style: "solid", fill: C.line2, width: 2 });
    text(slide, "AEGIS", 340, 154, 600, 90, 62, C.text, { bold: true, fontFamily: FONT_DISPLAY, align: "center" });
    text(slide, "Do not just respond to the disaster.", 220, 278, 840, 48, 31, C.text, { bold: true, align: "center" });
    text(slide, "Understand what happens next.", 220, 328, 840, 52, 33, C.red, { bold: true, align: "center" });
    const finalStages = [
      ["CURRENT STATE", C.blue],
      ["FUTURE RISK", C.red],
      ["INTERVENTIONS", C.amber],
      ["BEST RESPONSE", C.green],
      ["HUMAN APPROVAL", C.text],
    ];
    finalStages.forEach((item, index) => {
      const x = 90 + index * 224;
      line(slide, x, 456, 176, 0, item[1], 3);
      text(slide, item[0], x, 474, 176, 28, 12, item[1], { bold: true, align: "center" });
      if (index < finalStages.length - 1) {
        line(slide, x + 180, 455, 30, 0, C.line2, 2);
        shape(slide, "rightArrow", { left: x + 199, top: 448, width: 12, height: 14 }, C.line2, { style: "solid", fill: C.line2, width: 0 });
      }
    });
    text(slide, "Sankalp Gupta  /  Team Leader  /  Team X", 310, 602, 660, 28, 18, C.text, { bold: true, align: "center" });
    text(slide, "CodeFusion 2K26 Hackathon", 310, 638, 660, 24, 14, C.muted, { align: "center" });
    text(slide, "CODEFUSION 2K26", 520, 682, 240, 18, 10, C.dim, { bold: true, align: "center" });
    addNotes(slide, "AEGIS makes the next decision visible: the current state, likely consequences, available interventions, and the best response under constraints. The final decision always remains with the human operator.");
  }

  for (const [index, slide] of deck.slides.items.entries()) {
    const stem = `slide-${String(index + 1).padStart(2, "0")}`;
    await writeBlob(`${RENDER_DIR}/${stem}.png`, await deck.export({ slide, format: "png", scale: 1 }));
    await fs.writeFile(`${RENDER_DIR}/${stem}.layout.json`, await (await slide.export({ format: "layout" })).text());
  }
  await writeBlob(`${RENDER_DIR}/deck-montage.webp`, await deck.export({ format: "webp", montage: true, scale: 1 }));
  const pptx = await PresentationFile.exportPptx(deck);
  await pptx.save(OUTPUT_PPTX);
  console.log(OUTPUT_PPTX);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
