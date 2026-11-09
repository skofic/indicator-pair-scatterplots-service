'use strict';
const createRouter = require('@arangodb/foxx/router');
const { catalogue } = require('../lib/queries');
const cache = require('../lib/cache');
const router = createRouter();
router.tag('Catalogue');

// GET /catalogue
router.get('/', function (req, res) {
    cache.serve(req, res, 'catalogue', () => { const c = catalogue(); return { value: c, count: c.species.length }; });
})
.response(['application/json'], 'The selector catalogue')
.summary('What the selectors offer')
.description(
    'Everything the panes need to build their selectors, in the dictionary\'s vocabulary:\n\n' +
    '- **datasets** — the climate sources as Dataset records: `std_dataset_ids` (the key the panes send), code, title and definition in the configured language, whether a 1 km grid exists for click lookups.\n' +
    '- **climates** — every dataset × period × scenario: `env_climate_period` and `env_climate_scenario` terms with their data aliases, `present` for the reference period, and `key` (`<period gid>|<scenario gid>`), the key of a unit\'s `values`.\n' +
    '- **axes** — the X and Y descriptors offered (`ui_layout_scatterplot_X` / `_Y`) and the five pairs whose Y is suggested when X changes.\n' +
    '- **species** — every taxon of ScatterSpecies with its availability: scatterplot cells, Atlas presence / suitability maps, EU-Trees4F maps, EUFGIS units.\n' +
    '- **countries** — the countries of the units as `gcu_id_country` terms with unit counts.\n' +
    '- **cells** — the length of the global cell order every index list refers to; **levels** — the restriction levels.\n\n' +
    'Cached (PanesCache) with an ETag; the labels of all these terms come from the dictionary service.');

module.exports = router;
