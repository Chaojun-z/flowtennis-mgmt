const assert = require('assert');
const api = require('../api/index.js');

const { computeCourtFinance, normalizeCourtRecord, buildLegacyCourtOpeningHistory } = api._test;

const recharge = {
  id: 'r1',
  date: '2026-04-11',
  type: '充值',
  payMethod: '微信',
  category: '储值',
  amount: 5000
};

assert.deepStrictEqual(
  computeCourtFinance({ history: [recharge] }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 0,
    receivedAmount: 5000,
    storedValueSpent: 0,
    directPaidSpent: 0
  },
  'recharge should increase balance and received amount'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'c1',
        date: '2026-04-11',
        type: '消费',
        payMethod: '微信',
        category: '私教课',
        amount: 500
      }
    ]
  }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5500,
    storedValueSpent: 0,
    directPaidSpent: 500
  },
  'direct paid lesson should not reduce stored balance'
);

assert.deepStrictEqual(
  computeCourtFinance({
    history: [
      recharge,
      {
        id: 'c2',
        date: '2026-04-11',
        type: '消费',
        payMethod: '储值扣款',
        category: '私教课',
        amount: 500
      }
    ]
  }),
  {
    balance: 4500,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5000,
    storedValueSpent: 500,
    directPaidSpent: 0
  },
  'stored value payment should reduce balance without increasing received amount'
);

assert.throws(
  () => normalizeCourtRecord({
    name: '家长A',
    history: [{
      id: 'c3',
      date: '2026-04-11',
      type: '消费',
      payMethod: '储值扣款',
      category: '订场',
      amount: 600
    }]
  }),
  /余额不足/,
  'stored value payment cannot exceed balance'
);

const normalized = normalizeCourtRecord({
  name: '家长A',
  studentIds: ['stu-1', 'stu-2'],
  history: [
    recharge,
    {
      id: 'c4',
      date: '2026-04-11',
      type: '消费',
      payMethod: '储值扣款',
      category: '班课',
      studentId: 'stu-2',
      amount: 300
    }
  ],
  balance: 9999,
  totalDeposit: 9999,
  spentAmount: 9999
});

assert.deepStrictEqual(normalized.studentIds, ['stu-1', 'stu-2']);
assert.strictEqual(normalized.balance, 4700);
assert.strictEqual(normalized.totalDeposit, 5000);
assert.strictEqual(normalized.spentAmount, 300);
assert.strictEqual(normalized.receivedAmount, 5000);

const legacy = normalizeCourtRecord({
  name: '旧客户',
  studentId: 'stu-old',
  balance: 1200,
  totalDeposit: 2000,
  spentAmount: 800,
  history: []
});

assert.deepStrictEqual(legacy.studentIds, ['stu-old']);
assert.strictEqual(legacy.balance, 1200);
assert.strictEqual(legacy.totalDeposit, 2000);
assert.strictEqual(legacy.spentAmount, 800);
assert.strictEqual(legacy.history.length, 2);
assert.strictEqual(legacy.history[0].source, 'import');

const importedDirectPaid = normalizeCourtRecord({
  name: '导入客户',
  balance: 5000,
  totalDeposit: 5000,
  spentAmount: 500,
  joinDate: '2026-04-01',
  history: []
});
assert.strictEqual(importedDirectPaid.balance, 5000);
assert.strictEqual(importedDirectPaid.totalDeposit, 5000);
assert.strictEqual(importedDirectPaid.spentAmount, 500);
assert.strictEqual(importedDirectPaid.receivedAmount, 5500);
assert.strictEqual(importedDirectPaid.history.length, 2);
assert.strictEqual(importedDirectPaid.history[1].source, 'import');
assert.strictEqual(importedDirectPaid.history[1].payMethod, '历史导入');

const legacyDirectPaid = buildLegacyCourtOpeningHistory({
  id: 'legacy-direct',
  joinDate: '2026-04-01',
  balance: 5000,
  totalDeposit: 5000,
  spentAmount: 500,
  history: []
});
assert.deepStrictEqual(
  computeCourtFinance({ history: legacyDirectPaid }),
  {
    balance: 5000,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5500,
    storedValueSpent: 0,
    directPaidSpent: 500
  },
  'legacy direct paid consumption should not reduce stored balance'
);

const legacyStoredPaid = buildLegacyCourtOpeningHistory({
  id: 'legacy-stored',
  joinDate: '2026-04-01',
  balance: 4500,
  totalDeposit: 5000,
  spentAmount: 500,
  history: []
});
assert.deepStrictEqual(
  computeCourtFinance({ history: legacyStoredPaid }),
  {
    balance: 4500,
    totalDeposit: 5000,
    spentAmount: 500,
    receivedAmount: 5000,
    storedValueSpent: 500,
    directPaidSpent: 0
  },
  'legacy stored value consumption should reduce stored balance'
);

console.log('court finance tests passed');
