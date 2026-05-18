const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptRoot = path.join(repoRoot, 'scripts');

const migratedScripts = [
  'preview-mabao-income-csv.py',
  'prepare-mabao-income-import.py',
  'build-confirmed-income-batch.py',
  'bridge-mabao-ready-to-confirmed.py'
];

for (const scriptName of migratedScripts) {
  const rootPath = path.join(scriptRoot, scriptName);
  const inspectPath = path.join(scriptRoot, 'inspect', scriptName);
  assert.ok(!fs.existsSync(rootPath), `${scriptName} should no longer stay in scripts root`);
  assert.ok(fs.existsSync(inspectPath), `${scriptName} should exist under scripts/inspect`);
}

console.log('inspect fifth batch migration tests passed');
