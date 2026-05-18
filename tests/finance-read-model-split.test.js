const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const pageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/aggregate-handlers.js'), 'utf8');
const modulePath = path.join(__dirname, '../api/page-data/finance-read-model.js');

assert.ok(fs.existsSync(modulePath), '财务页读模型应拆到独立模块');

const { createFinancePageDataLoader } = require(modulePath);
assert.strictEqual(typeof createFinancePageDataLoader, 'function', '财务页读模型模块应导出 createFinancePageDataLoader');

assert.match(
  indexSource,
  /createFinancePageDataLoader/,
  'api/index.js 应注入独立财务读模型，减少直接拼装财务页数据的风险'
);

assert.match(
  pageDataSource,
  /loadFinancePageData/,
  'page-data 聚合处理器应通过独立财务读模型加载 finance 数据'
);

async function main() {
  const calls = [];
  const loadFinancePageData = createFinancePageDataLoader({
    listCampusesWithDefaults: async () => {
      calls.push('campuses');
      return ['campus-a'];
    },
    financeCourtProjectionFields: ['name', 'cachedBalance'],
    getCachedScan: async (tableName, options) => {
      calls.push({ tableName, options: options || null });
      return [`row:${tableName}`];
    },
    tables: {
      students: 'students',
      schedule: 'schedule',
      entitlements: 'entitlements',
      entitlementLedger: 'entitlementLedger',
      financialLedger: 'financialLedger',
      coaches: 'coaches',
      products: 'products',
      purchases: 'purchases',
      packages: 'packages',
      courts: 'courts',
      membershipAccounts: 'membershipAccounts',
      membershipOrders: 'membershipOrders',
      membershipBenefitLedger: 'membershipBenefitLedger',
      membershipAccountEvents: 'membershipAccountEvents'
    }
  });

  const result = await loadFinancePageData();

  assert.deepStrictEqual(result, {
    campuses: ['campus-a'],
    students: ['row:students'],
    schedule: ['row:schedule'],
    entitlements: ['row:entitlements'],
    entitlementLedger: ['row:entitlementLedger'],
    financialLedger: ['row:financialLedger'],
    coaches: ['row:coaches'],
    products: ['row:products'],
    purchases: ['row:purchases'],
    packages: ['row:packages'],
    courts: ['row:courts'],
    membershipAccounts: ['row:membershipAccounts'],
    membershipOrders: ['row:membershipOrders'],
    membershipBenefitLedger: ['row:membershipBenefitLedger'],
    membershipAccountEvents: ['row:membershipAccountEvents']
  }, '财务页读模型应完整返回原 finance 聚合字段');

  assert.deepStrictEqual(calls, [
    'campuses',
    { tableName: 'students', options: null },
    { tableName: 'schedule', options: null },
    { tableName: 'entitlements', options: null },
    { tableName: 'entitlementLedger', options: null },
    { tableName: 'financialLedger', options: null },
    { tableName: 'coaches', options: null },
    { tableName: 'products', options: null },
    { tableName: 'purchases', options: null },
    { tableName: 'packages', options: null },
    { tableName: 'courts', options: { columns: ['name', 'cachedBalance'] } },
    { tableName: 'membershipAccounts', options: null },
    { tableName: 'membershipOrders', options: null },
    { tableName: 'membershipBenefitLedger', options: null },
    { tableName: 'membershipAccountEvents', options: null }
  ], '财务页读模型应只读取 finance 页面需要的表，订场用户应改成轻投影');

  const courtCall = calls.find((item) => item?.tableName === 'courts');
  assert.deepStrictEqual(
    courtCall?.options,
    { columns: ['name', 'cachedBalance'] },
    '财务页应对订场用户表使用轻投影，避免继续拉取完整 history'
  );
}

main()
  .then(() => console.log('finance read model split tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
