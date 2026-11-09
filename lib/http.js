'use strict';
// Shared route helpers: the query-parameter declarations of the state keys (the same joi and help text on every
// route), and the error mapping of lib/state.js's StateError (400 with the offending key) onto res.throw.
const joi = require('joi');
const { K, LEVELS } = require('./config');

const PARAM = {
    [K.dataset]: [joi.alternatives().try(joi.string(), joi.array().items(joi.string())), 'The dataset `_key` of the climate source (std_dataset_ids; a JSON array of one key or the bare key). See GET /catalogue → datasets.'],
    [K.period]: [joi.string(), 'The period term, e.g. env_climate_period_worldclim21_2041-2060. See GET /catalogue → climates.'],
    [K.scenario]: [joi.string(), 'The scenario term: env_climate_scenario_historical (default), _ssp370, _rcp45, _rcp85.'],
    [K.X]: [joi.string(), 'The X axis descriptor (default env_climate_bio01). See GET /catalogue → axes.'],
    [K.Y]: [joi.string(), 'The Y axis descriptor (default env_climate_bio12).'],
    [K.species]: [joi.string(), 'The species, as its scientific name.'],
    [K.country]: [joi.string(), 'A country term (ISO_3166_1_<alpha-3>) or the alpha-3 code: unit filter, and the requester\'s country at the manage level.'],
    [K.unit]: [joi.string(), 'A unit number (e.g. FRA00023).'],
    [K.level]: [joi.string().valid(...LEVELS), 'The coordinates-restriction level the portal grants this request: ' + LEVELS.join(', ') + ' (default public; clamped to the configured maxLevel). Also accepted as the header X-Restriction-Level.'],
    [K.variant]: [joi.string(), 'The EU-Trees4F suitability variant term: ui_layout_scatterplot_view_classes_variant_potential (default) or _dispersal.'],
};
/** declare the given state keys as optional query parameters of a route */
function stateParams(route, keys) { for (const k of keys) route.queryParam(k, PARAM[k][0].optional(), PARAM[k][1]); return route; }
/** run a handler, mapping StateError (and anything carrying .status) onto res.throw */
function guard(fn) { return function (req, res) { try { fn(req, res); } catch (e) { if (e.status) res.throw(e.status, e.message); throw e; } }; }

module.exports = { stateParams, guard, PARAM };
