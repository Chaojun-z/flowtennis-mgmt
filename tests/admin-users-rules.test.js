const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose admin user helpers');
assert.ok(rules.assertAuthUserActive, 'api._test should expose auth user active helper');

assert.doesNotThrow(
  () => rules.assertAuthUserActive({ id: 'coach_1', status: 'active' }),
  'active users should be allowed to login'
);

assert.doesNotThrow(
  () => rules.assertAuthUserActive({ id: 'coach_2' }),
  'users without status should default to active'
);

assert.throws(
  () => rules.assertAuthUserActive({ id: 'coach_3', status: 'inactive' }),
  /账号已停用/,
  'inactive users should be blocked from login'
);

console.log('admin user rules tests passed');
