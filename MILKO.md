# MILKO.md — the service, for its maintainer

Companion of `README.md` (what the service does) for whoever changes it. Decisions, their reasons and
the places where the design rests on something outside this repository.

## Where it sits

- **Data side:** [`indicator-pair-scatterplots`](https://github.com/skofic/indicator-pair-scatterplots)
  loads the `Scatter*` collections into `GeoService` and keeps the living plan (`CLAUDE.md`), the
  study notes and the decisions log. The design of this service is its
  `notes/2026-11-09-foxx-service-design.md`; the collection and index definitions in `lib/schema.js`
  mirror its `setup.js` and must stay identical.
- **Vocabulary side:** the data dictionary (`metadata-store`, served by `metadata-store-service` at
  `metadata/ui`). Every request key and option value is a term there; `ui_layout_state` is the schema
  of the pane state and holds its defaults. The handoff that created the terms:
  `indicator-pair-scatterplots/notes/2026-11-09-handoff-metadata-store-ui-terms.md`.
- **Pages:** the panes (`examples/` of the data repository today, the portal's panes tomorrow) call
  this service for data and the dictionary for texts.

## Decisions

- **Dedicated service, own repository** (Milko, 2026-11-09): one of the easiest ways to install a
  Foxx service is from GitHub; this service may later become the base of the new GeoService service.
- **Setup creates the `Scatter*` collections and named indexes, idempotently** (Milko's standard for
  Foxx services): absent → created; present → untouched; an index is created only when none of that
  name exists. The data is never written here.
- **Teardown spares the data** unless `teardownDropsData` is set. The reason is the metadata-store
  incident of 2026-10-28: a service mounted over another ran that other's teardown and erased its
  collections. Here the owned caches are dropped, the 250 000 loaded cells are not.
- **The state vocabulary as the API.** Routes take `ui_layout_state` keys so that a pane sends what it
  holds and a saved view is a valid request. The service checks only the keys it consumes (unknown
  dataset / period / scenario / axis / level → 400 naming the key); full validation belongs to the
  dictionary (`POST /state/validate` forwards there).
- **Index lists on the global cell order** instead of coordinates or keys: the base layer is the one
  large payload (3.4 MB) and is cached; everything else is small. The order is `ScatterOccurrences`
  sorted by `_key`, rebuilt when the count changes.
- **The restriction level is the portal's word.** The pane's user never chooses it; the portal passes
  it per request (parameter or header) and `maxLevel` pins an instance. A restricted unit's
  coordinates exist only in GeoService's `Units`; `ScatterUnits` stores none, so even a bug in the
  value level cannot leak a point from this service's own collections.
- **No texts served**, except the dataset titles and definitions from the `Dataset` records (there is
  no dictionary term per dataset); every label comes from the dictionary, which makes the panes
  multilingual by adding a language key to the terms.

## Things to know

- `PanesSuitability` is filled by the data repository's loader (`sources/export/suitability.js`): one
  document per species × EU-Trees4F period × scenario × variant, keyed by the dictionary terms
  (`species`, `env_climate_period`, `env_climate_scenario`, `ui_layout_scatterplot_view_classes_variant`),
  the class digit per cell of the global order under `_custom.cells` (with `counts` and the order's
  `version`) until a descriptor for the string exists (open point of the design note, §10.2).
- `/units/geo` returns points for the overview and one polygon on request; the simplified polygons of
  all units for the map overview are a static file (the data repository's `map-index.js` export), a
  Serve Plan item.
- `/selection` with a point reads the 1 km grid by the cell key derived offline (`lib/grid.js`, the
  convention verified 500/500 against the live grids in the data repository). EU-Trees4F has no 1 km
  grid, so a point gets EU-Trees4F values only when it falls in a surveyed cell.
- The cache key of `/base` is `base|<dataset>|<period>|<scenario>|<X>|<Y>`; setup empties the cache,
  and a change of the global order (count) invalidates every cached answer through `version`.
- Tests run inside the database against the live data (beech and spruce fixtures); they take about
  1.5 s. They fail without the `Scatter*` data and without the dictionary service.

## Log

- **2026-11-09** — Created: eight route families, setup / teardown, 16 tests (all pass), installed at
  `/panes` on the laptop's GeoService. Measured: base 0.8 s first then 16 ms, every other route under
  150 ms.
