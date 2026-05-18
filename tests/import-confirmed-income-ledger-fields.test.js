const assert = require('assert');
const importer = require('../scripts/import/import-confirmed-income-batch.js');

assert.ok(importer._test, 'import script should expose test helpers');
assert.equal(typeof importer._test.buildFinancialLedger, 'function', 'buildFinancialLedger should be exposed');
assert.equal(typeof importer._test.inferBusinessType, 'function', 'inferBusinessType should be exposed');

const importRow = {
  id: 'income-import-mabao-2026-01-10-2026-04-16:516',
  businessDate: '2026-02-03',
  rawCollectorName: 'Mira',
  rawDateText: '2月3日',
  rawTimeText: '10-12点',
  rawCustomerName: '陈川',
  rawIncomeType: '私教正式课',
  rawPaymentMethod: '课包划扣',
  rawReceivableAmountText: '0',
  rawActualAmountText: '0',
  rawDifferenceReason: '',
  rawNotes: '十里堡课包扣2课时'
};

const ledger = importer._test.buildFinancialLedger({
  '原表行号': '516',
  parseType: 'cross_campus_consume_trace',
  campusId: 'shilipu',
  campusName: '朝阳十里堡',
  accountingScope: 'external_trace_only',
  cashDelta: '0',
  recognizedRevenueDelta: '0',
  deferredRevenueDelta: '0',
  paymentChannel: '课包划扣',
  studentName: '陈川'
}, importRow, null);

assert.equal(importer._test.inferBusinessType({ parseType: 'camp_income' }), '课程');
assert.equal(importer._test.inferBusinessType({ parseType: 'cross_campus_consume_trace' }), '课程');
assert.equal(ledger.campusId, 'shilipu');
assert.equal(ledger.campusName, '朝阳十里堡');
assert.equal(ledger.accountingScope, 'external_trace_only');
assert.match(String(ledger.notes || ''), /十里堡/);

console.log('import confirmed income ledger field tests passed');
