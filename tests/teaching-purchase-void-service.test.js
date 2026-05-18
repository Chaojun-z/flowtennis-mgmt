const assert = require('assert');
const fs = require('fs');
const path = require('path');

const handlerSource = fs.readFileSync(path.join(__dirname, '../api/teaching/purchase-entitlement-write-handlers.js'), 'utf8');
const servicePath = path.join(__dirname, '../api/teaching/purchase-void-service.js');

assert.ok(fs.existsSync(servicePath), '购买作废联动写链应继续下沉到独立 service');

const { createPurchaseVoidService } = require(servicePath);
assert.strictEqual(typeof createPurchaseVoidService, 'function', '购买作废联动写链 service 应导出 createPurchaseVoidService');

assert.match(
  handlerSource,
  /const purchaseVoidService=createPurchaseVoidService\(/,
  'purchase 写链处理器应注入独立购买作废 service'
);

assert.match(
  handlerSource,
  /await purchaseVoidService\.voidPurchase\(\{purchaseId:id,reason:body\.reason,userName:user\.name\|\|''\}\);/,
  'purchase DELETE 路由应委托独立购买作废 service 处理 entitlement 联动写入'
);

async function main() {
  const calls = [];
  const service = createPurchaseVoidService({
    scan: async (table) => {
      calls.push(`scan:${table}`);
      if (table === 'entitlements') {
        return [
          { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', status: 'active' },
          { id: 'ent-2', purchaseId: 'pur-2', studentId: 'stu-2', status: 'active' }
        ];
      }
      if (table === 'entitlementLedger') return [];
      return [];
    },
    get: async (table, id) => {
      calls.push(`get:${table}:${id}`);
      if (table === 'purchases' && id === 'pur-1') {
        return { id: 'pur-1', status: 'active', updatedAt: '2026-05-01T00:00:00.000Z' };
      }
      return null;
    },
    put: async (table, id, record) => calls.push({ table, id, record }),
    uuidv4: () => 'ledger-1',
    assertCanVoidPurchase: (purchaseId, ents, ledger) => {
      calls.push(`assert:${purchaseId}:${ents.length}:${ledger.length}`);
    },
    tables: {
      purchases: 'purchases',
      entitlements: 'entitlements',
      entitlementLedger: 'entitlementLedger'
    }
  });

  const result = await service.voidPurchase({
    purchaseId: 'pur-1',
    reason: '购买记录作废',
    userName: '管理员',
    now: '2026-05-12T10:00:00.000Z'
  });

  assert.deepStrictEqual(result, { success: true }, '购买作废 service 应保持原返回结果');
  assert.ok(calls.includes('assert:pur-1:2:0'), '购买作废 service 应保持原有作废校验');

  const writes = calls.filter((item) => typeof item === 'object');
  assert.deepStrictEqual(
    writes,
    [
      {
        table: 'entitlements',
        id: 'ent-1',
        record: { id: 'ent-1', purchaseId: 'pur-1', studentId: 'stu-1', status: 'voided', updatedAt: '2026-05-12T10:00:00.000Z' }
      },
      {
        table: 'entitlementLedger',
        id: 'ledger-1',
        record: {
          id: 'ledger-1',
          entitlementId: 'ent-1',
          studentId: 'stu-1',
          purchaseId: 'pur-1',
          lessonDelta: 0,
          action: 'void_purchase',
          reason: '购买记录作废',
          operator: '管理员',
          createdAt: '2026-05-12T10:00:00.000Z'
        }
      },
      {
        table: 'purchases',
        id: 'pur-1',
        record: {
          id: 'pur-1',
          status: 'voided',
          updatedAt: '2026-05-12T10:00:00.000Z',
          voidedAt: '2026-05-12T10:00:00.000Z',
          voidedBy: '管理员',
          voidReason: '购买记录作废'
        }
      }
    ],
    '购买作废 service 应保持原 entitlement、ledger、purchase 三段联动写入结构'
  );
}

main()
  .then(() => console.log('teaching purchase void service tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
