const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(source, /const IS_PRODUCTION_RUNTIME = RUNTIME_STAGE === 'production';/, 'api should derive a production runtime guard');
assert.match(source, /function scheduleInitInBackground\(\)\{[\s\S]*if\(IS_PRODUCTION_RUNTIME\)return;/, 'production requests should not background-trigger init');
assert.match(source, /async function init\(\)\{[\s\S]*if\(IS_PRODUCTION_RUNTIME\)\{[\s\S]*inited=true;[\s\S]*production request-ready without heavy bootstrap/, 'production init should short-circuit before heavy bootstrap work');
assert.doesNotMatch(source, /if\(path==='\/load-all'&&method==='GET'\)\{[\s\S]*await maybeRepairImportedLedgerDuplicates\(\);/, 'load-all should not trigger imported ledger repair from the request path');

console.log('production request init guard tests passed');
