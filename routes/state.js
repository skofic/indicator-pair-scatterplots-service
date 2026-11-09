'use strict';
const createRouter = require('@arangodb/foxx/router');
const joi = require('joi');
const request = require('@arangodb/request');
const router = createRouter();
router.tag('State');

// POST /state/validate  body: a (partial) ui_layout_state
router.post('/validate', function (req, res) {
    const base = module.context.configuration.metadataUi;
    let r;
    try { r = request.post(`${base}/validate/document`, { json: true, body: { descriptor: 'ui_layout_state', document: req.body, compute: req.queryParams.compute !== false }, timeout: 10 }); }
    catch (e) { res.throw(502, `dictionary service unreachable at ${base}: ${e.message}`); }
    if (r.status >= 400) res.throw(502, `dictionary service answered ${r.status}`);
    res.json(r.json);
})
.body(joi.object().unknown(true), 'A full or partial pane state keyed by dictionary terms')
.queryParam('compute', joi.boolean().default(true), 'Fill the dictionary\'s defaults (the constants of ui_layout_state) into the returned document (default true)')
.response(['application/json'], 'The dictionary service\'s answer: ok, errors, warnings, and with compute the filled document')
.error(502, 'The dictionary service could not be reached')
.summary('Validate a pane state against the dictionary')
.description('Forwards the state to the dictionary service (`POST <metadataUi>/validate/document`, descriptor `ui_layout_state`), so that a client of this service needs one origin. The panes may call the dictionary directly instead. Validation lives in the dictionary; this service checks only the keys it consumes.');

module.exports = router;
