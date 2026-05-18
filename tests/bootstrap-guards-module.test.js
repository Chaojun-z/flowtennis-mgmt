const assert = require('assert');
const guards = require('../api/runtime/bootstrap-guards.js');

assert.strictEqual(guards.PREVIEW_TS_INSTANCE, 'flow-staging', 'preview guard module should expose the pinned staging instance');
assert.strictEqual(
  guards.resolveDataStage({ APP_ENV: 'staging', DATA_ENV: 'production' }),
  'staging',
  'APP_ENV should take precedence when resolving data stage'
);
assert.throws(
  () => guards.assertTableStoreTarget({ VERCEL_ENV: 'preview', TS_INSTANCE: 'flowtennis' }),
  /flow-staging/,
  'preview deployments must reject the production TableStore instance'
);
assert.doesNotThrow(
  () => guards.assertTableStoreTarget({ NODE_ENV: 'production', TS_INSTANCE: 'flowtennis' }),
  'production can keep its production TableStore instance'
);

const flags = guards.buildBootstrapSafetyFlags({
  NODE_ENV: 'production',
  ENABLE_DEFAULT_USER_BOOTSTRAP: 'true',
  ENABLE_TABLE_BOOTSTRAP: 'true',
  ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP: 'true',
  ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP: 'true',
  ENABLE_IMPORTED_LEDGER_AUTO_REPAIR: 'true'
});
assert.strictEqual(flags.enableDefaultUserBootstrap, false, 'production should block default user bootstrap by default');
assert.strictEqual(flags.enableTableBootstrap, false, 'production should block table bootstrap by default');
assert.strictEqual(flags.enableDefaultPricePlanBootstrap, false, 'production should block price-plan bootstrap by default');
assert.strictEqual(flags.enableMabaoFinanceSeedBootstrap, false, 'production should block finance seed bootstrap by default');
assert.strictEqual(flags.enableImportedLedgerAutoRepair, false, 'production should block auto repair by default');

console.log('bootstrap guards module tests passed');
