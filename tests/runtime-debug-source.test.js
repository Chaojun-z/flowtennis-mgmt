const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.deepStrictEqual(
  rules.RUNTIME_DEBUG_TABLES,
  ['ft_users','ft_students','ft_purchases','ft_entitlement_ledger','ft_courts','ft_membership_orders'],
  'runtime debug outlet should probe the required core tables'
);

assert.throws(
  () => rules.assertRuntimeDebugReadable({ NODE_ENV: 'production' }),
  /production 环境已禁用/,
  'production runtime should reject the temporary debug outlet'
);

assert.doesNotThrow(
  () => rules.assertRuntimeDebugReadable({ VERCEL_ENV: 'preview' }),
  'preview runtime should allow the temporary debug outlet'
);

const missingTableError = new Error('OTSObjectNotExist: table does not exist');
const stubStorage = {
  scan: async (tableName) => {
    if (tableName === 'ft_users') return [{ id: 'u1' }];
    if (tableName === 'ft_students') throw missingTableError;
    if (tableName === 'ft_purchases') return [];
    if (tableName === 'ft_entitlement_ledger') return [{ id: 'l1' }, { id: 'l2' }];
    if (tableName === 'ft_courts') return [{ id: 'c1' }];
    if (tableName === 'ft_membership_orders') return [];
    throw new Error(`unexpected table ${tableName}`);
  }
};

(async () => {
  const snapshot = await rules.buildRuntimeDataSourceDebugSnapshot(stubStorage, {
    VERCEL_ENV: 'preview',
    APP_ENV: 'staging',
    DATA_ENV: 'staging',
    TS_INSTANCE: 'flow-staging',
    TS_ENDPOINT: 'https://flow-staging.cn-beijing.ots.aliyuncs.com'
  });

  assert.strictEqual(snapshot.runtimeStage, 'preview', 'snapshot should expose the runtime stage');
  assert.strictEqual(snapshot.APP_ENV, 'staging', 'snapshot should expose APP_ENV');
  assert.strictEqual(snapshot.DATA_ENV, 'staging', 'snapshot should expose DATA_ENV');
  assert.strictEqual(snapshot.TS_INSTANCE, 'flow-staging', 'snapshot should expose TS_INSTANCE');
  assert.strictEqual(
    snapshot.TS_ENDPOINT,
    'https://flow-staging.cn-beijing.ots.aliyuncs.com',
    'snapshot should expose TS_ENDPOINT'
  );

  const tableMap = new Map(snapshot.tables.map((item) => [item.tableName, item]));
  assert.deepStrictEqual(
    tableMap.get('ft_users'),
    { tableName: 'ft_users', exists: true, isEmpty: false, rowCount: 1, status: 'has_rows' },
    'non-empty table should report row count'
  );
  assert.deepStrictEqual(
    tableMap.get('ft_students'),
    { tableName: 'ft_students', exists: false, isEmpty: true, rowCount: 0, status: 'missing' },
    'missing table should be marked missing without leaking row data'
  );
  assert.deepStrictEqual(
    tableMap.get('ft_purchases'),
    { tableName: 'ft_purchases', exists: true, isEmpty: true, rowCount: 0, status: 'empty' },
    'empty table should be marked empty'
  );

  console.log('runtime debug source tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
