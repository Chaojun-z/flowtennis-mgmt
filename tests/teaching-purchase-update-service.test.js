const assert = require('assert');
const fs = require('fs');
const path = require('path');

const handlerSource = fs.readFileSync(path.join(__dirname, '../api/teaching/purchase-entitlement-write-handlers.js'), 'utf8');
const servicePath = path.join(__dirname, '../api/teaching/purchase-update-service.js');

assert.ok(fs.existsSync(servicePath), '购买编辑联动写链应继续下沉到独立 service');

const { createPurchaseUpdateService } = require(servicePath);
assert.strictEqual(typeof createPurchaseUpdateService, 'function', '购买编辑联动写链 service 应导出 createPurchaseUpdateService');

assert.match(
  handlerSource,
  /const purchaseUpdateService=createPurchaseUpdateService\(/,
  'purchase 写链处理器应注入独立购买编辑 service'
);

assert.match(
  handlerSource,
  /const result=await purchaseUpdateService\.updatePurchase\(\{/,
  'purchase PUT 路由应委托独立购买编辑 service 处理 entitlement 同步与回滚'
);

async function main() {
  const calls = [];
  const service = createPurchaseUpdateService({
    get: async (table, id) => {
      calls.push(`get:${table}:${id}`);
      if (table === 'packages') return { id: 'pkg-1', name: '课包A' };
      if (table === 'students') return { id: 'stu-1', name: '张三' };
      return null;
    },
    put: async (table, id, record) => {
      calls.push({ table, id, record });
      if (id === 'ent-2') throw new Error('sync failed');
    },
    validatePurchaseInputForPackage: () => calls.push('validatePurchase'),
    buildPurchaseRecord: () => ({ id: 'pur-1', packageId: 'pkg-1', studentId: 'stu-1', updatedAt: 'new' }),
    syncEntitlementFromPurchase: (_pkg, _purchase, _student, ent) => ({ ...ent, synced: true }),
    tables: {
      packages: 'packages',
      students: 'students',
      purchases: 'purchases',
      entitlements: 'entitlements'
    }
  });

  await assert.rejects(
    () => service.updatePurchase({
      purchaseId: 'pur-1',
      oldPurchase: { id: 'pur-1', packageId: 'pkg-0', studentId: 'stu-0', createdAt: 'old' },
      body: {},
      entitlements: [
        { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1' },
        { id: 'ent-2', purchaseId: 'pur-1', studentId: 'stu-1' }
      ],
      userName: '管理员',
      now: '2026-05-12T12:00:00.000Z'
    }),
    /sync failed/,
    '购买编辑 service 在 entitlement 同步失败时应继续抛出原错误'
  );

  const writes = calls.filter((item) => typeof item === 'object');
  assert.deepStrictEqual(
    writes,
    [
      { table: 'purchases', id: 'pur-1', record: { id: 'pur-1', packageId: 'pkg-1', studentId: 'stu-1', updatedAt: 'new' } },
      { table: 'entitlements', id: 'ent-1', record: { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', synced: true } },
      { table: 'entitlements', id: 'ent-2', record: { id: 'ent-2', purchaseId: 'pur-1', studentId: 'stu-1', synced: true } },
      { table: 'purchases', id: 'pur-1', record: { id: 'pur-1', packageId: 'pkg-0', studentId: 'stu-0', createdAt: 'old' } },
      { table: 'entitlements', id: 'ent-1', record: { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1' } },
      { table: 'entitlements', id: 'ent-2', record: { id: 'ent-2', purchaseId: 'pur-1', studentId: 'stu-1' } }
    ],
    '购买编辑 service 应保持原 purchase 先写、entitlement 同步、失败后回滚旧 purchase 与旧 entitlements 的顺序'
  );
}

main()
  .then(() => console.log('teaching purchase update service tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
