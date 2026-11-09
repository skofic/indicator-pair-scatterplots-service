'use strict';
// Destructor. Runs on uninstall (and on a REPLACE). Drops the two collections this service owns — PanesCache and
// PanesSuitability — and nothing else, unless the configuration `teardownDropsData` is true, in which case the
// Scatter* data collections go too. Off by default on purpose: a wrong mount or a replace must never erase the
// loaded cells (the metadata-store lesson). To upgrade, PATCH with teardown=false&setup=true.
const { db } = require('@arangodb');
const { context } = require('@arangodb/locals');
const schema = require('../lib/schema');

for (const c of schema.OWNED) if (db._collection(c.name)) { db._drop(c.name); console.log(`[teardown] dropped ${c.name}`); }
if (context.configuration.teardownDropsData) {
    for (const c of schema.DATA) if (db._collection(c.name)) { db._drop(c.name); console.warn(`[teardown] dropped data collection ${c.name} (teardownDropsData is on)`); }
} else console.log('[teardown] data collections kept (teardownDropsData is off)');
