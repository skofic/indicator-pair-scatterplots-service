'use strict';
const createRouter = require('@arangodb/foxx/router');
const { maps } = require('../lib/queries');
const { stateParams, guard, PARAM } = require('../lib/http');
const { K } = require('../lib/config');
const router = createRouter();
router.tag('Maps');

// GET /maps?species=
router.get('/', guard(function (req, res) {
    const s = req.queryParams[K.species]; if (!s) res.throw(400, `${K.species}: a species is required`);
    res.json(maps(s));
}))
.queryParam(K.species, PARAM[K.species][0].required(), PARAM[K.species][1])
.response(['application/json'], '{ species, atlas_rpp, atlas_mhs, eutrees4f: { "<period>|<scenario>|<variant>": entry }, chorology: [entries] }; an entry is { path, format, crs, licence, citation, resolution }')
.summary('The maps of a species')
.description('The raster and vector files of a species from the ScatterMaps manifest: the Atlas relative probability of presence and maximum habitat suitability (1 km COGs, EPSG:3035), the EU-Trees4F SDM-ensemble binary layers by period, scenario and variant (10 km COGs), the chorology GeoJSON. Paths are relative to the static file host of the Serve Plan; the files are not served by this service (cloud-optimised GeoTIFFs are read by byte range).');

module.exports = router;
