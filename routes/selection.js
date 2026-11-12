'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const { resolveClimate, resolveAxes } = require('../lib/state');
const { selection } = require('../lib/queries');
const { guard } = require('../lib/http');
const { K } = require('../lib/config');
const router = createRouter();
router.tag('Selection');

// POST /selection  body: { ui_layout_map_selection: <GeoJSON>, std_dataset_ids?, env_climate_period?, env_climate_scenario?, ui_layout_scatterplot_X?, ui_layout_scatterplot_Y? }
router.post('/', guard(function (req, res) {
    const b = req.body, g = b[K.selection];
    if (!g || !g.type) res.throw(400, `${K.selection}: a GeoJSON geometry is required`);
    const c = resolveClimate(b, { required: false }), axes = c ? resolveAxes(b) : null;
    res.json(selection(g, c, axes));
}))
.body(joi.object({
    [K.selection]: joi.object({ type: joi.string().valid('Point', 'Polygon', 'MultiPolygon').required(), coordinates: joi.array().required() }).required(),
    [K.dataset]: joi.alternatives().try(joi.string(), joi.array().items(joi.string())).optional(),
    [K.period]: joi.string().optional(), [K.scenario]: joi.string().optional(), [K.X]: joi.string().optional(), [K.Y]: joi.string().optional(),
}).unknown(true), 'A partial pane state: the drawn geometry (WGS84) and, for a point, the climate whose values to read')
.response(['application/json'], '{ cells: index list of the surveyed cells inside; for a point also nearest { cell, metres }, geo_shape_elevation (m, from the WorldClim 2.1 elevation layer of the containing 1 km cell, null outside the grid) and point { cell, source, found, values: [x, y] } }')
.error(400, 'No geometry, or an unknown climate / axis')
.summary('A map geometry → cells; a point → climate values')
.description(
    'The map → scatterplot link. A **Polygon** (or MultiPolygon) returns the positions, in the global cell order, of the survey cells it contains (geo index). ' +
    'A **Point** returns the containing survey cell if one lies within 710 m (the half-diagonal of a 1 km cell), the nearest one within 5 km with its distance, and — when the state names a climate and axes — ' +
    'the pair at that place: from the 1 km grid (WorldClim / Chelsa collections, the containing cell found by its derived key, the indicators derived as the loaders derive them) or, for EU-Trees4F, from the containing survey cell only.');

module.exports = router;
