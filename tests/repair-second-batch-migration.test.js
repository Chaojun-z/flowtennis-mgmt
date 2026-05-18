const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptRoot = path.join(repoRoot, 'scripts');

const migratedScripts = [
  'restore-damaged-mabao-membership-orders.js',
  'fix-mabao-membership-orders.js',
  'complete-mabao-zhoutao-viki-cleanup.js',
  'create-mabao-membership-safe-missing.js',
  'settle-history-income-tail.js'
];

for (const scriptName of migratedScripts) {
  const rootPath = path.join(scriptRoot, scriptName);
  const repairPath = path.join(scriptRoot, 'repair', scriptName);
  assert.ok(!fs.existsSync(rootPath), `${scriptName} should no longer stay in scripts root`);
  assert.ok(fs.existsSync(repairPath), `${scriptName} should exist under scripts/repair`);
}

console.log('repair second batch migration tests passed');
