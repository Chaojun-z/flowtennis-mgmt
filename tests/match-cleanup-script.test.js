const assert = require('assert');

const cleanup = require('../scripts/repair/cleanup-match-production-test-data.js');

assert.equal(typeof cleanup.MATCH_SQL_DELETE_ORDER?.length, 'number', 'cleanup script should expose SQL delete order');
assert.deepEqual(
  cleanup.MATCH_SQL_DELETE_ORDER,
  ['match_replacements', 'match_posts', 'match_users'],
  'cleanup script should delete replacements first, then posts, then users'
);

const financeAccount = {
  id: 'match-court-finance',
  history: [
    { id: 'keep-1', sourceCategory: '普通订场', matchId: '', matchFeeSplitId: '', matchUserId: '' },
    { id: 'match-fee-a', sourceCategory: '约球订场', matchId: 'm1', matchFeeSplitId: 's1', matchUserId: 'u1' },
    { id: 'match-fee-refund-a', sourceCategory: '约球订场', matchId: 'm1', matchFeeSplitId: 's1', matchUserId: 'u1', type: '退款' }
  ]
};

const financeResult = cleanup.filterMatchCourtFinanceHistory(financeAccount, {
  matchIds: ['m1'],
  splitIds: ['s1'],
  userIds: ['u1']
});

assert.equal(financeResult.removedCount, 2, 'cleanup should remove both paid and refund match finance rows');
assert.deepEqual(
  financeResult.nextHistory.map((row) => row.id),
  ['keep-1'],
  'cleanup should keep unrelated court finance rows'
);

const summary = cleanup.buildCleanupSummary({
  before: {
    match_posts: 3,
    match_registrations: 5,
    match_attendance: 4,
    match_bookings: 2,
    match_fee_records: 2,
    match_fee_splits: 5,
    match_operation_logs: 8,
    match_replacements: 1,
    match_users: 4
  },
  financeRemovedCount: 2
});

assert.equal(summary.sqlRows, 34, 'cleanup summary should total SQL rows');
assert.equal(summary.financeRows, 2, 'cleanup summary should report removed finance rows');

console.log('match cleanup script test passed');
