const assert = require('assert');
const fs = require('fs');
const path = require('path');

const matchModuleSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'matches', 'index.js'), 'utf8');
const miniApiSource = fs.readFileSync(path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram', 'utils', 'api.js'), 'utf8');

assert.match(matchModuleSource, /path==='\/auth\/wechat-mini-login'&&method==='POST'/, 'match module should expose mini login route');
assert.doesNotMatch(
  matchModuleSource,
  /path==='\/auth\/wechat-mini-login'&&method==='POST'\)\{\s*try\{assertMatchWriteAllowed\(req\);\}/,
  'mini login route should not be blocked by production write guard'
);
assert.match(
  matchModuleSource,
  /path==='\/matches'&&method==='GET'\)\{\s*const matchUser=readOptionalMatchUser\(req\);\s*return sendJson\(res,\{items:await listMatchesForViewer\(matchUser\?\.id\|\|''\)\}\);/,
  'match list route should allow consumer home to read matches without requiring login'
);
assert.match(miniApiSource, /['"]X-FlowTennis-Client['"]\s*:\s*['"]mini-match['"]/, 'mini program requests should identify themselves as mini-match traffic');
assert.match(miniApiSource, /['"]X-FlowTennis-Client-Env['"]/, 'mini program requests should send the client env header');
assert.match(miniApiSource, /['"]X-FlowTennis-Wechat-Env-Version['"]/, 'mini program requests should send the wechat env version header');

console.log('match login preview access test passed');
