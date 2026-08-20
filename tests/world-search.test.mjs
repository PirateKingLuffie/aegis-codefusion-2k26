import assert from "node:assert/strict";
import test from "node:test";
import {
  parseCoordinateQuery,
  searchOfflineWorldPlaces,
  searchHitToSelection,
  zoomForBounds,
} from "../components/command-center/world-search.ts";

test("world search parses bounded latitude-longitude pairs deterministically", () => {
  assert.deepEqual(parseCoordinateQuery("28.3912, 77.4399"), {
    latitude: 28.3912,
    longitude: 77.4399,
  });
  assert.deepEqual(parseCoordinateQuery("28.3912 N 77.4399 E"), {
    latitude: 28.3912,
    longitude: 77.4399,
  });
  assert.equal(parseCoordinateQuery("91, 181"), null);
  assert.equal(parseCoordinateQuery("latitude 20, latitude 30"), null);
});

test("world search accepts deterministic longitude-latitude forms", () => {
  assert.deepEqual(parseCoordinateQuery("120.5, -34.25"), {
    latitude: -34.25,
    longitude: 120.5,
  });
  assert.deepEqual(parseCoordinateQuery("77.4399 E, 28.3912 N"), {
    latitude: 28.3912,
    longitude: 77.4399,
  });
  assert.deepEqual(parseCoordinateQuery("lon: 77.4399, lat: 28.3912"), {
    latitude: 28.3912,
    longitude: 77.4399,
  });
});

test("world search has deterministic, source-labelled offline reference matches", () => {
  const eiffel = searchOfflineWorldPlaces("Eiffel Tower");
  assert.equal(eiffel[0].id, "offline-eiffel-tower");
  assert.equal(eiffel[0].source, "AEGIS offline gazetteer");
  assert.equal(eiffel[0].dataClass, "REFERENCE");
  assert.deepEqual(
    { latitude: eiffel[0].latitude, longitude: eiffel[0].longitude },
    { latitude: 48.85837, longitude: 2.294481 },
  );
  assert.equal(searchHitToSelection(eiffel[0]).id, "reference-offline-eiffel-tower");

  assert.equal(searchOfflineWorldPlaces("nyc")[0].id, "offline-new-york");
  assert.equal(searchOfflineWorldPlaces("India")[0].id, "offline-india");
  assert.deepEqual(searchOfflineWorldPlaces("an unknown local lane"), []);
});

test("world results use bounds for globe framing and detail zoom for buildings", () => {
  assert.equal(zoomForBounds([20, 40, 65, 95]), 3.4);
  const campus = searchHitToSelection({
    id: "42",
    label: "Example University, Faridabad, India",
    latitude: 28.4,
    longitude: 77.4,
    type: "university",
    bounds: [28.39, 28.41, 77.39, 77.41],
  });
  assert.equal(campus.zoom, 16.2);
  assert.equal(campus.fidelity, "GLOBAL PROTOTYPE");
});

test("world search selections preserve coordinates near the former EIT scaffold", () => {
  const selection = searchHitToSelection({
    id: "near-legacy-scaffold",
    label: "A mapped place, Faridabad, India",
    latitude: 28.24,
    longitude: 77.23,
    type: "place",
  });

  assert.equal(selection.latitude, 28.24);
  assert.equal(selection.longitude, 77.23);
});
