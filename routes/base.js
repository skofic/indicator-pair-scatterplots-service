'use strict';
const createRouter = require('@arangodb/foxx/router');
const { resolveClimate, resolveAxes } = require('../lib/state');
const { base } = require('../lib/queries');
const cache = require('../lib/cache');
const { stateParams, guard } = require('../lib/http');
const { K } = require('../lib/config');
const router = createRouter();
router.tag('Layers');

// GET /base?std_dataset_ids=&env_climate_period=&env_climate_scenario=&ui_layout_scatterplot_X=&ui_layout_scatterplot_Y=
stateParams(router.get('/', guard(function (req, res) {
    const c = resolveClimate(req.queryParams), axes = resolveAxes(req.queryParams);
    cache.serve(req, res, cache.safeKey(`base|${c.dataset}|${c.period}|${c.scenario}|${axes.x}|${axes.y}`), () => base(c, axes));
})), [K.dataset, K.period, K.scenario, K.X, K.Y])
.response(['application/json'], 'An array in the global cell order: [x, y] per cell, or null where the cell has no value for this climate')
.error(400, 'Unknown dataset, period, scenario or axis (the message names the key)')
.summary('The base layer: the pair per surveyed cell')
.description(
    'The bottom layer of the scatterplot: every EU-Forest survey cell (the global cell order, ScatterOccurrences sorted by `_key`) with the ' +
    'two indicator values for the requested climate, `null` where the cell has none (outside the land mask, or a derived indicator the source lacks). ' +
    'About 2.7 MB; computed on the first request and kept in PanesCache, then served with an `ETag` (a matching `If-None-Match` gets 304). ' +
    'The species layer and the map selection are index lists into this same order (GET /species/cells, POST /selection).');

module.exports = router;
