const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptRoot = path.join(repoRoot, 'scripts');

const movedToAudit = [
  'audit-coach-reference-consistency.js',
  'audit-court-finance-anomalies.js',
  'audit-history-income-import.js',
  'audit-ledger-student.js',
  'audit-mabao-match-history.js',
  'audit-mabao-membership-sheet.js'
];

const movedToInspect = [
  'find-entitlements-by-keyword.js',
  'find-purchases-by-keyword.js',
  'find-students-by-keyword.js',
  'inspect-coach-reference-anomalies.js',
  'inspect-mabao-ledger-by-court.js',
  'inspect-mabao-membership-damaged-orders.js',
  'inspect-mabao-membership-plan.js',
  'inspect-mabao-membership-related.js',
  'inspect-purchase-entitlement-by-id.js'
];

for (const scriptName of movedToAudit) {
  assert.ok(!fs.existsSync(path.join(scriptRoot, scriptName)), `${scriptName} should no longer stay in scripts root`);
  assert.ok(fs.existsSync(path.join(scriptRoot, 'audit', scriptName)), `${scriptName} should exist under scripts/audit`);
}

for (const scriptName of movedToInspect) {
  assert.ok(!fs.existsSync(path.join(scriptRoot, scriptName)), `${scriptName} should no longer stay in scripts root`);
  assert.ok(fs.existsSync(path.join(scriptRoot, 'inspect', scriptName)), `${scriptName} should exist under scripts/inspect`);
}

console.log('readonly scripts fourth batch migration tests passed');
