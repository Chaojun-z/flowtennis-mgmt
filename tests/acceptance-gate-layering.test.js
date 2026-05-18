const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repoRoot = path.join(__dirname, '..');
const packageJson = require(path.join(repoRoot, 'package.json'));
const { LAYERS } = require(path.join(repoRoot, 'scripts', 'dev', 'acceptance-gate.js'));

assert.strictEqual(
  packageJson.scripts['gate:local'],
  'node scripts/dev/acceptance-gate.js local',
  'package.json should expose a unified local gate entry'
);
assert.strictEqual(
  packageJson.scripts['gate:staging'],
  'node scripts/dev/acceptance-gate.js staging',
  'package.json should expose a unified staging gate entry'
);
assert.strictEqual(
  packageJson.scripts['gate:main'],
  'node scripts/dev/acceptance-gate.js main',
  'package.json should expose a unified main gate entry'
);

assert.deepStrictEqual(
  LAYERS.local.steps,
  ['npm test', 'npm run guard:finance'],
  'local gate should compose test and finance guard'
);
assert.match(
  String(packageJson.scripts.test || ''),
  /tests\/match-production-guard\.test\.js/,
  'default npm test should include the match production write guard test'
);
assert.match(
  String(packageJson.scripts.test || ''),
  /tests\/match-login-preview-access\.test\.js/,
  'default npm test should include the match mini login preview access test'
);
assert.deepStrictEqual(
  LAYERS.staging.steps,
  ['npm run gate:local', 'npm run staging:ensure-login-minimal:check', 'npm run staging:ensure-browse-minimal:check'],
  'staging gate should extend local gate with staging checks'
);
assert.deepStrictEqual(
  LAYERS.main.steps,
  ['npm run gate:staging'],
  'main gate should currently reuse the staging acceptance gate'
);

const workflowText = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci-guard.yml'), 'utf8');
assert.match(workflowText, /npm run gate:local/, 'workflow should call the unified local gate entry');

const docPath = path.join(repoRoot, 'docs', '2026-05-12-第二阶段最小总闸门规则表.md');
assert.ok(fs.existsSync(docPath), 'repo should provide the stage-2 acceptance gate rule table');
const docText = fs.readFileSync(docPath, 'utf8');
assert.match(docText, /本地前置/, 'rule table should define the local gate layer');
assert.match(docText, /staging 验收前/, 'rule table should define the staging gate layer');
assert.match(docText, /主干收口前/, 'rule table should define the main gate layer');
assert.match(docText, /tests\/miniprogram-shell\.test\.js/, 'rule table should record the current red test explicitly');

console.log('acceptance gate layering tests passed');
