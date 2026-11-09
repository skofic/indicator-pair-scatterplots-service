'use strict';
// The collections this service reads and the two it owns, with their named indexes. setup.js creates every
// collection that is absent and every index that is absent (by name); teardown.js drops the owned ones and,
// only when the configuration says so, the data ones. The definitions of the Scatter* indexes are those of the
// indicator-pair-scatterplots repository (setup.js there), which loads the data.

const DATA = [
    { name: 'ScatterSpecies', indexes: [{ type: 'persistent', fields: ['species'], unique: true, name: 'idx_species' }] },
    { name: 'ScatterOccurrences', indexes: [
        { type: 'persistent', fields: ['species_list[*]'], name: 'idx_species_list' },
        { type: 'geo', fields: ['geometry_point'], geoJson: true, name: 'idx_geometry_point' },
    ] },
    { name: 'ScatterUnits', indexes: [{ type: 'persistent', fields: ['species_list[*]'], name: 'idx_species_list' }] },
    { name: 'ScatterCells', indexes: [] },
    { name: 'ScatterMaps', indexes: [{ type: 'persistent', fields: ['species', 'std_dataset_ids[*]'], name: 'idx_species_dataset' }] },
];

// Owned: the answer cache (one document per cached answer: payload, etag, built, count) and the suitability classes
// (one document per species × EU-Trees4F period × scenario × variant, the class digit per cell in the global order).
const OWNED = [
    { name: 'PanesCache', indexes: [] },
    { name: 'PanesSuitability', indexes: [{ type: 'persistent', fields: ['species', 'period', 'scenario', 'variant'], unique: true, name: 'idx_species_key' }] },
];

// Read only, never created here: GeoService's own collections.
const EXTERNAL = ['Dataset', 'WorldClim', 'Chelsa', 'Units', 'UnitPolygons'];

module.exports = { DATA, OWNED, EXTERNAL, all: DATA.concat(OWNED) };
