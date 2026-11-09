'use strict';
// The global cell order: every ScatterOccurrences document sorted by _key. Every layer answer is an index list into
// this order (species cells, map selection) or an array aligned with it (the base layer, the suitability classes),
// so nothing is re-keyed and the pane joins by position. Built on first use, kept in memory with the collection's
// count as the staleness check (a reload changes the count or, failing that, setup restarts the service).
const { db } = require('@arangodb');

let keys = null, index = null, count = -1;
function refresh() {
    const n = db._collection('ScatterOccurrences').count();
    if (keys && n === count) return;
    keys = db._query('FOR d IN ScatterOccurrences SORT d._key RETURN d._key').toArray();
    index = new Map(keys.map((k, i) => [k, i]));
    count = n;
}
module.exports = {
    keys: () => { refresh(); return keys; },
    length: () => { refresh(); return keys.length; },
    indexOf: (key) => { refresh(); return index.get(key); },
    /** keys → sorted index list (unknown keys dropped) */
    indices: (ks) => { refresh(); const out = []; for (const k of ks) { const i = index.get(k); if (i !== undefined) out.push(i); } return out.sort((a, b) => a - b); },
    version: () => { refresh(); return `${count}:${keys[0]}:${keys[keys.length - 1]}`; },
};
