const assert = require('assert');
const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci-guard.yml');
const source = fs.readFileSync(workflowPath, 'utf8');

assert.match(source, /name:\s*Run Local Acceptance Gate/i, 'workflow should expose the unified local gate step');
assert.match(source, /npm run gate:local/, 'workflow should execute the unified local gate entry');
assert.doesNotMatch(source, /Finance guard placeholder|TODO: 接入真实财务回归脚本后替换本步骤/, 'workflow should not keep placeholder finance guard text');

console.log('ci guard workflow tests passed');
