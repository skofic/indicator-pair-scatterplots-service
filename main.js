'use strict';
// The Foxx service of the EUFGIS map and scatterplot panes, mounted in the GeoService database (proposed mount: /panes).
// Every route is a read. Requests name their parameters by the data dictionary's terms (the keys of ui_layout_state),
// answers use the same vocabulary; the labels themselves come from the dictionary's own service (configuration metadataUi).
const createRouter = require('@arangodb/foxx/router');
const router = createRouter();
module.context.use(router);

router.use('/catalogue', require('./routes/catalogue'));  // datasets, climates, pairs, species, countries: what the selectors offer
router.use('/base',      require('./routes/base'));       // the base layer: the pair per surveyed cell, in the global cell order (cached)
router.use('/species',   require('./routes/species'));    // a species' cells (index list), units (per restriction level), suitability classes
router.use('/selection', require('./routes/selection'));  // a map geometry → the cells inside; a point → the climate values at that place
router.use('/units',     require('./routes/units'));      // the units index and the unit geometries for the map
router.use('/maps',      require('./routes/maps'));       // the raster and chorology manifest per species
router.use('/state',     require('./routes/state'));      // validation of a pane state, forwarded to the dictionary service
router.use('/health',    require('./routes/health'));     // collections, caches, dictionary reachability
