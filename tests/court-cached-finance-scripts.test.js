const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const repairScriptPath = path.join(repoRoot, 'scripts', 'repair', 'backfill-court-cached-finance.js');
const auditScriptPath = path.join(repoRoot, 'scripts', 'audit', 'audit-court-cached-finance.js');
const baselineDocPath = path.join(repoRoot, 'docs', 'performance-governance', '11-样板页改前基线表.md');
const writeChainDocPath = path.join(repoRoot, 'docs', 'performance-governance', '13-T_COURTS-写链清单与-cached-闭合口径.md');

assert.ok(fs.existsSync(repairScriptPath), 'backfill script should exist under scripts/repair');
assert.ok(fs.existsSync(auditScriptPath), 'audit script should exist under scripts/audit');
assert.ok(fs.existsSync(baselineDocPath), 'baseline template doc should exist');
assert.ok(fs.existsSync(writeChainDocPath), 'write-chain closure doc should exist');

const repairScript = require(repairScriptPath);
const auditScript = require(auditScriptPath);

assert.ok(typeof repairScript.computeCachedCourtFinance === 'function', 'backfill script should export computeCachedCourtFinance');
assert.ok(typeof repairScript.buildBackfillPreviewRow === 'function', 'backfill script should export buildBackfillPreviewRow');
assert.ok(typeof repairScript.buildReportFileName === 'function', 'backfill script should export buildReportFileName');
assert.ok(typeof auditScript.buildAuditRow === 'function', 'audit script should export buildAuditRow');
assert.ok(typeof auditScript.pickSampleCourts === 'function', 'audit script should export pickSampleCourts');

const finance = repairScript.computeCachedCourtFinance({
  history: [
    { id: 'r1', date: '2026-05-01', type: '充值', category: '储值', payMethod: '微信', amount: 1000 },
    { id: 'c1', date: '2026-05-02', type: '消费', category: '订场', payMethod: '储值扣款', amount: 300 }
  ]
});

assert.deepStrictEqual(finance, {
  cachedBalance: 700,
  cachedTotalDeposit: 1000,
  cachedTotalSpent: 300,
  cachedTotalReceived: 1000
}, 'backfill helper should map computeCourtFinance output into cached* fields');

const previewRow = repairScript.buildBackfillPreviewRow({
  id: 'court-1',
  name: '测试用户',
  history: [
    { id: 'r1', date: '2026-05-01', type: '充值', category: '储值', payMethod: '微信', amount: 500 }
  ],
  cachedBalance: '',
  cachedTotalDeposit: '',
  cachedTotalSpent: '',
  cachedTotalReceived: ''
});

assert.strictEqual(previewRow.id, 'court-1');
assert.strictEqual(previewRow.after.cachedBalance, 500);
assert.strictEqual(previewRow.changed, true);

assert.deepStrictEqual(
  repairScript.parseArgs(['--write', '--batch-size=200', '--start-after=abc', '--report-tag=batch-01']),
  {
    write: true,
    includeMatchFinance: false,
    sampleIds: [],
    limit: 0,
    batchSize: 200,
    startAfter: 'abc',
    reportTag: 'batch-01',
    previewRowLimit: 50
  },
  'backfill script should parse batch resume arguments'
);

assert.strictEqual(
  repairScript.buildReportFileName({ write: true, reportTag: 'batch-01' }),
  'court-cached-finance-backfill-result-batch-01.json',
  'backfill report file name should support batch tags'
);

const sampleRows = auditScript.pickSampleCourts([
  { id: 'b-court', name: 'B' },
  { id: 'a-court', name: 'A' },
  { id: 'c-court', name: 'C' }
], { sampleSize: 2 });

assert.deepStrictEqual(sampleRows.map((row) => row.id), ['a-court', 'b-court'], 'sample picker should use stable sorted selection by default');

const auditRow = auditScript.buildAuditRow({
  id: 'court-2',
  name: '样本用户',
  history: [
    { id: 'r2', date: '2026-05-01', type: '充值', category: '储值', payMethod: '微信', amount: 800 },
    { id: 'c2', date: '2026-05-02', type: '消费', category: '订场', payMethod: '储值扣款', amount: 200 }
  ],
  balance: 600,
  totalDeposit: 800,
  spentAmount: 200,
  receivedAmount: 800,
  cachedBalance: 600,
  cachedTotalDeposit: 800,
  cachedTotalSpent: 200,
  cachedTotalReceived: 800
});

assert.strictEqual(auditRow.historyComputed.cachedBalance, 600);
assert.strictEqual(auditRow.legacyFields.balance, 600);
assert.strictEqual(auditRow.cachedFields.cachedBalance, 600);
assert.strictEqual(auditRow.matches.cachedBalance, true);

const baselineDoc = fs.readFileSync(baselineDocPath, 'utf8');
assert.match(baselineDoc, /旧接口耗时/, 'baseline template should include old interface timing field');
assert.match(baselineDoc, /首屏可见时间/, 'baseline template should include first screen timing field');
assert.match(baselineDoc, /随机抽取 10 个订场用户账户/, 'baseline template should include sample reconciliation section');

const writeChainDoc = fs.readFileSync(writeChainDocPath, 'utf8');
assert.match(writeChainDoc, /POST \/membership-orders/, 'write-chain doc should cover membership orders');
assert.match(writeChainDoc, /syncMatchFeeSplitToCourtFinance/, 'write-chain doc should cover match fee finance sync');
assert.match(writeChainDoc, /membership-accounts\/reconcile/, 'write-chain doc should cover membership reconcile');

console.log('court cached finance scripts tests passed');
