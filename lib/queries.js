'use strict';
const nz = (v, d) => (v === undefined || v === null ? d : v);   // `??` for ArangoDB 3.11's V8, which lacks the operator
// The AQL behind every route. Each function takes resolved state (lib/state.js) and returns plain values; the
// routes add status codes and cache headers.
const { db } = require('@arangodb');
const { SOURCES, AXES, PAIRS, K, LEVELS, VARIANTS } = require('./config');
const { datasetByCode, climates, blockPath } = require('./state');
const order = require('./order');
const grid = require('./grid');

const q = (aql, bind = {}) => db._query(aql, bind).toArray();

/** the selector catalogue */
function catalogue() {
    const ds = datasetByCode();
    const species = q(`FOR s IN ScatterSpecies SORT s.species RETURN { species: s.species, scatterplot: s._custom.euforest_cells > 0, cells: s._custom.euforest_cells, atlas_rpp: s._custom.atlas_rpp == true, atlas_mhs: s._custom.atlas_mhs == true, eutrees4f: s._custom.eutrees4f == true, units: s._custom.eufgis_target || 0 }`);
    const countries = q(`FOR u IN ScatterUnits COLLECT c = SUBSTRING(u.gcu_id_number, 0, 3) WITH COUNT INTO n SORT c RETURN { [K]: CONCAT("ISO_3166_1_", c), code: c, units: n }`.replace('[K]', `"${K.country}"`));
    return {
        datasets: Object.entries(ds).map(([src, d]) => ({ [K.dataset]: d.key, src, code: SOURCES[src].code, title: d.title, definition: d.definition, grid: SOURCES[src].grid != null })),
        climates: climates().map(({ src, dataset, period, scenario, present, periodGid, scenarioGid, key }) => ({ [K.dataset]: dataset, src, [K.period]: periodGid, period, [K.scenario]: scenarioGid, scenario, present, key })),
        axes: { [K.X]: AXES.X, [K.Y]: AXES.Y, pairs: PAIRS.map((p) => ({ key: p.key, [K.X]: p.x, [K.Y]: p.y })) },
        species, countries,
        cells: order.length(),
        levels: LEVELS,
    };
}

/** the base layer: [x, y] or null per cell of the global order */
function base(c, axes) {
    const { path, bind } = blockPath(c);
    const rows = q(`FOR d IN ScatterOccurrences SORT d._key LET p = ${path} RETURN p == null || p[@x] == null || p[@y] == null ? null : [p[@x], p[@y]]`, { ...bind, x: axes.x, y: axes.y });
    return { value: rows, count: rows.filter(Boolean).length };
}

/** the cells holding a species: a sorted index list */
const speciesCells = (species) => order.indices(q('FOR d IN ScatterOccurrences FILTER @s IN d.species_list RETURN d._key', { s: species }));

/** the units of a species at a restriction level, with the pair per climate of the dataset */
function units(species, level, axes, dataset, filters = {}) {
    const cl = dataset ? climates().filter((k) => k.dataset === dataset) : [];
    const values = cl.map((k) => { const { path, bind } = blockPath(k); const b = Object.fromEntries(Object.entries(bind).map(([n, v]) => [`${n}_${cl.indexOf(k)}`, v])); return { k, expr: path.replace(/@(\w+)/g, (m, n) => `@${n}_${cl.indexOf(k)}`), bind: b }; });
    const sel = values.map((v) => `"${v.k.key}": (LET p = ${v.expr} RETURN p == null || p[@x] == null || p[@y] == null ? null : [p[@x], p[@y]])[0]`).join(', ');
    // a restricted unit's point is never stored in ScatterUnits: at the manage level it is read from GeoService's Units for the requester's country
    const manageCountry = level.lid === 'manage' && level.country ? level.country : null;
    const bind = Object.assign({ s: nz(species, null), x: axes.x, y: axes.y, country: filters.country ? filters.country : null, unit: nz(filters.unit, null), hide: level.lid === 'public', manageCountry }, ...values.map((v) => v.bind));
    const rows = q(`LET axes = [@x, @y]
        FOR d IN ScatterUnits FILTER @s == null || @s IN d.species_list
        FILTER !(@hide && d["gcu_loc_coordinates-restriction"] == true)
        FILTER @country == null || STARTS_WITH(d.gcu_id_number, @country)
        FILTER @unit == null || d.gcu_id_number == @unit
        SORT d.gcu_id_number
        LET point = d.gcu_loc_climate != null ? d.gcu_loc_climate
            : (@manageCountry != null && d["gcu_loc_coordinates-restriction"] == true && STARTS_WITH(d.gcu_id_number, @manageCountry)
                ? FIRST(FOR x IN Units FILTER x.gcu_id_number == d.gcu_id_number LIMIT 1 RETURN x.gcu_loc_climate) : null)
        LET t = DOCUMENT("UnitPolygons", d.gcu_id_number).properties
        RETURN { gcu_id_number: d.gcu_id_number, species_list: d.species_list, "gcu_loc_coordinates-restriction": d["gcu_loc_coordinates-restriction"] == true, gcu_loc_climate_distance: d.gcu_loc_climate_distance, geo_shape_elevation: t.chr_AvElevation, "gcu_loc_elevation-min": t.chr_MinElevation == null ? null : ROUND(t.chr_MinElevation), "gcu_loc_elevation-max": t.chr_MaxElevation == null ? null : ROUND(t.chr_MaxElevation), geo_shape_elevation_sd: t.chr_StdElevation, geo_shape_slope: t.chr_AvSlope, geo_shape_aspect: t.chr_AvAspect, gcu_loc_climate: point, values: { ${sel} } }`, bind);
    for (const u of rows) {
        for (const k of Object.keys(u.values)) if (u.values[k] == null) delete u.values[k];
        if (!geometryAllowed(level, u) || u.gcu_loc_climate == null) delete u.gcu_loc_climate;   // never a point below the manage level, and at manage only for the requester's country
    }
    return rows;
}
/** the geometry rule of the restriction levels (restricted units' coordinates: manage level and the requester's country only) */
function geometryAllowed(level, u) {
    if (!u['gcu_loc_coordinates-restriction']) return true;
    return level.lid === 'manage' && level.country != null && u.gcu_id_number.startsWith(level.country);
}

/** the suitability classes of a species for an EU-Trees4F period × scenario × variant: a digit string in the global order */
function classes(species, c, variantGid) {
    if (c.src !== 'eutrees4f' || c.present) return null;
    if (!VARIANTS[variantGid]) return null;
    const doc = q(`FOR d IN PanesSuitability FILTER d.species == @s AND d[@kp] == @p AND d[@ks] == @sc AND d[@kv] == @v RETURN d`, { s: species, kp: K.period, p: c.periodGid, ks: K.scenario, sc: c.scenarioGid, kv: K.variant, v: variantGid })[0];
    return doc ? { species, [K.period]: c.periodGid, [K.scenario]: c.scenarioGid, [K.variant]: variantGid, cells: doc._custom.cells, counts: nz(doc._custom.counts, null), version: nz(doc._custom.version, null) } : null;
}

/** a geometry → the surveyed cells inside (index list); a point → the containing / nearest surveyed cell and the climate values at the place */
function selection(geometry, c, axes) {
    if (geometry.type === 'Polygon' || geometry.type === 'MultiPolygon') {
        const keys = q('FOR d IN ScatterOccurrences FILTER GEO_CONTAINS(@g, d.geometry_point) RETURN d._key', { g: geometry });
        return { cells: order.indices(keys) };
    }
    if (geometry.type === 'Point') {
        const near = q('FOR d IN ScatterOccurrences LET dist = GEO_DISTANCE(@g, d.geometry_point) FILTER dist <= 5000 SORT dist LIMIT 1 RETURN { key: d._key, metres: dist }', { g: geometry })[0];
        const out = { cells: near && near.metres <= 710 ? order.indices([near.key]) : [], nearest: near ? { cell: order.indexOf(near.key), metres: Math.round(near.metres) } : null, point: null, geo_shape_elevation: elevationAt(geometry.coordinates[0], geometry.coordinates[1]) };
        if (c && axes) out.point = pointValues(geometry.coordinates, c, axes, near);
        return out;
    }
    throw Object.assign(new Error(`${K.selection}: a Point, Polygon or MultiPolygon is expected`), { status: 400 });
}
/** the pair at a place for a climate: from the 1 km grid (WorldClim / Chelsa) by the containing cell's key, else from the containing surveyed cell */
function pointValues([lon, lat], c, axes, near) {
    const S = SOURCES[c.src];
    if (S.grid) {
        const key = grid.containingCellKey(lon, lat);
        const doc = db._collection(S.grid).exists(key) ? db._collection(S.grid).document(key) : null;
        const block = doc ? (c.present ? doc.properties[c.period] : ((doc.properties[c.period] || {})[S.future.model] || {})[S.future.ssp]) : null;
        const v = grid.derive(block, { tasApprox: !c.present && S.future.tasApprox });
        return { cell: key, source: S.grid, found: !!block, values: block && v[axes.x] != null && v[axes.y] != null ? [v[axes.x], v[axes.y]] : null };
    }
    if (near && near.metres <= 710) {   // EU-Trees4F: surveyed cells only
        const { path, bind } = blockPath(c);
        const v = q(`LET d = DOCUMENT("ScatterOccurrences", @k) LET p = ${path} RETURN p == null ? null : [p[@x], p[@y]]`, { ...bind, k: near.key, x: axes.x, y: axes.y })[0];
        return { cell: near.key, source: 'ScatterOccurrences', found: v != null, values: v };
    }
    return { cell: null, source: null, found: false, values: null };
}

/** every unit at a level: the host page's index */
function unitsIndex(level) {
    return q(`FOR d IN ScatterUnits FILTER !(@hide && d["gcu_loc_coordinates-restriction"] == true) SORT d.gcu_id_number
        LET t = DOCUMENT("UnitPolygons", d.gcu_id_number).properties
        RETURN { gcu_id_number: d.gcu_id_number, gcu_id_country: CONCAT("ISO_3166_1_", SUBSTRING(d.gcu_id_number, 0, 3)), species_list: d.species_list, "gcu_loc_coordinates-restriction": d["gcu_loc_coordinates-restriction"] == true, gcu_loc_climate_distance: d.gcu_loc_climate_distance, geo_shape_elevation: t.chr_AvElevation, "gcu_loc_elevation-min": t.chr_MinElevation == null ? null : ROUND(t.chr_MinElevation), "gcu_loc_elevation-max": t.chr_MaxElevation == null ? null : ROUND(t.chr_MaxElevation), geo_shape_elevation_sd: t.chr_StdElevation, geo_shape_slope: t.chr_AvSlope, geo_shape_aspect: t.chr_AvAspect }`, { hide: level.lid === 'public' });
}
/** the units' reference points (overview) or one unit's polygon, as GeoJSON features, under the geometry rule */
function unitsGeo(level, unit, species) {
    if (unit) {
        const u = q('FOR d IN ScatterUnits FILTER d.gcu_id_number == @u RETURN d', { u: unit })[0];
        if (!u) return null;
        if (!geometryAllowed(level, u)) return { type: 'FeatureCollection', features: [], withheld: true };
        const poly = db._collection('UnitPolygons').exists(unit) ? db._collection('UnitPolygons').document(unit) : null;
        return { type: 'FeatureCollection', features: [{ type: 'Feature', properties: props(u), geometry: poly ? poly.geometry : u.gcu_loc_climate }] };
    }
    const rows = q(`FOR d IN ScatterUnits FILTER @s == null || @s IN d.species_list FILTER d.gcu_loc_climate != null OR (d["gcu_loc_coordinates-restriction"] == true AND @manage) SORT d.gcu_id_number RETURN d`, { s: nz(species, null), manage: level.lid === 'manage' });
    const features = [];
    for (const u of rows) {
        if (!geometryAllowed(level, u)) continue;
        let g = u.gcu_loc_climate;
        if (!g && u['gcu_loc_coordinates-restriction']) { const src = q('FOR x IN Units FILTER x.gcu_id_number == @u RETURN x.gcu_loc_climate', { u: u.gcu_id_number })[0]; g = nz(src, null); }   // a restricted unit's point lives in Units only
        if (g) features.push({ type: 'Feature', properties: props(u), geometry: g });
    }
    return { type: 'FeatureCollection', features };
}
const props = (u) => Object.assign({ gcu_id_number: u.gcu_id_number, species_list: u.species_list, 'gcu_loc_coordinates-restriction': u['gcu_loc_coordinates-restriction'] == true, gcu_loc_climate_distance: u.gcu_loc_climate_distance }, topography(u.gcu_id_number));
/** the unit polygon's averaged topography (UnitPolygons.properties, stored under the legacy chr_* names), returned under the dictionary's terms;
 *  a polygon's mean elevation reveals no position, so restricted units carry it too */
function topography(unit) {
    const c = db._collection('UnitPolygons'), p = c && c.exists(unit) ? (c.document(unit).properties || {}) : {};
    const r = (v) => (v === undefined || v === null ? null : Math.round(v));
    return { geo_shape_elevation: nz(p.chr_AvElevation, null), 'gcu_loc_elevation-min': r(p.chr_MinElevation), 'gcu_loc_elevation-max': r(p.chr_MaxElevation), geo_shape_elevation_sd: nz(p.chr_StdElevation, null), geo_shape_slope: nz(p.chr_AvSlope, null), geo_shape_aspect: nz(p.chr_AvAspect, null) };
}
/** the elevation at a place: the WorldClim 2.1 elevation layer stored with every 1 km cell (properties.topography), whatever the climate asked for */
function elevationAt(lon, lat) {
    const c = db._collection('WorldClim'), key = grid.containingCellKey(lon, lat);
    const doc = c && c.exists(key) ? c.document(key) : null;
    return doc ? nz(((doc.properties || {}).topography || {}).geo_shape_elevation, null) : null;
}

/** the maps manifest of a species */
function maps(species) {
    const rows = q('FOR m IN ScatterMaps FILTER m.species == @s RETURN { dataset: m.std_dataset_ids, c: m._custom }', { s: species });
    const out = { species, atlas_rpp: null, atlas_mhs: null, eutrees4f: {}, chorology: [] };
    for (const { c } of rows) {
        const entry = { path: c.path, format: c.format, crs: c.crs, licence: c.licence, citation: c.citation, resolution: nz(c.resolution, null) };
        if (c.source === 'atlas_rpp') out.atlas_rpp = entry;
        else if (c.source === 'atlas_mhs') out.atlas_mhs = entry;
        else if (c.source === 'atlas_chorology') out.chorology.push({ ...entry, layer: c.layer, subspecies: nz(c.subspecies, null) });
        else if (c.source === 'eutrees4f' && c.ensemble === 'ens-sdms' && String(c.layer).startsWith('suitability binary')) out.eutrees4f[`${c.period}|${nz(c.scenario, 'cur')}|${c.variant}`] = entry;
    }
    return out;
}

module.exports = { catalogue, base, speciesCells, units, classes, selection, unitsIndex, unitsGeo, maps, geometryAllowed };
