const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose helpers');
assert.strictEqual(typeof rules.assertPlanWriteForbidden, 'undefined', 'plan write guard helper should be removed with /plans retirement');

console.log('plan page rules tests passed');
