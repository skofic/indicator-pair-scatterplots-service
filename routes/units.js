'use strict';
const createRouter = require('@arangodb/foxx/router');
const { resolveLevel } = require('../lib/state');
const { unitsIndex, unitsGeo } = require('../lib/queries');
const { stateParams, guard } = require('../lib/http');
const { K } = require('../lib/config');
const router = createRouter();
router.tag('Units');

// GET /units/index?gcu_loc_coordinates-restriction_level=
stateParams(router.get('/index', guard(function (req, res) {
    res.json(unitsIndex(resolveLevel(req.queryParams, req.headers)));
})), [K.level])
.response(['application/json'], 'Every unit the level allows: gcu_id_number, gcu_id_country (ISO_3166_1_* term), species_list, gcu_loc_coordinates-restriction, gcu_loc_climate_distance')
.summary('The units index')
.description('The host page\'s shared controls: countries, species and units with their facets are built from this list. At the public level restricted units are absent; no geometry at any level.');

// GET /units/geo?gcu_loc_coordinates-restriction_level=&gcu_id_country=&species=&gcu_id_number=
stateParams(router.get('/geo', guard(function (req, res) {
    const level = resolveLevel(req.queryParams, req.headers);
    const out = unitsGeo(level, req.queryParams[K.unit] ?? null, req.queryParams[K.species] ?? null);
    if (!out) res.throw(404, `${K.unit}: unknown unit`);
    res.json(out);
})), [K.level, K.country, K.species, K.unit])
.response(['application/json'], 'A GeoJSON FeatureCollection: the reference points of the units (overview, optionally one species), or one unit\'s polygon when gcu_id_number is given; `withheld: true` when the level forbids that unit\'s geometry')
.error(404, 'Unknown unit')
.summary('Unit geometries for the map')
.description(
    'Overview: one Point feature per unit with its reference point. One unit: its polygon from UnitPolygons (its point when it has none). ' +
    'The geometry rule: a restricted unit\'s point or polygon is returned at the manage level only, and only when the requester\'s `gcu_id_country` is the unit\'s; unrestricted units always. ' +
    'Simplified overview polygons for all units are a static file of the Serve Plan, not a route.');

module.exports = router;
