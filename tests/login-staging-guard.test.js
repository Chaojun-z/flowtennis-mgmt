const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../api/auth-admin/route-handlers.js'), 'utf8');

assert.match(
  source,
  /if\(isTableMissingError\(err\)\)return null;/,
  'login should still treat a missing ft_users table as a normal empty-user result'
);

assert.match(
  source,
  /if\(account\?\.__loginTimeout\)return \{status:503,body:\{error:LOGIN_STORAGE_TIMEOUT_ERROR\}\};/,
  'login should turn ft_users timeout failures into a readable 503 instead of crashing the function'
);

console.log('login staging guard tests passed');
