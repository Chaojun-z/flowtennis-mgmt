require('dotenv').config();

const api = require('../api/index.js')._test;

async function main() {
  if (!api || typeof api.runFinanceAuditSnapshot !== 'function') {
    throw new Error('缺少 runFinanceAuditSnapshot 导出');
  }
  const strict = process.argv.includes('--strict');
  const result = await api.runFinanceAuditSnapshot();
  const audit = result.audit || {};
  const manualReviewItems = Array.isArray(audit.manualReviewItems)
    ? audit.manualReviewItems
    : (Array.isArray(audit.actionItems) ? audit.actionItems : []);
  const payload = {
    generatedAt: audit.generatedAt || new Date().toISOString(),
    status: audit.status || 'unknown',
    blockingCount: Number(audit.blockingCount) || 0,
    warningCount: Number(audit.warningCount) || 0,
    pendingCount: Number(audit.pendingCount) || 0,
    fixedCount: Number(audit.fixedCount) || 0,
    missingCampusCount: Number(audit.missingCampusCount) || 0,
    unknownBusinessCount: Number(audit.unknownBusinessCount) || 0,
    unknownActionCount: Number(audit.unknownActionCount) || 0,
    importMissingDateCount: Number(audit.importMissingDateCount) || 0,
    importZeroAmountCount: Number(audit.importZeroAmountCount) || 0,
    chaojunRiskCount: Number(audit.chaojunRiskCount) || 0,
    externalCampusRiskCount: Number(audit.externalCampusRiskCount) || 0,
    autoFixedCampusCount: Number(audit.autoFixedCampusCount) || 0,
    autoFixedDateCount: Number(audit.autoFixedDateCount) || 0,
    autoTraceOnlyCount: Number(audit.autoTraceOnlyCount) || 0,
    cashGap: Number(audit.cashGap) || 0,
    recognizedGap: Number(audit.recognizedGap) || 0,
    deferredGap: Number(audit.deferredGap) || 0,
    strict,
    passed: strict
      ? ((Number(audit.blockingCount) || 0) === 0 && (Number(audit.warningCount) || 0) === 0 && (Number(audit.pendingCount) || 0) === 0)
      : true,
    manualReviewItems,
    actionItems: Array.isArray(audit.actionItems) ? audit.actionItems : [],
    fixedItems: Array.isArray(audit.fixedItems) ? audit.fixedItems : [],
    details: Array.isArray(audit.details) ? audit.details : []
  };
  process.stdout.write(JSON.stringify(payload, null, 2));
  if (strict && !payload.passed) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error('[finance-audit] failed:', error && error.message ? error.message : error);
  process.exit(1);
});
