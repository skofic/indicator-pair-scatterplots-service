'use strict';
const nz = (v, d) => (v === undefined || v === null ? d : v);   // `??` for ArangoDB 3.11's V8, which lacks the operator
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const { resolveClimate, resolveAxes, resolveLevel, first } = require('../lib/state');
const { speciesCells, units, classes } = require('../lib/queries');
const cache = require('../lib/cache');
const { stateParams, guard, PARAM } = require('../lib/http');
const { K } = require('../lib/config');
const { db } = require('@arangodb');
const router = createRouter();
router.tag('Species');

const known = (s) => db._query('FOR d IN ScatterSpecies FILTER d.species == @s RETURN 1', { s }).toArray().length > 0;
const speciesOf = (req, res) => { const s = req.queryParams[K.species]; if (!s) res.throw(400, `${K.species}: a species is required`); if (!known(s)) res.throw(404, `${K.species}: ${s} is not in ScatterSpecies`); return s; };

// GET /species/cells?species=
router.get('/cells', guard(function (req, res) {
    const s = speciesOf(req, res);
    cache.serve(req, res, cache.safeKey(`cells|${s}`), () => { const idx = speciesCells(s); return { value: idx, count: idx.length }; });
}))
.queryParam(K.species, PARAM[K.species][0].required(), PARAM[K.species][1])
.response(['application/json'], 'A sorted array of positions in the global cell order')
.error(404, 'Unknown species')
.summary('The cells holding a species (index list)')
.description('The species layer: the positions, in the global cell order, of the survey cells where the species occurs (EU-Forest). Climate-independent: the pane reads the pair values from the base layer at these positions. Cached with an ETag.');

// GET /species/units?species=&std_dataset_ids=&ui_layout_scatterplot_X=&ui_layout_scatterplot_Y=&gcu_loc_coordinates-restriction_level=&gcu_id_country=&gcu_id_number=
stateParams(router.get('/units', guard(function (req, res) {
    const s = req.queryParams[K.species] ? speciesOf(req, res) : null, level = resolveLevel(req.queryParams, req.headers), axes = resolveAxes(req.queryParams);   // no species: every unit the level allows (the panes' empty state, 2026-11-12)
    const dataset = nz(first(req.queryParams[K.dataset]), null);
    const country = req.queryParams[K.country] ? String(req.queryParams[K.country]).split('_').pop() : null;
    res.json(units(s, level, axes, dataset, { country, unit: nz(req.queryParams[K.unit], null) }));
})), [K.species, K.dataset, K.X, K.Y, K.level, K.country, K.unit])
.response(['application/json'], 'The units of the species the level allows, each with gcu_id_number, species_list, gcu_loc_coordinates-restriction, gcu_loc_climate_distance, values { "<period gid>|<scenario gid>": [x, y] } for every climate of the dataset, and gcu_loc_climate where the geometry rule allows it')
.error(404, 'Unknown species')
.summary('The units of a species (or every unit, without a species), per restriction level')
.description(
    'The top layer of the scatterplot. Without `species`, every unit the level allows (the panes\' empty state: nothing chosen yet). **Restriction level** (`gcu_loc_coordinates-restriction_level`, set by the portal): `public` omits restricted units; `value` returns them with identifiers, climate values and distance, never a point; ' +
    '`manage` adds the reference point (`gcu_loc_climate`) of restricted units of the requester\'s country (`gcu_id_country`) only. Unrestricted units carry their point at every level. ' +
    'The `values` cover every period and scenario of the requested dataset, so the pane draws present → future arrows without a second call; without a dataset no values are returned.');

// GET /species/classes?species=&std_dataset_ids=&env_climate_period=&env_climate_scenario=&ui_layout_scatterplot_view_classes_variant=
stateParams(router.get('/classes', guard(function (req, res) {
    const s = speciesOf(req, res), c = resolveClimate(req.queryParams);
    const out = classes(s, c, nz(req.queryParams[K.variant], 'ui_layout_scatterplot_view_classes_variant_potential'));
    if (!out) res.throw(404, 'no suitability classes for this species and climate (EU-Trees4F future periods only, and the species must be in PanesSuitability)');
    res.json(out);
})), [K.species, K.dataset, K.period, K.scenario, K.variant])
.response(['application/json'], '{ species, env_climate_period, env_climate_scenario, ui_layout_scatterplot_view_classes_variant, cells: one digit per cell of the global order, counts }')
.error(404, 'Unknown species, or no classes for this climate')
.summary('The EU-Trees4F suitability class per cell')
.description(
    'For an EU-Trees4F future period and scenario: every cell\'s class from the published binary maps (current potential map vs the period\'s map, potential or natural-dispersal variant), ' +
    'as one digit per cell in the global order — the aliases of `ui_layout_scatterplot_view_classes_legend`: 0 unsuitable, 1 stable, 2 decolonised, 3 newly suitable. ' +
    'Read from PanesSuitability, which the indicator-pair-scatterplots loader fills.');

module.exports = router;
