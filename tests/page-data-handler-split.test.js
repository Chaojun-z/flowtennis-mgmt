const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const handlerModulePath = path.join(__dirname, '../api/page-data/aggregate-handlers.js');
const financeReadModelPath = path.join(__dirname, '../api/page-data/finance-read-model.js');

assert.ok(fs.existsSync(handlerModulePath), 'page-data 聚合链应拆到独立模块');
assert.ok(fs.existsSync(financeReadModelPath), 'finance page-data 读模型应继续拆到独立模块');

const { createPageDataHandler } = require(handlerModulePath);
assert.strictEqual(typeof createPageDataHandler, 'function', 'page-data 聚合模块应导出 createPageDataHandler');

assert.match(
  indexSource,
  /createPageDataHandler/,
  'api/index.js 应通过独立 page-data 聚合处理器承接高危只读聚合链'
);

assert.match(
  indexSource,
  /const pageDataResponse=await handlePageDataRequest\(\{path,method,user,query\}\);[\s\S]*if\(pageDataResponse\)return sendJson\(res,pageDataResponse\.body,pageDataResponse\.status\|\|200\);/,
  'api/index.js 应统一委托 page-data 聚合链，再按返回结果 sendJson'
);

const handlerSource = fs.readFileSync(handlerModulePath, 'utf8');
const financeReadModelSource = fs.readFileSync(financeReadModelPath, 'utf8');
assert.match(
  handlerSource,
  /\/page-data\/purchases[\s\S]*\/page-data\/finance[\s\S]*\/page-data\/courts[\s\S]*\/page-data\/memberships[\s\S]*\/page-data\/workbench/s,
  '第二批拆分至少应覆盖当前五个 page-data 聚合入口'
);
assert.match(
  handlerSource,
  /return \{body:await loadFinancePageData\(\)\};/,
  'finance 聚合入口应委托独立读模型，避免继续在 page-data 处理器内拼装财务大对象'
);
assert.match(
  financeReadModelSource,
  /function createFinancePageDataLoader/,
  'finance 读模型模块应提供独立工厂函数'
);

console.log('page data handler split tests passed');
