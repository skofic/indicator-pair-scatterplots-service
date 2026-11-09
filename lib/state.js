'use strict';
// Reading a request as a (partial) ui_layout_state: the climate (dataset, period, scenario), the axes, the restriction
// level. Every resolver throws a 400-shaped error naming the key that is wrong; the routes pass it to res.throw.
const { db } = require('@arangodb');
const { SOURCES, AXES, PAIRS, K, LEVELS, periodGid, scenarioGid } = require('./config');

class StateError extends Error { constructor(key, message) { super(`${key}: ${message}`); this.key = key; this.status = 400; } }

// dataset code → { key, title, definition } from the Dataset collection, resolved once per service lifetime
let datasets = null;
function datasetByCode() {
    if (datasets) return datasets;
    datasets = {};
    const lang = module.context.configuration.lang;
    for (const src of Object.keys(SOURCES)) {
        const d = db._query(`FOR d IN Dataset FILTER d.std_dataset_code == @code RETURN { key: d._key, title: d._info._title, definition: d._info._definition || d._info._description }`, { code: SOURCES[src].code }).toArray()[0];
        if (d) datasets[src] = { ...d, title: d.title ? (d.title[lang] ?? Object.values(d.title)[0]) : SOURCES[src].code, definition: d.definition ? (d.definition[lang] ?? Object.values(d.definition)[0]) : '' };
    }
    return datasets;
}
const srcOfDataset = (key) => Object.keys(datasetByCode()).find((src) => datasetByCode()[src].key === key) ?? null;

/** Every climate block: { src, dataset, period, scenario, present, periodGid, scenarioGid, key } */
function climates() {
    const out = [], ds = datasetByCode();
    for (const [src, S] of Object.entries(SOURCES)) {
        if (!ds[src]) continue;
        const add = (period, scenario) => out.push({ src, dataset: ds[src].key, period, scenario: scenario || '', present: !scenario, periodGid: periodGid(src, period), scenarioGid: scenarioGid(scenario), key: `${periodGid(src, period)}|${scenarioGid(scenario)}` });
        add(S.period, '');
        for (const p of S.future.periods) { if (S.future.scenarios) for (const sc of S.future.scenarios) add(p, sc); else add(p, S.future.ssp); }
    }
    return out;
}

/** The AQL path of a climate block inside a Scatter* document `d` (with bind values) */
function blockPath(c) {
    const S = SOURCES[c.src];
    if (c.present) return { path: `d.properties[@src][@period]`, bind: { src: c.src, period: c.period } };
    if (S.future.scenarios) return { path: `d.properties[@src][@period][@scenario]`, bind: { src: c.src, period: c.period, scenario: c.scenario } };
    return { path: `d.properties[@src][@period][@model][@ssp]`, bind: { src: c.src, period: c.period, model: S.future.model, ssp: S.future.ssp } };
}

/** A query parameter that may arrive as a JSON array, a repeated value or a single value: the first dataset key */
const first = (v) => { if (Array.isArray(v)) return v[0]; if (typeof v === 'string' && v.startsWith('[')) { try { return JSON.parse(v)[0]; } catch { return v; } } return v; };

/** The climate a request names: std_dataset_ids + env_climate_period (+ env_climate_scenario, historical when absent) */
function resolveClimate(q, { required = true } = {}) {
    const dataset = first(q[K.dataset]);
    if (!dataset) { if (!required) return null; throw new StateError(K.dataset, 'a dataset key is required'); }
    const src = srcOfDataset(dataset);
    if (!src) throw new StateError(K.dataset, `unknown dataset ${dataset}`);
    const pg = q[K.period], sg = q[K.scenario] ?? scenarioGid('');
    if (!pg) { if (!required) return null; throw new StateError(K.period, 'a period is required'); }
    const c = climates().find((k) => k.dataset === dataset && k.periodGid === pg && k.scenarioGid === sg);
    if (!c) throw new StateError(K.period, `${src} has no ${pg} under ${sg}`);
    return c;
}
/** The two axes: configured X and Y descriptors (default: pair P1) */
function resolveAxes(q) {
    const x = q[K.X] ?? PAIRS[0].x, y = q[K.Y] ?? PAIRS[0].y;
    if (!AXES.X.includes(x)) throw new StateError(K.X, `${x} is not an X axis (${AXES.X.join(', ')})`);
    if (!AXES.Y.includes(y)) throw new StateError(K.Y, `${y} is not a Y axis (${AXES.Y.join(', ')})`);
    return { x, y };
}
/** The restriction level, clamped to the instance's maximum; the requester's country for the manage level */
function resolveLevel(q, headers = {}) {
    const asked = q[K.level] ?? headers['x-restriction-level'] ?? LEVELS[0];
    if (!LEVELS.includes(asked)) throw new StateError(K.level, `${asked} is not a level (${LEVELS.join(', ')})`);
    const max = module.context.configuration.maxLevel;
    const level = LEVELS[Math.min(LEVELS.indexOf(asked), LEVELS.indexOf(max) < 0 ? 2 : LEVELS.indexOf(max))];
    const country = q[K.country] ?? headers['x-restriction-country'] ?? null;   // ISO_3166_1_<alpha-3> term, or the alpha-3 code
    return { level, lid: level.split('_').pop(), country: country ? String(country).split('_').pop() : null };
}

module.exports = { StateError, datasetByCode, climates, blockPath, resolveClimate, resolveAxes, resolveLevel, first };
