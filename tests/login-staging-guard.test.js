const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(
  source,
  /if\(path==='\/auth\/login'&&method==='POST'\)\{const\{username,password\}=body;if\(!username\|\|!password\)return sendJson\(res,\{error:'请填写账号和密码'\},400\);let user=null;try\{user=await getCachedRow\(T_USERS,username\);\}catch\(err\)\{if\(!isTableMissingError\(err\)\)throw err;\}if\(!user\|\|!await bcrypt\.compare\(password,user\.password\)\)return sendJson\(res,\{error:'账号或密码错误'\},401\);/,
  'login should treat missing ft_users table as a normal 401 instead of crashing the function'
);

console.log('login staging guard tests passed');
