const assert = require('assert');
const api = require('../api/index.js')._test;

const campuses = [
  { id: 'mabao', code: 'mabao', name: '顺义马坡' },
  { id: 'chaojun', code: 'chaojun', name: '朝珺私教' },
  { id: 'guowang', code: 'guowang', name: '朝阳国网' },
  { id: 'langang', code: 'langang', name: '朝阳蓝色港湾' }
];

const rows = api.buildNormalizedFinanceRows({
  campuses,
  courts: [{ id: 'court-1', campus: 'mabao' }],
  financialLedger: [
    {
      id: 'ledger-1',
      businessDate: '2026-04-20',
      userId: 'stu-1',
      userName: '张三',
      businessType: '课程',
      actionType: '核销',
      cashDelta: 0,
      recognizedRevenueDelta: 120000,
      deferredRevenueDelta: -120000,
      paymentChannel: '课包划扣',
      productSnapshotName: '成人1v1 10节课包',
      sourceId: 'pur-1',
      purchaseId: 'pur-1',
      entitlementId: 'ent-1',
      campusId: 'chaojun',
      notes: '朝珺私教'
    },
    {
      id: 'ledger-2',
      businessDate: '2026-04-21',
      userId: 'match-court-finance',
      userName: '约球订场',
      businessType: '',
      actionType: '留痕',
      cashDelta: 20000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 0,
      paymentChannel: '微信',
      productSnapshotMeta: { courtId: 'court-1' },
      sourceId: 'match-1',
      notes: ''
    },
    {
      id: 'ledger-3',
      businessDate: '',
      userId: 'stu-2',
      userName: 'Lam、Loon',
      businessType: '',
      actionType: '历史导入',
      cashDelta: 0,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 0,
      paymentChannel: '历史导入',
      sourceId: 'import-1',
      notes: '2026/04/18 周五朗茶校区'
    },
    {
      id: 'ledger-4',
      businessDate: '2026-04-22',
      userId: 'stu-3',
      userName: '李四',
      businessType: '课程',
      actionType: '历史导入',
      cashDelta: 0,
      recognizedRevenueDelta: 50000,
      deferredRevenueDelta: -50000,
      paymentChannel: '历史导入',
      campusId: 'mabao',
      sourceId: 'import-2',
      notes: '朝珺私教'
    },
    {
      id: 'ledger-5',
      businessDate: '',
      userId: 'stu-5',
      userName: '王五',
      businessType: '',
      actionType: '历史导入',
      cashDelta: 10000,
      recognizedRevenueDelta: 0,
      deferredRevenueDelta: 0,
      paymentChannel: '历史导入',
      sourceId: 'import-3',
      notes: '2026-04-23 蓝色港湾订场'
    },
    {
      id: 'ledger-6',
      businessDate: '2026-04-24',
      userId: 'stu-6',
      userName: '赵六',
      businessType: '散客订场',
      actionType: '历史导入',
      cashDelta: 0,
      recognizedRevenueDelta: 3000,
      deferredRevenueDelta: -3000,
      paymentChannel: '历史导入',
      sourceId: 'import-4',
      campusId: 'guowang',
      notes: '历史订场已入账'
    },
    {
      id: 'ledger-7',
      businessDate: '2026-04-25',
      userId: 'stu-7',
      userName: '孙七',
      businessType: '订场',
      actionType: '收款',
      cashDelta: 8000,
      recognizedRevenueDelta: 8000,
      deferredRevenueDelta: 0,
      paymentChannel: '微信',
      sourceId: 'court-regular-1',
      campusId: 'mabao',
      notes: '正常订场收款'
    }
  ]
});
const overview = api.buildFinanceOverview(rows);
const audit = api.buildFinanceAudit(rows, overview);

assert.strictEqual(rows.length, 7, 'finance normalization should keep every active ledger row');
assert.strictEqual(rows[0].campusName, '朝珺私教', 'finance normalization should prefer explicit ledger campus');
assert.strictEqual(rows[0].actionType, '已入账', 'write-off rows should normalize to recognized revenue action');
assert.strictEqual(rows[0].recognizedRevenueDelta, 1200, 'finance normalization should convert ledger cents into yuan');
assert.strictEqual(rows[1].campusName, '顺义马坡', 'match-court-finance rows should fall back to mabao campus');
assert.strictEqual(rows[1].actionType, '记录', 'trace rows should stay as non-revenue records');
assert.strictEqual(rows[1].sourceDocument, '账本记录 match-1', 'finance normalization should emit a readable source document');
assert.strictEqual(rows[2].campusName, '朗茶校区', 'import text clues should override default mabao fallback for explicit external campus rows');
assert.strictEqual(rows[2].businessDate, '2026-04-18', 'import text clues should also auto-fill missing business dates when the date is written in the notes');
assert.strictEqual(rows[3].campusName, '朝珺私教', 'import text clues should override default mabao when notes explicitly say chaojun');
assert.strictEqual(rows[3].campusResolution, 'text_override_import', 'import text correction rows should expose the auto-fix resolution type');
assert.strictEqual(rows[4].campusName, '朝阳蓝色港湾', 'blue harbor aliases should also auto-fix import campus attribution');
assert.strictEqual(rows[4].businessDate, '2026-04-23', 'blue harbor import rows should auto-fill the missing business date from text clues');
assert.strictEqual(overview.all.cash, 380, 'finance overview should aggregate total cash from normalized rows');
assert.strictEqual(overview.all.recognized, 1810, 'finance overview should aggregate total recognized revenue from normalized rows');
assert.strictEqual(overview.all.bookingIncome, 80, 'finance overview booking income should only keep real operating booking cash instead of mixing historical import rows');
assert.strictEqual(overview.all.bookingRecognized, 80, 'finance overview booking recognized should use the same operating booking rows as booking income');
assert.strictEqual(overview.campuses.length, 5, 'finance overview should keep each normalized campus bucket, including historical booking rows that were already attributed to guowang');
assert.strictEqual(overview.campuses[0].campusName, '朝珺私教', 'finance overview should expose campus names in the summary');
assert.strictEqual(audit.missingCampusCount, 0, 'finance audit should report zero missing campus rows for normalized fixtures');
assert.ok(audit.generatedAt, 'finance audit should expose snapshot generation time');
assert.strictEqual(audit.status, 'blocked', 'finance audit should expose a machine-readable summary status');
assert.strictEqual(audit.blockingCount, 2, 'finance audit should count blocking anomalies');
assert.strictEqual(audit.warningCount, 0, 'finance audit should stop counting warnings once zero-amount historical imports are downgraded to trace-only rows');
assert.strictEqual(audit.pendingCount, 0, 'finance audit should clear unresolved actionable items after auto-fixing import dates and downgrading zero-amount imports');
assert.strictEqual(audit.fixedCount, 6, 'finance audit should count campus, date and trace-only auto-fixes');
assert.strictEqual(audit.cashGap, 0, 'finance audit should keep total cash aligned with campus buckets');
assert.strictEqual(audit.recognizedGap, 0, 'finance audit should keep total recognized revenue aligned with campus buckets');
assert.strictEqual(audit.importMissingDateCount, 0, 'finance audit should stop flagging historical import rows once dates are auto-filled from text clues');
assert.strictEqual(audit.importZeroAmountCount, 0, 'finance audit should stop flagging zero-amount historical import rows once they are downgraded to trace-only rows');
assert.strictEqual(audit.chaojunRiskCount, 0, 'finance audit should stop flagging chaojun rows once import clue correction fixes the campus');
assert.strictEqual(audit.externalCampusRiskCount, 0, 'finance audit should stop flagging explicit external-campus rows once campus auto-fix already split them out');
assert.strictEqual(audit.autoFixedCampusCount, 3, 'finance audit should expose how many rows were auto-fixed by import campus clues');
assert.strictEqual(audit.autoFixedDateCount, 2, 'finance audit should expose how many rows had business dates auto-filled from import text clues');
assert.strictEqual(audit.autoTraceOnlyCount, 1, 'finance audit should expose how many zero-amount historical imports were downgraded to trace-only rows');
assert.strictEqual(audit.details.length, 10, 'finance audit should expose the extended anomaly detail checklist');
assert.strictEqual(audit.details[0].type, '缺校区', 'finance audit detail should include missing campus checks');
assert.strictEqual(audit.details[0].suggestion, '补真实发生校区后再入经营口径', 'finance audit detail should expose actionable handling guidance');
assert.ok(Array.isArray(audit.actionItems), 'finance audit should expose actionable row-level items');
assert.strictEqual(audit.actionItems.length, 0, 'finance audit should no longer keep zero-amount import rows in unresolved action items after downgrading them');
assert.ok(Array.isArray(audit.fixedItems), 'finance audit should expose auto-fixed row-level items');
assert.strictEqual(audit.fixedItems[0].fromCampus, '顺义马坡', 'finance audit fixed items should keep the original fallback campus');
assert.strictEqual(audit.fixedItems[0].toCampus, '朗茶校区', 'finance audit fixed items should keep the corrected campus');
assert.strictEqual(audit.fixedItems[1].toCampus, '朝珺私教', 'finance audit fixed items should list each corrected campus row');
assert.strictEqual(audit.fixedItems[3].type, '日期自动补齐', 'finance audit fixed items should also show auto-filled business dates');
assert.strictEqual(audit.fixedItems[5].type, '零金额已降级留痕', 'finance audit fixed items should show when zero-amount historical imports are downgraded to trace-only rows');

console.log('finance api normalization tests passed');
