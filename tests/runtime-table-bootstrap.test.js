const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose runtime table helpers');

assert.deepStrictEqual(
  rules.getRuntimeEnsuredTables(),
  [
    'ft_feedbacks',
    'ft_packages',
    'ft_purchases',
    'ft_entitlements',
    'ft_entitlement_ledger'
  ],
  'runtime ensured tables should cover feedback and course package tables'
);

console.log('runtime table bootstrap tests passed');
