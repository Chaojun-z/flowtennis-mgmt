const assert = require('assert');
const fs = require('fs');
const path = require('path');

const matchModuleSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'matches', 'index.js'), 'utf8');

assert.match(matchModuleSource, /path==='\/auth\/wechat-mini-login'&&method==='POST'/, 'match module should expose mini login route');
assert.doesNotMatch(
  matchModuleSource,
  /path==='\/auth\/wechat-mini-login'&&method==='POST'\)\{\s*try\{assertMatchWriteAllowed\(req\);\}/,
  'mini login route should not be blocked by production write guard'
);

console.log('match login preview access test passed');
