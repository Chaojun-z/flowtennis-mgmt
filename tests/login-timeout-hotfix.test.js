const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(source, /const LOGIN_STORAGE_TIMEOUT_ERROR='登录服务暂时超时，请重试';/, 'login should expose a readable timeout error');
assert.match(source, /async function loadLoginUser\(username\)\{[\s\S]*withTimeout\(getCachedRow\(T_USERS,username\),LOGIN_ROW_TIMEOUT_MS,rowTimeout\)[\s\S]*getCachedScan\(T_USERS\)\.catch\(\(err\)=>\{/, 'login should fallback from ft_users row lookup to cached user scan');
assert.match(source, /if\(user\?\.__loginTimeout\)return sendJson\(res,\{error:LOGIN_STORAGE_TIMEOUT_ERROR\},503\);/, 'login should return 503 instead of surfacing a raw timeout crash');

console.log('login timeout hotfix tests passed');
