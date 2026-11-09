'use strict';
// Installer. Runs on install and upgrade, and on demand (POST /_api/foxx/scripts/setup?mount=<mount>).
//
// 1. Collections — every Scatter* data collection and the two owned ones (lib/schema.js): created when absent,
//    left untouched when present (the data is loaded by the indicator-pair-scatterplots pipeline, never here).
// 2. Named indexes — created when no index of that name exists on the collection, left alone otherwise.
// 3. The answer cache is emptied (its contents belong to the data as it was).
// 4. With the `prefill` configuration, the base layer of every pair × climate is computed into the cache.
const { db } = require('@arangodb');
const { context } = require('@arangodb/locals');
const schema = require('../lib/schema');
const log = (m) => console.log('[setup] ' + m);

for (const c of schema.all) {
    let coll = db._collection(c.name);
    if (!coll) { coll = db._createDocumentCollection(c.name); log(`created collection ${c.name}`); }
    else if (!context.isProduction) console.debug(`[setup] collection ${c.name} exists; left untouched`);
    const have = new Set(coll.indexes().map((i) => i.name));
    for (const idx of c.indexes) {
        if (have.has(idx.name)) continue;
        coll.ensureIndex(idx); log(`created index ${c.name}.${idx.name} (${idx.type} on ${idx.fields.join(', ')})`);
    }
}
for (const name of schema.EXTERNAL) if (!db._collection(name)) console.warn(`[setup] GeoService collection ${name} is absent: the routes that read it will fail until it exists`);

db._collection('PanesCache').truncate(); log('emptied PanesCache');

if (context.configuration.prefill) {
    const { climates, resolveAxes } = require('../lib/state');
    const { PAIRS, K } = require('../lib/config');
    const { base } = require('../lib/queries');
    const cache = require('../lib/cache');
    if (db._collection('ScatterOccurrences').count() === 0) console.warn('[setup] ScatterOccurrences is empty: nothing to prefill');
    else {
        let n = 0;
        for (const c of climates()) for (const p of PAIRS) {
            const axes = resolveAxes({ [K.X]: p.x, [K.Y]: p.y });
            const { value, count } = base(c, axes);
            cache.put(cache.safeKey(`base|${c.dataset}|${c.period}|${c.scenario}|${axes.x}|${axes.y}`), JSON.stringify(value), count); n++;
        }
        log(`prefilled ${n} base answers`);
    }
}
