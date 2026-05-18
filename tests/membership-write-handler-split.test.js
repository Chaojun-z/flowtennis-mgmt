const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const handlerModulePath = path.join(__dirname, '../api/membership/write-handlers.js');

assert.ok(fs.existsSync(handlerModulePath), '会员购买写链应拆到独立模块');

const { createMembershipWriteHandler } = require(handlerModulePath);
assert.strictEqual(typeof createMembershipWriteHandler, 'function', '会员购买写链模块应导出 createMembershipWriteHandler');

assert.match(
  indexSource,
  /createMembershipWriteHandler/,
  'api/index.js 应通过独立 membership 写链处理器承接会员购买高危链路'
);

assert.match(
  indexSource,
  /createMembershipWriteHandler[\s\S]*handleMembershipWriteRequest[\s\S]*(const membershipWriteResponse=await handleMembershipWriteRequest\(\{path,method,user,body,query\}\);[\s\S]*if\(membershipWriteResponse\)return sendJson\(res,membershipWriteResponse\.body,membershipWriteResponse\.status\|\|200\);|handleMembershipWriteRequest,)/,
  'membership 写链应继续由独立模块承接，并允许通过更高层路由模块继续转发'
);

const handlerSource = fs.readFileSync(handlerModulePath, 'utf8');
assert.match(handlerSource, /\/membership-orders/, '拆分模块应覆盖会员购买主入口');
assert.match(handlerSource, /const membershipOrderMatch=path\.match\(/, '拆分模块应覆盖会员购买明细入口');
assert.match(handlerSource, /\/membership-benefit-ledger/, '拆分模块应覆盖会员权益流水入口');

console.log('membership write handler split tests passed');
