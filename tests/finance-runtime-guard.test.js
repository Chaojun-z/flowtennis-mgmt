const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(stateSource, /let financeOverviewData=null,financeNormalizedLedgerRows=\[\];/, 'finance state should define safe defaults for normalized overview data');
assert.match(stateSource, /function financeNormalizedRows\(\)\{\s*return Array\.isArray\(financeNormalizedLedgerRows\)\?financeNormalizedLedgerRows:\[\];\s*\}/, 'finance state should expose a safe normalized ledger rows helper');
assert.match(stateSource, /financeOverviewData=data\.financeOverviewData\|\|null;/, 'finance page data load should accept backend normalized overview data when present');
assert.match(stateSource, /financeNormalizedLedgerRows=Array\.isArray\(data\.financeNormalizedRows\)\?data\.financeNormalizedRows:\[\];/, 'finance page data load should accept backend normalized ledger rows when present');
assert.match(stateSource, /financeOverviewData=null;financeNormalizedLedgerRows=\[\];/, 'finance state reset should clear normalized finance cache');

console.log('finance runtime guard tests passed');
