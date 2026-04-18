const assert = require('assert');
const seed = require('../api/seeds/mabao-finance-seed.json');

assert.strictEqual(seed.purchases.length, 45, 'Sheet1 should import all 45 income/course rows');
assert.strictEqual(seed.entitlements.length, 45, 'course statistics should create one entitlement per student row');
assert.deepStrictEqual(
  [...new Set(seed.entitlementLedger.map(x => x.createdAt.slice(0, 7)))].sort(),
  ['2026-01', '2026-02', '2026-03'],
  'consume ledger should include Jan/Feb/Mar history'
);
assert.ok(seed.entitlementLedger.length >= 50, 'consume ledger should include monthly consumption rows, not only April rows');

const misha = seed.purchases.find(x => x.studentName === 'misha');
assert.ok(misha && /每周四20-21点/.test(misha.notes || ''), 'purchase notes should include notes from 课时统计 remarks column');

const mishaLedger = seed.entitlementLedger.filter(x => x.purchaseId === 'seed-purchase-002');
assert.ok(mishaLedger.every(x => /每周四20-21点/.test(x.notes || '')), 'consume rows should preserve remarks for traceability');

console.log('finance seed data tests passed');
