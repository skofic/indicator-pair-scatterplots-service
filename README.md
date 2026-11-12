# indicator-pair-scatterplots-service

ArangoDB Foxx service of the EUFGIS **species distribution map** and **indicator pair scatterplot** panes.
Mounted in the `GeoService` database (proposed mount `/panes`), it is the read API over the `Scatter*`
collections that the [`indicator-pair-scatterplots`](https://github.com/skofic/indicator-pair-scatterplots)
repository loads: the selector catalogue, the base layer per indicator pair and climate, a species' cells
and units, a map selection resolved to cells, the climate at a clicked point, the EU-Trees4F suitability
classes, the units index and geometries, the maps manifest.

**Requests and answers speak the data dictionary.** Every parameter is a key of the dictionary's
`ui_layout_state` (`std_dataset_ids`, `env_climate_period`, `env_climate_scenario`,
`ui_layout_scatterplot_X`, `gcu_loc_coordinates-restriction_level`, …) and every option value is a
dictionary term; the labels themselves are not served here but by the dictionary's own service
(`metadata/ui`), which the panes call directly. The two services together are the whole backend of the
panes; the rasters (cloud-optimised GeoTIFFs) come from a static file host.

**Read-only.** Every route is a read. The only writes are the setup script's (collections, indexes, the
answer cache) and the cache fill.

---

## Environment

| Item | Value |
|---|---|
| ArangoDB | 3.12.4 Community (laptop) / 3.11.14 (work server) — the ecosystem stays on these versions |
| JavaScript | **no `??` / `?.` operators** in the service's sources: ArangoDB 3.11's V8 does not parse them (install fails with error 3103); `nz(v, d)` stands in for `v ?? d`. Found at the first work-server install, 2026-11-11 |
| Database | `GeoService` |
| Mount point | `/panes` (proposal) |
| Base URL | `http://localhost:8529/_db/GeoService/panes` |
| Reads | `ScatterOccurrences`, `ScatterSpecies`, `ScatterUnits`, `ScatterCells`, `ScatterMaps` (this project's, loaded by the pipeline), `Dataset`, `Units`, `UnitPolygons`, `WorldClim`, `Chelsa` (GeoService's) |
| Owns | `PanesCache` (answer cache), `PanesSuitability` (class digits per species × EU-Trees4F period × scenario × variant: term keys `species`, `env_climate_period`, `env_climate_scenario`, `ui_layout_scatterplot_view_classes_variant`, the digit string under `_custom.cells` until a descriptor exists) |
| Dependencies | none beyond ArangoDB's bundled `joi`, `chai`, `@arangodb/request` |

Anonymous access, as the other Foxx services under `--server.authentication-system-only`: the portal
calls the service and sets the restriction level per request; a public instance is reachable only
through the portal, or pins `maxLevel`.

## Repository layout

The repository root is the Foxx `APP` folder.

```
manifest.json      service metadata, configuration, setup / teardown scripts, tests
main.js            root router: mounts the eight route files
lib/
  config.js        the climate sources, the axes and pairs, the dictionary terms used as keys and values
  schema.js        the collections and their named indexes: data (Scatter*), owned (Panes*), external
  state.js         a request read as a partial ui_layout_state: climate, axes, level (400 naming the key)
  order.js         the global cell order (ScatterOccurrences by _key), index lists, staleness check
  cache.js         PanesCache: compute once, serve with ETag / 304
  grid.js          the 1 km grid: containing-cell key, indicator derivation (as the loaders do it)
  queries.js       the AQL behind every route
  http.js          shared query-parameter declarations and the error mapping
routes/            one file per family: catalogue, base, species, selection, units, maps, state, health
scripts/           setup.js, teardown.js
test/routes.js     19 tests against the live collections (POST /_api/foxx/tests?mount=/panes); the two that need the value / manage levels skip on a public-only instance, which gets a clamp test instead
```

## Routes

Swagger is the reference (ArangoDB web interface → Services → panes → API); this is the index.

| Route | What it does |
|---|---|
| `GET /catalogue` | What the selectors offer: datasets (as `std_dataset_ids` keys with title and definition), every dataset × period × scenario as terms with their data aliases, the X and Y axes and the five pairs, the species with availability flags, the countries, the length of the global cell order, the restriction levels. Cached. |
| `GET /base` | The base layer: `[x, y]` or `null` per survey cell in the global order, for a dataset, period, scenario and pair. ~3.4 MB; computed once (0.8 s), then from `PanesCache` with an `ETag` (16 ms; 304 on `If-None-Match`). |
| `GET /species/cells` | The cells holding a species: a sorted index list into the global order (climate-independent). |
| `GET /species/units` | The units of a species (every unit without a species: the panes' empty state) at the restriction level, with the pair for every climate of the dataset (`values["<period gid>\|<scenario gid>"]`), the distance of the reference point from the polygon, and the point where the geometry rule allows it. |
| `GET /species/classes` | The EU-Trees4F suitability class per cell (digits in the global order) for a future period, scenario and variant, from `PanesSuitability`. |
| `POST /selection` | A map geometry → the cells inside (index list); a point → the containing / nearest survey cell, the elevation of the place (`geo_shape_elevation`, the WorldClim 2.1 elevation layer of the containing 1 km cell, no climate needed) and the pair at that place from the 1 km grid (`WorldClim` / `Chelsa` by the derived cell key) or, for EU-Trees4F, from the survey cell. |
| `GET /units/index` | Every unit the level allows: number, country term, species, restriction, distance, and the polygon's averaged topography (`geo_shape_elevation` with `gcu_loc_elevation-min` / `-max`, `geo_shape_elevation_sd`, `geo_shape_slope`, `geo_shape_aspect`, from `UnitPolygons`; `/species/units` and `/units/geo` carry the same). The host page's facets. |
| `GET /units/geo` | GeoJSON: the units' reference points (overview, optionally one species), or one unit's polygon from `UnitPolygons`; `withheld` when the level forbids it. |
| `GET /maps` | A species' Atlas and EU-Trees4F raster paths and chorology files from `ScatterMaps`, with CRS, licence and citation. |
| `POST /state/validate` | Forwards a (partial) pane state to the dictionary service (`validate/document`, descriptor `ui_layout_state`, `compute: true`), so a client needs one origin. |
| `GET /health` | Collections with counts and named indexes, the global order length, the cache, dictionary reachability. |

### The restriction level

`gcu_loc_coordinates-restriction_level` (query parameter, or the header `X-Restriction-Level`), set by the
portal, clamped to the configured `maxLevel`:

| Level | Units returned | Geometry |
|---|---|---|
| `…_public` (default) | unrestricted only | of unrestricted units |
| `…_value` | all; restricted ones with identifiers, climate values and distance | of unrestricted units |
| `…_manage` | all | restricted units' points and polygons **only for the requester's country** (`gcu_id_country`, or the header `X-Restriction-Country`), read from GeoService's `Units`, since `ScatterUnits` never stores a restricted unit's coordinates |

### Index lists and the global cell order

Every `ScatterOccurrences` document, sorted by `_key`, is the global order. The base layer is an array
aligned with it; a species, a map selection and the suitability classes are positions in it. The pane
joins by position and never needs cell keys. The order is held in memory and rebuilt when the
collection's count changes (a reload) or the service restarts.

## Install

From the ArangoDB web interface: **Services → Add Service → Upload** the bundle, or **→ GitHub**
`skofic/indicator-pair-scatterplots-service`, mount `/panes`. From the HTTP API:

```bash
npm run bundle   # → indicator-pair-scatterplots-service.zip
curl -u user:password -X POST -H "Content-Type: application/zip" \
  --data-binary @indicator-pair-scatterplots-service.zip \
  "http://localhost:8529/_db/GeoService/_api/foxx?mount=/panes&setup=true"
```

Upgrade (keeps the collections; empties the cache):

```bash
curl -u user:password -X PATCH -H "Content-Type: application/zip" \
  --data-binary @indicator-pair-scatterplots-service.zip \
  "http://localhost:8529/_db/GeoService/_api/foxx/service?mount=/panes&teardown=false&setup=true"
```

Tests: `curl -u user:password -X POST "http://localhost:8529/_db/GeoService/_api/foxx/tests?mount=/panes&reporter=default"`.

### Setup and teardown

`scripts/setup.js` creates every collection of `lib/schema.js` that is absent (the `Scatter*` data
collections and the two owned ones) and every **named index** that is absent, leaves existing ones
untouched, empties `PanesCache`, and with the `prefill` configuration computes the base layer of every
pair × climate into the cache (80 answers, about a second each). The data itself is loaded by the
`indicator-pair-scatterplots` pipeline, never here.

`scripts/teardown.js` drops `PanesCache` and `PanesSuitability` only. The `Scatter*` data collections
are dropped only when the configuration `teardownDropsData` is true (off by default): a wrong mount or
a replace must never erase the loaded cells.

### Configuration

| Option | Default | Purpose |
|---|---|---|
| `metadataUi` | `http://localhost:8529/_db/metadata/ui` | the dictionary service, for `/state/validate` and `/health` |
| `maxLevel` | `…_manage` | the highest restriction level this instance answers |
| `lang` | `ISO_639_3_eng` | the language of the dataset titles and definitions in the catalogue |
| `prefill` | `false` | setup fills the base cache |
| `teardownDropsData` | `false` | teardown also drops the data collections |

## Measured (laptop, 2026-11-09)

| Route | Time | Size |
|---|---|---|
| `/catalogue` | 3 ms (cached) | 48 KB |
| `/base`, first request | 0.80 s | 3.4 MB |
| `/base`, cached | 16 ms | 3.4 MB (304 on a matching ETag) |
| `/species/cells` (spruce, 70 302 cells) | 150 ms | 461 KB |
| `/species/units` (spruce, value level, 4 climates) | 22 ms | 352 KB |
| `/units/index` | 18 ms | 569 KB |
| `/units/geo` (beech points) | 28 ms | 109 KB |
| `POST /selection`, polygon | 5 ms | |
| `POST /selection`, point with grid lookup | 18 ms | |

## Licence

Apache 2.0.
