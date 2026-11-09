'use strict';
// PanesCache: the large answers, computed once and stored as a JSON string with an ETag. A document holds
// { _key, payload (string), etag, built, count, version (the global order's) }; setup empties the collection.
const { db } = require('@arangodb');
const crypto = require('@arangodb/crypto');
const order = require('./order');

const coll = () => db._collection('PanesCache');
function get(key) {
    const c = coll(); if (!c) return null;
    const doc = c.exists(key) ? c.document(key) : null;
    return doc && doc.version === order.version() ? doc : null;
}
function put(key, payload, count) {
    const c = coll(); if (!c) return { payload, etag: crypto.md5(payload) };
    const doc = { _key: key, payload, etag: crypto.md5(payload), built: new Date().toISOString(), count, version: order.version() };
    if (c.exists(key)) c.replace(key, doc); else c.save(doc);
    return doc;
}
/** compute-or-serve: `make()` returns { value, count }; the JSON string and etag are sent with cache headers */
function serve(req, res, key, make) {
    let doc = get(key);
    if (!doc) { const { value, count } = make(); doc = put(key, JSON.stringify(value), count); }
    res.set('ETag', `"${doc.etag}"`); res.set('Cache-Control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === `"${doc.etag}"`) { res.status(304); return; }
    res.set('Content-Type', 'application/json'); res.body = doc.payload;
}
const stats = () => { const c = coll(); return c ? { documents: c.count(), bytes: db._query('FOR d IN PanesCache RETURN LENGTH(d.payload)').toArray().reduce((a, b) => a + b, 0) } : null; };
module.exports = { get, put, serve, stats, safeKey: (s) => s.replace(/[^A-Za-z0-9_:.@()+,=;$!*'%-]/g, '_') };
