const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const handlerModulePath = path.join(__dirname, '../api/courts-membership/route-handlers.js');

assert.ok(fs.existsSync(handlerModulePath), '订场 / 会员 / 价格主链应拆到独立模块');

const { createCourtsMembershipHandler } = require(handlerModulePath);
assert.strictEqual(typeof createCourtsMembershipHandler, 'function', '订场 / 会员 / 价格模块应导出 createCourtsMembershipHandler');

assert.match(
  indexSource,
  /createCourtsMembershipHandler/,
  'api\\/index\\.js 应通过独立 courts-membership 处理器承接订场 / 会员 / 价格主链'
);

assert.match(
  indexSource,
  /const courtsMembershipResponse=await handleCourtsMembershipRequest\(\{path,method,user,body,query\}\);[\s\S]*if\(courtsMembershipResponse\)return sendJson\(res,courtsMembershipResponse\.body,courtsMembershipResponse\.status\|\|200\);/,
  'api/index.js 应统一委托 courts-membership 处理器，再按返回结果 sendJson'
);

const handlerSource = fs.readFileSync(handlerModulePath, 'utf8');
assert.match(
  handlerSource,
  /\/price-plans[\s\S]*\/courts[\s\S]*\/membership-plans[\s\S]*\/membership-accounts[\s\S]*\/membership-account-events/s,
  '拆分模块至少应覆盖价格方案、订场、会员方案、会员账户、会员账户事件主入口'
);
assert.match(handlerSource, /handleMembershipWriteRequest/, '拆分模块应继续承接会员购买 / 权益写链的转发边界');
assert.match(handlerSource, /\/courts\/merge/, '拆分模块应覆盖订场合并入口');
assert.match(handlerSource, /\/courts\/batch-delete/, '拆分模块应覆盖订场批量删除入口');
assert.match(handlerSource, /\/courts\/migrate-legacy/, '拆分模块应覆盖订场历史迁移入口');
assert.match(handlerSource, /\/courts\/migrate-finance-legacy/, '拆分模块应覆盖订场财务历史迁移入口');
assert.match(handlerSource, /courtDeleteAction/, '拆分模块应继续通过现有删除判定保护财务历史链');
assert.match(handlerSource, /runMembershipReconcile/, '拆分模块应继续通过现有会员对账链保护 court.history 联动');

console.log('courts membership handler split tests passed');
