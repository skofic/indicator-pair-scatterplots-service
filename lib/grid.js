'use strict';
const nz = (v, d) => (v === undefined || v === null ? d : v);   // `??` for ArangoDB 3.11's V8, which lacks the operator
// The 1 km climate grids (WorldClim, Chelsa collections): the stored _key of the cell containing a point, and the
// indicators derived from a cell's block as the indicator-pair-scatterplots loaders derive them (lib/geometry.js,
// sources/climate/geoservice/lookup.js there — the conventions were verified 500/500 against the live grids).
const crypto = require('@arangodb/crypto');

const RADIUS = 1 / 240;   // half a 30″ cell
function cellPolygon(lon, lat, r = RADIUS) {
    return { type: 'Polygon', coordinates: [[[lon - r, lat - r], [lon + r, lat - r], [lon + r, lat + r], [lon - r, lat + r], [lon - r, lat - r]]] };
}
/** centre of the containing 30″ cell, rounded to six decimals as the extractors store it */
function containingCellCentre(lon, lat, r = RADIUS) {
    const step = 2 * r, i = Math.floor((lon + 180) / step), j = Math.floor((lat + 90) / step);
    return [Number((-180 + (i + 0.5) * step).toFixed(6)), Number((-90 + (j + 0.5) * step).toFixed(6))];
}
const containingCellKey = (lon, lat) => { const [clon, clat] = containingCellCentre(lon, lat); return crypto.md5(JSON.stringify(cellPolygon(clon, clat))); };

const DAYS = [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const r4 = (v) => Math.round(v * 1e4) / 1e4;
/** the indicators of a grid block: the annual ones as stored, the derived ones from the twelve std_date_span_month entries */
function derive(block, { tasApprox = false } = {}) {
    if (!block) return {};
    const out = {};
    for (const [k, v] of Object.entries(block)) if (k.startsWith('env_climate_') && typeof v === 'number') out[k] = v;
    const months = nz(block.std_date_span_month, []).slice().sort((a, b) => a.std_month - b.std_month);
    const m = (g) => months.map((x) => x[g]), ok = (a) => a.length === 12 && a.every((v) => typeof v === 'number');
    let tas = m('env_climate_tas'); const pr = m('env_climate_pr'), srad = m('env_climate_srad');
    if (!ok(tas) && tasApprox) { const mx = m('env_climate_tasmax'), mn = m('env_climate_tasmin'); if (ok(mx) && ok(mn)) tas = mx.map((v, i) => (v + mn[i]) / 2); }
    if (ok(tas)) { out['env_climate_tas_summer'] = r4((tas[5] + tas[6] + tas[7]) / 3); out['env_climate_continentality'] = r4(Math.max(...tas) - Math.min(...tas)); out['env_climate_tas_coldest'] = Math.min(...tas); }
    if (ok(pr)) { out['env_climate_pr_summer'] = r4((pr[5] + pr[6] + pr[7]) / 3); out['env_climate_pr_winter'] = r4((pr[11] + pr[0] + pr[1]) / 3); const mx = Math.max(...pr), mn = Math.min(...pr); out['env_climate_pr_seasonality-ratio'] = mx > 0 ? r4((mx - mn) / mx) : 0; }
    if (ok(srad)) out['env_climate_srad_spring-summer'] = r4(srad.slice(2, 8).reduce((s, v, i) => s + v * DAYS[i + 2], 0) / 3600);
    return out;
}
module.exports = { containingCellCentre, containingCellKey, cellPolygon, derive };
