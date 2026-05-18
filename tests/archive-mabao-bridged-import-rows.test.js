const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const scriptPath = path.join(__dirname, '..', 'scripts', 'import', 'archive-mabao-bridged-import-rows.js');
const source = fs.readFileSync(scriptPath, 'utf8');
const prefix = source.split('async function main()')[0];
const sandbox = {
  require: (name) => {
    if (name === 'fs') return require('fs');
    if (name === 'path') return require('path');
    if (name === 'dotenv') return { config() {} };
    if (name === '../lib/runtime-env') return { loadRuntimeEnv() {} };
    if (name === 'tablestore') {
      return {
        Client: function MockClient() {},
        Condition: function MockCondition() {},
        RowExistenceExpectation: { IGNORE: 'IGNORE', EXPECT_NOT_EXIST: 'EXPECT_NOT_EXIST' }
      };
    }
    return require(name);
  },
  console,
  process: { argv: ['node', scriptPath], env: {} },
  __dirname: path.dirname(scriptPath),
  __filename: scriptPath,
  module: { exports: {} },
  exports: {}
};

vm.createContext(sandbox);
vm.runInContext(`${prefix}
module.exports = { plannedTargetForRow, ledgerPreviewForRow, buildImportRow };`, sandbox);

const { plannedTargetForRow, ledgerPreviewForRow, buildImportRow } = sandbox.module.exports;

assert.strictEqual(plannedTargetForRow({ parseType: 'booking_income' }), 'court_history');
assert.strictEqual(plannedTargetForRow({ parseType: 'package_consume' }), 'entitlement_ledger');
assert.strictEqual(plannedTargetForRow({ parseType: 'course_income' }), 'course_income');

const preview = ledgerPreviewForRow({
  parseType: 'booking_income',
  cashDelta: '320',
  recognizedRevenueDelta: '320',
  deferredRevenueDelta: '0'
});
assert.strictEqual(preview.cashDelta, 32000);
assert.strictEqual(preview.recognizedRevenueDelta, 32000);
assert.strictEqual(preview.deferredRevenueDelta, 0);
assert.strictEqual(preview.ledgerType, '历史订场收入');

const row = buildImportRow({
  '原表行号': '1429',
  '日期原文': '4月17日',
  '日期': '2026-04-17',
  '星期原文': '周五',
  '时间原文': '13-15点',
  '客户': '测试客户',
  '收入类型': '散客纯定场（小程序）',
  '支付方式': '小程序',
  '应收收入（元）': '320',
  '实际收入（元）': '320',
  '差价（元）': '0',
  '差价说明': '',
  '收款人': '系统',
  '备注': '',
  classificationStatus: 'auto_ready',
  reviewReason: ''
}, {
  parseType: 'booking_income',
  businessType: '订场收入',
  cashDelta: '320',
  recognizedRevenueDelta: '320',
  deferredRevenueDelta: '0'
});

assert.strictEqual(row.id, 'income-import-mabao-2026-01-10-2026-04-16:1429');
assert.strictEqual(row.plannedTarget, 'court_history');
assert.strictEqual(row.normalizedIncomeType, '订场收入');
assert.strictEqual(row.importStatus, 'pending');
assert.strictEqual(row.receivableAmountCents, 32000);
assert.strictEqual(row.actualAmountCents, 32000);

console.log('archive mabao bridged import rows tests passed');
