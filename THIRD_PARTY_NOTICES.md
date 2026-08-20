# Third-party notices

AEGIS includes open-source software and displays or retrieves information from
third-party map, imagery and public-information services. Each component and
dataset remains governed by its own licence, attribution requirements, terms
of use and acceptable-use policy. This document is practical attribution
guidance for the AEGIS prototype; it is not a replacement for the upstream
licence texts.

The exact JavaScript dependency graph and versions are recorded in
`package-lock.json` and the platform-specific lockfiles. Python package versions
are pinned in `backend/requirements.txt`; Rust crate versions are recorded in
`platforms/windows/src-tauri/Cargo.lock`. Transitive dependencies retain their
own notices and licences.

## Map, terrain and imagery

| Provider or data | AEGIS use | Attribution and terms |
| --- | --- | --- |
| OpenStreetMap contributors | Map data, building footprints and road context | Data is available under the [Open Database Licence (ODbL)](https://www.openstreetmap.org/copyright). AEGIS must keep visible OpenStreetMap attribution on interactive maps and produced map images. |
| OpenFreeMap / OpenMapTiles | Primary vector-map style and public tile service | Keep `OpenFreeMap © OpenMapTiles Data from OpenStreetMap` or equivalent visible attribution. See [OpenFreeMap attribution and licence information](https://openfreemap.org/) and [OpenMapTiles licensing](https://openmaptiles.org/license/). |
| CARTO | Independent Dark Matter basemap fallback | Keep CARTO and OpenStreetMap attribution visible. See [CARTO attribution](https://carto.com/attributions) and [CARTO legal terms](https://carto.com/legal/). |
| EOX Sentinel-2 cloudless 2020 | Dated, low-zoom Earth imagery context | `Sentinel-2 cloudless 2020 by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2020)`. See [EOX Maps](https://maps.eox.at/) and [EOX Cloudless](https://cloudless.eox.at/). This is a composite, not live satellite imagery. |
| NASA EOSDIS GIBS / Blue Marble | Dated Earth imagery fallback and context | Credit NASA EOSDIS/GIBS and follow [NASA imagery and media guidance](https://www.nasa.gov/nasa-brand-center/images-and-media/). See [NASA GIBS](https://www.earthdata.nasa.gov/gibs). NASA names and marks must not imply endorsement. |
| Mapzen/AWS Terrarium elevation tiles | Global terrain relief | The public tiles combine elevation sources with source-specific terms. See the [Terrain Tiles dataset registry](https://registry.opendata.aws/terrain-tiles/). They are not survey-grade elevation data. |

The bundled EIT-area OpenStreetMap snapshot preserves its Overpass metadata and
ODbL notice. Institution-source provenance and the limits of estimated campus
geometry are recorded in `datasets/faridabad/eit-authoritative-manifest.json`
and `docs/DATA_PROVENANCE.md`.

## Public information and routing services

AEGIS accesses these services at runtime and does not claim ownership of their
responses:

- [OpenStreetMap Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/), [Overpass API](https://overpass-api.de/) and [OSRM](https://project-osrm.org/) for search, footprint and route candidates.
- [Open-Meteo terms](https://open-meteo.com/en/terms) for weather-model and elevation context.
- [NASA EONET](https://eonet.gsfc.nasa.gov/), [USGS earthquake feeds](https://earthquake.usgs.gov/earthquakes/feed/) and [GDACS](https://www.gdacs.org/) for source-labelled event metadata.
- [Google News](https://news.google.com/), [Wikimedia Commons](https://commons.wikimedia.org/wiki/Commons:Licensing), [ReliefWeb](https://reliefweb.int/terms-conditions) and [YouTube](https://www.youtube.com/t/terms) for links or optional contextual media metadata. Rights and licences vary by individual publisher or media item; retrieval does not grant reuse rights or verify that footage is live.

Provider availability, freshness and permitted request volume are controlled by
the provider. Preserve visible source labels and timestamps, and do not remove
map attribution from screenshots, exports or presentations.

## Principal software

The root `package-lock.json` records, among others:

- [MapLibre GL JS](https://github.com/maplibre/maplibre-gl-js) 6.2.0 — BSD-3-Clause.
- [React](https://github.com/facebook/react) and React DOM 19.2.8 — MIT.
- [Vinext](https://github.com/cloudflare/vinext) and `@vinext/cloudflare` 1.0.0-beta.6 — MIT according to the installed package metadata.
- [Vite](https://github.com/vitejs/vite) 8.2.2 — MIT.
- [Wrangler](https://github.com/cloudflare/workers-sdk) 4.125.0 — MIT OR Apache-2.0 according to the installed package metadata.
- [Lucide React](https://github.com/lucide-icons/lucide) 1.30.0 — ISC.
- [Zod](https://github.com/colinhacks/zod) 4.4.3 — MIT.

Platform code also uses [Tauri](https://github.com/tauri-apps/tauri) 2 and its
CLI, whose published package metadata identifies Apache-2.0 OR MIT terms;
`@resvg/resvg-wasm` 2.4.0 is identified as MPL-2.0. The deferred Android wrapper
uses [Capacitor](https://github.com/ionic-team/capacitor) 8.5.0, identified as
MIT in its package metadata. The [Geist typeface](https://github.com/vercel/geist-font)
and all icons or fonts retain their upstream terms.

## Backend and packaged services

Pinned backend packages are [FastAPI](https://github.com/fastapi/fastapi),
[Uvicorn](https://www.uvicorn.org/), [SQLAlchemy](https://www.sqlalchemy.org/),
[psycopg2](https://www.psycopg.org/), [redis-py](https://github.com/redis/redis-py)
and [pydantic-settings](https://github.com/pydantic/pydantic-settings). Consult
the installed distribution metadata and upstream licence file for each exact
version; `backend/requirements.txt` is the version authority.

The optional Compose deployment uses [PostgreSQL](https://www.postgresql.org/about/licence/),
[PostGIS](https://postgis.net/), [Redis 7.4](https://github.com/redis/redis/blob/7.4/COPYING)
and [nginx](https://nginx.org/en/docs/). These are separately distributed
container images, not relicensed by AEGIS. Redis licensing is version-specific;
the linked `7.4` licence file, rather than a generic description, controls the
configured image.

## AEGIS licence boundary

The repository's `LICENSE` applies only to original AEGIS source and assets.
It does not override any third-party software, map data, imagery, font, icon,
media or public-feed terms. When distributing binaries, retain this notice and
the licence files supplied by packaged dependencies.
