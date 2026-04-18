const assert = require('assert');
const seed = require('../api/seeds/mabao-finance-seed.json');

assert.strictEqual(seed.purchases.length, 51, 'income report should include initial purchases, renewals, and paid lesson history');
assert.strictEqual(seed.entitlements.length, 47, 'initial purchases and renewal rows should create course entitlements');
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.amountPaid) || 0), 0),
  273900,
  'income should include formula amounts, renewal fees, and paid lesson history'
);
assert.strictEqual(
  seed.purchases.reduce((sum, row) => sum + (Number(row.packageLessons) || 0), 0),
  610,
  'sold lessons should include renewal lessons'
);
assert.strictEqual(
  seed.entitlementLedger.reduce((sum, row) => sum + (Number(row.lessonDelta) < 0 ? Math.abs(Number(row.lessonDelta)) : 0), 0),
  170.5,
  'consume ledger should preserve monthly decimals and detailed lesson history'
);
assert.deepStrictEqual(
  [...new Set(seed.entitlementLedger.map(x => x.sourceMonth).filter(Boolean))].sort(),
  ['2026-01', '2026-02', '2026-03'],
  'consume ledger should include Jan/Feb/Mar history'
);
assert.ok(seed.entitlementLedger.length >= 50, 'consume ledger should include monthly consumption rows, not only April rows');
assert.strictEqual(seed.entitlementLedger.filter(x => x.sourceSheet).length, 22, 'third and fourth sheets should import detailed lesson history');
assert.strictEqual(seed.purchases.filter(x => x.sourceType === 'lesson_payment').length, 4, 'paid transfer lesson rows should be visible in income report');

const zhao = seed.purchases.find(x => x.studentName === '赵新阳 田秀楠');
assert.ok(zhao, '赵新阳 田秀楠 should be imported');
assert.strictEqual(zhao.amountPaid, 8800, 'formula fee for 赵新阳 田秀楠 should be evaluated');

const liRenewal = seed.purchases.find(x => x.studentName === '李嵚' && x.sourceType === 'renewal');
assert.ok(liRenewal, '李嵚 renewal should be imported');
assert.strictEqual(liRenewal.amountPaid, 21000, '李嵚 renewal fee should be imported');
assert.strictEqual(liRenewal.packageLessons, 50, '李嵚 renewal lessons should be imported');

const wjingRenewal = seed.purchases.find(x => x.studentName === 'W.Jing' && x.sourceType === 'renewal');
assert.ok(wjingRenewal, 'W.Jing renewal should be imported');
assert.strictEqual(wjingRenewal.amountPaid, 7600, 'W.Jing renewal fee should be parsed from text');
assert.strictEqual(wjingRenewal.packageLessons, 20, 'W.Jing renewal lessons should be parsed from text');

const misha = seed.purchases.find(x => x.studentName === 'misha');
assert.ok(misha && /每周四20-21点/.test(misha.notes || ''), 'purchase notes should include notes from 课时统计 remarks column');

const mishaLedger = seed.entitlementLedger.filter(x => x.purchaseId === 'seed-purchase-002');
assert.ok(mishaLedger.every(x => /每周四20-21点/.test(x.notes || '')), 'consume rows should preserve remarks for traceability');
assert.ok(mishaLedger.every(x => x.importSource === '系统导入' && x.createdAt === seed.meta.generatedAt), 'imported consume rows should use system import time instead of fake class time');

console.log('finance seed data tests passed');
