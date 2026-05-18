const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const scriptRoot = path.join(repoRoot, 'scripts');

const migratedScripts = [
  { name: 'dev-server.js', targetDir: 'dev' },
  { name: 'migrate-match-db.js', targetDir: 'dev' },
  { name: 'finance-regression.js', targetDir: 'dev' },
  { name: 'ensure-staging-login-minimal.js', targetDir: 'staging' },
  { name: 'ensure-staging-browse-minimal.js', targetDir: 'staging' }
];

for (const script of migratedScripts) {
  const rootPath = path.join(scriptRoot, script.name);
  const targetPath = path.join(scriptRoot, script.targetDir, script.name);
  assert.ok(!fs.existsSync(rootPath), `${script.name} should no longer stay in scripts root`);
  assert.ok(fs.existsSync(targetPath), `${script.name} should exist under scripts/${script.targetDir}`);
}

console.log('dev scripts sixth batch migration tests passed');
