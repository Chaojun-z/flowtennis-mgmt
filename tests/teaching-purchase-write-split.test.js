const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(__dirname, '../api/teaching/route-handlers.js'), 'utf8');
const modulePath = path.join(__dirname, '../api/teaching/purchase-entitlement-write-handlers.js');
const handlerSource = fs.readFileSync(modulePath, 'utf8');

assert.ok(fs.existsSync(modulePath), 'purchase / entitlement 写链应拆到独立模块');

const { createPurchaseEntitlementWriteHandler } = require(modulePath);
assert.strictEqual(typeof createPurchaseEntitlementWriteHandler, 'function', 'purchase / entitlement 写链模块应导出 createPurchaseEntitlementWriteHandler');
assert.match(handlerSource, /createPurchaseVoidService/, 'purchase / entitlement 写链模块应注入独立购买作废 service');
assert.match(handlerSource, /createPurchaseUpdateService/, 'purchase / entitlement 写链模块应注入独立购买编辑 service');

assert.match(
  indexSource,
  /createPurchaseEntitlementWriteHandler/,
  'api/index.js 应注入独立 purchase / entitlement 写链处理器'
);

assert.match(
  routeSource,
  /const purchaseEntitlementWriteResponse=await handlePurchaseEntitlementWriteRequest\(\{path,method,user,body,res\}\);[\s\S]*if\(purchaseEntitlementWriteResponse\)return purchaseEntitlementWriteResponse;/,
  'teaching 主路由应先委托 purchase / entitlement 写链处理器，再继续处理其他教学入口'
);

assert.match(handlerSource, /if\(path==='\/purchases'\)\{/, '独立写链模块应覆盖 purchases 新增入口');
assert.match(handlerSource, /const purchaseMatch=path\.match\(/, '独立写链模块应覆盖 purchases 单条更新作废入口');
assert.match(handlerSource, /const entitlementMatch=path\.match\(/, '独立写链模块应覆盖 entitlements 删除入口');

async function main() {
  const calls = [];
  const handler = createPurchaseEntitlementWriteHandler({
    createPurchaseVoidService: () => ({
      voidPurchase: async ({ purchaseId, reason, userName }) => {
        calls.push({ type: 'voidPurchase', purchaseId, reason, userName });
        return { success: true };
      }
    }),
    createPurchaseUpdateService: () => ({
      updatePurchase: async () => {
        calls.push({ type: 'updatePurchase' });
        return { purchase: { id: 'pur-new' }, entitlements: [{ id: 'ent-1', purchaseId: 'pur-1' }] };
      }
    }),
    sendJson: (_res, body, code = 200) => ({ body, code }),
    init: async () => calls.push('init'),
    get: async (table, id) => {
      calls.push(`get:${table}:${id}`);
      if (table === 'packages') return { id: 'pkg-1', name: '课包A' };
      if (table === 'students') return { id: 'stu-1', name: '张三' };
      if (table === 'purchases') return { id: 'pur-1', packageId: 'pkg-1', studentId: 'stu-1', createdAt: '2026-05-01T00:00:00.000Z', purchaseDate: '2026-05-01', operator: '管理员' };
      return null;
    },
    scan: async (table) => {
      calls.push(`scan:${table}`);
      if (table === 'entitlements') return [{ id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1' }];
      if (table === 'entitlementLedger') return [];
      return [];
    },
    put: async (_table, _id, _record) => calls.push('put'),
    del: async (_table, _id) => calls.push('del'),
    getCachedScan: async (_table) => [],
    uuidv4: () => 'generated-id',
    validatePurchaseInputForPackage: () => calls.push('validatePurchase'),
    buildPurchaseRecord: () => ({ id: 'pur-new' }),
    buildEntitlementFromPurchase: () => ({ id: 'ent-new' }),
    writePurchaseAndEntitlementAtomic: async () => calls.push('writePurchaseAndEntitlementAtomic'),
    purchaseHasEntitlementLedger: () => false,
    assertCanEditPurchaseWithLedger: () => calls.push('assertCanEditPurchaseWithLedger'),
    syncEntitlementFromPurchase: () => ({ id: 'ent-1', purchaseId: 'pur-1' }),
    assertCanVoidPurchase: () => calls.push('assertCanVoidPurchase'),
    assertCanDeleteEntitlement: () => calls.push('assertCanDeleteEntitlement'),
    tables: {
      packages: 'packages',
      students: 'students',
      purchases: 'purchases',
      entitlements: 'entitlements',
      entitlementLedger: 'entitlementLedger'
    }
  });

  const postResult = await handler({
    path: '/purchases',
    method: 'POST',
    user: { role: 'admin', name: '管理员' },
    body: { packageId: 'pkg-1', studentId: 'stu-1' },
    res: {}
  });
  assert.deepStrictEqual(postResult.body, { purchase: { id: 'pur-new' }, entitlement: { id: 'ent-new' } }, 'purchase create should keep original response shape');

  const putResult = await handler({
    path: '/purchases/pur-1',
    method: 'PUT',
    user: { role: 'admin', name: '管理员' },
    body: {},
    res: {}
  });
  assert.deepStrictEqual(putResult.body, { purchase: { id: 'pur-new' }, entitlements: [{ id: 'ent-1', purchaseId: 'pur-1' }] }, 'purchase update should keep original response shape');

  const deleteEntitlementResult = await handler({
    path: '/entitlements/ent-1',
    method: 'DELETE',
    user: { role: 'admin', name: '管理员' },
    body: {},
    res: {}
  });
  assert.deepStrictEqual(deleteEntitlementResult.body, { success: true }, 'entitlement delete should keep original response shape');

  const deletePurchaseResult = await handler({
    path: '/purchases/pur-1',
    method: 'DELETE',
    user: { role: 'admin', name: '管理员' },
    body: { reason: '购买记录作废' },
    res: {}
  });
  assert.deepStrictEqual(deletePurchaseResult.body, { success: true }, 'purchase void should keep original response shape');

  assert.ok(calls.includes('writePurchaseAndEntitlementAtomic'), 'purchase create should still go through the atomic purchase + entitlement writer');
  assert.ok(calls.includes('assertCanDeleteEntitlement'), 'entitlement delete should still run the original delete guard');
  assert.deepStrictEqual(calls.find((item) => item && item.type === 'updatePurchase'), { type: 'updatePurchase' }, 'purchase update route should delegate linked writes to the dedicated update service');
  assert.deepStrictEqual(
    calls.find((item) => item && item.type === 'voidPurchase'),
    { type: 'voidPurchase', purchaseId: 'pur-1', reason: '购买记录作废', userName: '管理员' },
    'purchase void route should delegate linked writes to the dedicated void service'
  );
}

main()
  .then(() => console.log('teaching purchase write split tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
