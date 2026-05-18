const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const handlerModulePath = path.join(__dirname, '../api/teaching/route-handlers.js');

assert.ok(fs.existsSync(handlerModulePath), '教学履约主链应拆到独立模块');

const { createTeachingHandler } = require(handlerModulePath);
assert.strictEqual(typeof createTeachingHandler, 'function', '教学履约模块应导出 createTeachingHandler');

assert.match(
  indexSource,
  /createTeachingHandler/,
  'api/index.js 应通过独立 teaching 处理器承接教学履约主链'
);

assert.match(
  indexSource,
  /const teachingResponse=await handleTeachingRequest\(\{path,method,user,body,query,res\}\);[\s\S]*if\(teachingResponse\)return teachingResponse;/,
  'api/index.js 应统一委托 teaching 处理器，由独立模块直接完成响应'
);

const handlerSource = fs.readFileSync(handlerModulePath, 'utf8');
assert.match(
  handlerSource,
  /function handleTeachingCoreRequest\(/,
  '教学模块应显式区分核心履约处理入口'
);
assert.match(
  handlerSource,
  /function handleTeachingCompatRequest\(/,
  '教学模块应显式区分旧教学兼容处理入口'
);
assert.match(
  handlerSource,
  /\/students[\s\S]*\/packages[\s\S]*\/purchases[\s\S]*\/entitlement-ledger[\s\S]*\/entitlements[\s\S]*\/feedbacks[\s\S]*\/schedule[\s\S]*\/coaches/s,
  '核心履约处理入口至少应覆盖学员、课包、购买、权益、反馈、排课、教练'
);
assert.match(
  handlerSource,
  /\/products[\s\S]*\/classes/s,
  '旧教学兼容处理入口至少应覆盖 products、classes'
);
assert.doesNotMatch(
  handlerSource,
  /\/plans/,
  '旧教学兼容处理入口不应再保留 plans 路由'
);

console.log('teaching route handler split tests passed');
