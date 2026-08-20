# EIT campus data import

AEGIS currently anchors Echelon Institute of Technology to the map reference published by the institute and renders a nearby OpenStreetMap footprint subset. It does not claim that those polygons are a complete campus boundary or surveyed BIM. A public Copernicus GLO-90 context grid can replace the bundled terrain fallback at runtime, but its approximately 90 m samples are not a campus survey. Heights, unnamed functions, fine surface levels, drainage, occupancy and utilities remain estimates until validated records are supplied.

The authoritative-data path is already wired into the twin renderer. Create a JSON file based on `datasets/faridabad/eit-campus-import.example.json`, then open **Workspace → Campus data → Import verified JSON** in AEGIS. A valid dataset immediately replaces the prototype footprint/terrain dataset in the 3D site view.

For each building, supply a closed WGS84 footprint ring, verified height or floors, base elevation, use, entrances represented as landmarks where relevant, occupancy, and a source record. For terrain, use surveyed or published elevation control points. Gates and assembly areas belong in `landmarks`. Every record carries its own evidence class and provenance.

Do not convert a photograph, rough tracing or generative model into `OBSERVED`. Use `IMPORTED` with a precise source, or `ESTIMATED` when interpretation was required. GLB/CAD/BIM geometry must first be georeferenced and converted to the import contract; the current MapLibre renderer consumes geospatial footprints and elevations rather than arbitrary local-model coordinates.

Official status and the exact missing inputs are exposed at `/api/campus/eit`. The zero-fabrication rule is deliberate: without the institute’s boundary, BIM/site plan, gates, DEM, drains and facilities register, no software can truthfully produce an exact college digital twin.
