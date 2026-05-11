const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.equal(typeof rules.normalizeRangePrimaryKey, 'function', 'api._test should expose range pk normalization');

assert.deepStrictEqual(
  rules.normalizeRangePrimaryKey([{ id: 'court-1' }]),
  [{ id: 'court-1' }],
  'plain single primary key input should stay unchanged'
);

assert.deepStrictEqual(
  rules.normalizeRangePrimaryKey([{ name: 'id', type: 'STRING', value: 'court-2' }]),
  [{ id: 'court-2' }],
  'decoded nextStartPrimaryKey should be converted back to the SDK request shape'
);

assert.deepStrictEqual(
  rules.normalizeRangePrimaryKey([
    { name: 'id', value: 'court-3' },
    { name: 'createdAt', value: '2026-05-11T00:00:00.000Z' }
  ]),
  [
    { id: 'court-3' },
    { createdAt: '2026-05-11T00:00:00.000Z' }
  ],
  'composite cursor entries should normalize each primary key column independently'
);

console.log('courts scan pk normalization tests passed');
