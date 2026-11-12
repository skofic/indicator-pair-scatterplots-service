/*global describe, it */
'use strict';
// Tests run inside the database against the live Scatter* collections (POST /_api/foxx/tests?mount=<mount>).
// Fixtures: Fagus sylvatica (530 units, 35 853 cells), WorldClim 2.1 and EU-Trees4F datasets from the catalogue.
const { expect } = require('chai');
const request = require('@arangodb/request');
const base = module.context.baseUrl;
const get = (path, qs) => request.get(`${base}${path}`, { qs });
const post = (path, body) => request.post(`${base}${path}`, { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const json = (r) => JSON.parse(r.body);
const K = require('../lib/config').K;
// A public-only instance (configuration maxLevel = public, the work server) clamps every level to public: the two tests that
// need the value and manage levels are skipped there, and one test checks the clamp instead.
const PUBLIC_ONLY = module.context.configuration.maxLevel === 'gcu_loc_coordinates-restriction_public';

describe('catalogue', function () {
    const cat = json(get('/catalogue'));
    it('lists three datasets, their climates, the axes and the species', function () {
        expect(cat.datasets).to.have.lengthOf(3);
        expect(cat.climates.length).to.be.greaterThan(10);
        expect(cat.axes[K.X]).to.include('env_climate_bio01');
        expect(cat.axes.pairs).to.have.lengthOf(5);
        expect(cat.species.map((s) => s.species)).to.include('Fagus sylvatica');
        expect(cat.cells).to.be.greaterThan(200000);
    });
    it('names periods and scenarios as dictionary terms with data aliases', function () {
        const wc = cat.climates.find((c) => c.src === 'worldclim' && c.present);
        expect(wc[K.period]).to.equal('env_climate_period_worldclim21_1970-2000');
        expect(wc[K.scenario]).to.equal('env_climate_scenario_historical');
        expect(wc.period).to.equal('1970-2000');
    });
});

describe('base and species', function () {
    const cat = json(get('/catalogue'));
    const wc = cat.climates.find((c) => c.src === 'worldclim' && c.present), fut = cat.climates.find((c) => c.src === 'worldclim' && !c.present);
    const climate = (c) => ({ [K.dataset]: c[K.dataset], [K.period]: c[K.period], [K.scenario]: c[K.scenario] });
    it('GET /base returns one entry per cell of the global order, with an ETag honoured by If-None-Match', function () {
        const r = get('/base', climate(wc));
        expect(r.status).to.equal(200);
        const arr = json(r);
        expect(arr).to.have.lengthOf(cat.cells);
        expect(arr.find((v) => v)).to.have.lengthOf(2);
        const etag = r.headers.etag; expect(etag).to.be.a('string');
        const again = request.get(`${base}/base`, { qs: climate(wc), headers: { 'if-none-match': etag } });
        expect(again.status).to.equal(304);
    });
    it('GET /base rejects an unknown period naming the key', function () {
        const r = get('/base', { ...climate(wc), [K.period]: 'env_climate_period_worldclim21_1900-1930' });
        expect(r.status).to.equal(400);
        expect(r.body).to.include(K.period);
    });
    it('GET /species/cells is a sorted index list within the order', function () {
        const idx = json(get('/species/cells', { species: 'Fagus sylvatica' }));
        expect(idx.length).to.be.greaterThan(30000);
        expect(idx.every((v, i) => i === 0 || v > idx[i - 1])).to.equal(true);
        expect(idx[idx.length - 1]).to.be.lessThan(cat.cells);
    });
    it('GET /species/classes returns one digit per cell for an EU-Trees4F future, 404 for the reference period', function () {
        const t4 = cat.climates.filter((c) => c.src === 'eutrees4f'), f = t4.find((c) => !c.present), p = t4.find((c) => c.present);
        const r = get('/species/classes', { species: 'Quercus ilex', ...climate(f) });
        if (r.status === 404) return;   // PanesSuitability not loaded for this species on this server
        const j = json(r);
        expect(j.cells).to.have.lengthOf(cat.cells);
        expect(j.cells).to.match(/^[0-3]+$/);
        expect(get('/species/classes', { species: 'Quercus ilex', ...climate(p) }).status).to.equal(404);
    });
    it('GET /species/cells returns 404 for an unknown species', function () {
        expect(get('/species/cells', { species: 'Nullus arbor' }).status).to.equal(404);
    });
    (PUBLIC_ONLY ? it.skip : it)('GET /species/units: public omits restricted units, value returns them without a point, manage adds the point for the requester\'s country only', function () {
        const common = { species: 'Fagus sylvatica', [K.dataset]: wc[K.dataset] };
        const pub = json(get('/species/units', { ...common, [K.level]: 'gcu_loc_coordinates-restriction_public' }));
        const val = json(get('/species/units', { ...common, [K.level]: 'gcu_loc_coordinates-restriction_value' }));
        expect(pub.every((u) => !u['gcu_loc_coordinates-restriction'])).to.equal(true);
        expect(val.length).to.be.greaterThan(pub.length);
        const restricted = val.filter((u) => u['gcu_loc_coordinates-restriction']);
        expect(restricted.every((u) => !('gcu_loc_climate' in u))).to.equal(true);
        expect(restricted[0].values[wc.key]).to.have.lengthOf(2);
        expect(restricted[0].values[fut.key]).to.have.lengthOf(2);
        const country = restricted[0].gcu_id_number.slice(0, 3);
        const man = json(get('/species/units', { ...common, [K.level]: 'gcu_loc_coordinates-restriction_manage', [K.country]: 'ISO_3166_1_' + country }));
        const mine = man.filter((u) => u['gcu_loc_coordinates-restriction'] && u.gcu_id_number.startsWith(country));
        const others = man.filter((u) => u['gcu_loc_coordinates-restriction'] && !u.gcu_id_number.startsWith(country));
        expect(mine.length).to.equal(restricted.filter((u) => u.gcu_id_number.startsWith(country)).length);   // the country filter: that country's restricted units
        expect(mine.every((u) => 'gcu_loc_climate' in u)).to.equal(true);
        expect(others).to.have.lengthOf(0);
    });
    (PUBLIC_ONLY ? it : it.skip)('on a public-only instance the value and manage levels are clamped: no restricted unit, no withheld geometry', function () {
        const common = { species: 'Fagus sylvatica', [K.dataset]: wc[K.dataset] };
        const pub = json(get('/species/units', { ...common, [K.level]: 'gcu_loc_coordinates-restriction_public' }));
        const man = json(get('/species/units', { ...common, [K.level]: 'gcu_loc_coordinates-restriction_manage' }));
        expect(man.length).to.equal(pub.length);
        expect(man.every((u) => !u['gcu_loc_coordinates-restriction'] && 'gcu_loc_climate' in u)).to.equal(true);
        const index = json(get('/units/index', { [K.level]: 'gcu_loc_coordinates-restriction_manage' }));
        expect(index.some((u) => u['gcu_loc_coordinates-restriction'])).to.equal(false);
        expect(json(get('/health')).configuration.maxLevel).to.equal('gcu_loc_coordinates-restriction_public');
    });
    it('GET /species/units without a level is the public level', function () {
        const r = json(get('/species/units', { species: 'Fagus sylvatica' }));
        expect(r.every((u) => !u['gcu_loc_coordinates-restriction'])).to.equal(true);
        expect(Object.keys(r[0].values)).to.have.lengthOf(0);   // no dataset, no values
        expect(r[0].geo_shape_elevation).to.be.a('number');   // the polygon's mean elevation, with its minimum and maximum
        expect(r[0]['gcu_loc_elevation-min']).to.be.at.most(r[0]['gcu_loc_elevation-max']);
    });
});

describe('selection', function () {
    const cat = json(get('/catalogue'));
    const wc = cat.climates.find((c) => c.src === 'worldclim' && c.present);
    it('a polygon returns the cells inside, as indices', function () {
        const r = json(post('/selection', { [K.selection]: { type: 'Polygon', coordinates: [[[7.8, 47.8], [8.4, 47.8], [8.4, 48.4], [7.8, 48.4], [7.8, 47.8]]] } }));
        expect(r.cells.length).to.be.greaterThan(100);
        expect(r.cells.every((v, i) => i === 0 || v > r.cells[i - 1])).to.equal(true);
    });
    it('a point returns the climate values from the 1 km grid, with or without a surveyed cell', function () {
        const r = json(post('/selection', { [K.selection]: { type: 'Point', coordinates: [8.1, 48.0] }, [K.dataset]: wc[K.dataset], [K.period]: wc[K.period], [K.scenario]: wc[K.scenario] }));
        expect(r.point.source).to.equal('WorldClim');
        expect(r.point.values).to.have.lengthOf(2);
        expect(r.point.values[0]).to.be.within(-5, 25);
        expect(r.geo_shape_elevation).to.be.within(100, 1500);   // the Black Forest, from the WorldClim elevation layer
        expect(json(post('/selection', { [K.selection]: { type: 'Point', coordinates: [8.1, 48.0] } })).geo_shape_elevation).to.equal(r.geo_shape_elevation);   // no climate needed
    });
    it('a line is rejected', function () {
        expect(post('/selection', { [K.selection]: { type: 'LineString', coordinates: [[0, 0], [1, 1]] } }).status).to.equal(400);
    });
});

describe('units, maps, state, health', function () {
    it('GET /units/index at the public level has no restricted unit and country terms', function () {
        const r = json(get('/units/index'));
        expect(r.length).to.be.greaterThan(3000);
        expect(r.every((u) => !u['gcu_loc_coordinates-restriction'])).to.equal(true);
        expect(r[0].gcu_id_country).to.match(/^ISO_3166_1_[A-Z]{3}$/);
        expect(r[0]).to.have.property('geo_shape_elevation');
    });
    (PUBLIC_ONLY ? it.skip : it)('GET /units/geo gives points for a species and withholds a restricted unit below manage', function () {
        const fc = json(get('/units/geo', { species: 'Fagus sylvatica' }));
        expect(fc.type).to.equal('FeatureCollection');
        expect(fc.features.length).to.be.greaterThan(400);
        const restricted = json(get('/units/index', { [K.level]: 'gcu_loc_coordinates-restriction_value' })).find((u) => u['gcu_loc_coordinates-restriction']);
        const one = json(get('/units/geo', { [K.unit]: restricted.gcu_id_number, [K.level]: 'gcu_loc_coordinates-restriction_value' }));
        expect(one.withheld).to.equal(true);
        expect(one.features).to.have.lengthOf(0);
    });
    it('GET /maps lists the Atlas and EU-Trees4F layers of beech', function () {
        const m = json(get('/maps', { species: 'Fagus sylvatica' }));
        expect(m.atlas_rpp.path).to.be.a('string');
        expect(Object.keys(m.eutrees4f).length).to.be.greaterThan(10);
    });
    it('POST /state/validate forwards to the dictionary and fills the defaults', function () {
        const r = post('/state/validate', { species: 'Fagus sylvatica' });
        expect(r.status).to.equal(200);
        const v = json(r);
        expect(v.ok).to.equal(true);
        expect(v.document.ui_layout_mode).to.equal('ui_layout_mode_auto');
    });
    it('GET /health reports the collections and the dictionary', function () {
        const h = json(get('/health'));
        expect(h.collections.ScatterOccurrences.count).to.be.greaterThan(200000);
        expect(h.collections.PanesCache).to.not.equal(null);
        expect(h.dictionary.ok).to.equal(true);
    });
});
