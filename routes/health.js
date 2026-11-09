'use strict';
const createRouter = require('@arangodb/foxx/router');
const { db } = require('@arangodb');
const request = require('@arangodb/request');
const schema = require('../lib/schema');
const cache = require('../lib/cache');
const order = require('../lib/order');
const router = createRouter();
router.tag('Health');

// GET /health
router.get('/', function (req, res) {
    const collections = {};
    for (const c of schema.all.concat(schema.EXTERNAL.map((n) => ({ name: n })))) { const coll = db._collection(c.name); collections[c.name] = coll ? { count: coll.count(), indexes: coll.indexes().map((i) => i.name).filter((n) => n !== 'primary') } : null; }
    let dictionary = null;
    try { const r = request.get(`${module.context.configuration.metadataUi}/term/ui_layout_state`, { timeout: 5 }); dictionary = { status: r.status, ok: r.status === 200 }; } catch (e) { dictionary = { ok: false, error: e.message }; }
    res.json({ service: module.context.manifest.name, version: module.context.manifest.version, mount: module.context.mount, configuration: { maxLevel: module.context.configuration.maxLevel, lang: module.context.configuration.lang, metadataUi: module.context.configuration.metadataUi }, collections, cells: collections.ScatterOccurrences ? order.length() : null, cache: cache.stats(), dictionary });
})
.response(['application/json'], 'Service, mount, configuration, collections with counts and index names, the global order length, cache statistics, dictionary reachability')
.summary('Health check')
.description('What an installer or a monitor needs to see: every collection the service reads or owns with its count and named indexes (null when absent), the global cell order length, the cache, and whether the dictionary service answers.');

module.exports = router;
