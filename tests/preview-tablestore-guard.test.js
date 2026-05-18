const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.strictEqual(rules.PREVIEW_TS_INSTANCE, 'flow-staging', 'preview guard should pin the staging TableStore instance');
assert.strictEqual(
  rules.resolveDataStage({ APP_ENV: 'staging', DATA_ENV: 'production' }),
  'staging',
  'APP_ENV should take precedence when resolving data stage'
);
assert.strictEqual(
  rules.resolveDataStage({ DATA_ENV: 'staging' }),
  'staging',
  'DATA_ENV should still mark staging when APP_ENV is absent'
);

assert.throws(
  () => rules.assertTableStoreTarget({ VERCEL_ENV: 'preview', TS_INSTANCE: 'flowtennis' }),
  /flow-staging/,
  'preview deployments must not fall back to the production TableStore instance'
);
assert.throws(
  () => rules.assertTableStoreTarget({ APP_ENV: 'staging', TS_INSTANCE: 'flowtennis' }),
  /flow-staging/,
  'staging app env must not point to the production TableStore instance'
);
assert.doesNotThrow(
  () => rules.assertTableStoreTarget({ VERCEL_ENV: 'preview', TS_INSTANCE: 'flow-staging' }),
  'preview deployments should accept the staging TableStore instance'
);
assert.doesNotThrow(
  () => rules.assertTableStoreTarget({ NODE_ENV: 'production', TS_INSTANCE: 'flowtennis' }),
  'production can keep its own TableStore instance'
);

console.log('preview tablestore guard tests passed');
