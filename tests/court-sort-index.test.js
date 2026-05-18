const assert = require('assert');
const fs = require('fs');
const path = require('path');

const modulePath = path.join(__dirname, '../api/courts/court-sort-index.js');
const pageDataHandlerPath = path.join(__dirname, '../api/page-data/aggregate-handlers.js');
const courtsMembershipHandlerPath = path.join(__dirname, '../api/courts-membership/route-handlers.js');
const membershipWriteHandlerPath = path.join(__dirname, '../api/membership/write-handlers.js');
const indexPath = path.join(__dirname, '../api/index.js');

assert.ok(fs.existsSync(modulePath), 'courts 默认排序应拆到独立排序支撑模块');

const {
  buildCourtSortIndexRow,
  createCourtSortIndexService
} = require(modulePath);

assert.strictEqual(typeof buildCourtSortIndexRow, 'function', '排序支撑模块应导出 buildCourtSortIndexRow');
assert.strictEqual(typeof createCourtSortIndexService, 'function', '排序支撑模块应导出 createCourtSortIndexService');

const defaultRow = buildCourtSortIndexRow({
  id: 'court-a',
  name: 'A',
  updatedAt: '2026-05-12T10:00:00.000Z',
  createdAt: '2026-05-01T10:00:00.000Z'
});
assert.ok(defaultRow, '普通订场用户应能生成排序索引行');
assert.strictEqual(defaultRow.courtId, 'court-a');
assert.match(defaultRow.id, /^2026-05-12T10:00:00.000Z#court-a$/, '排序索引主键应基于 updatedAt desc 语义构造');

const fallbackRow = buildCourtSortIndexRow({
  id: 'court-b',
  name: 'B',
  createdAt: '2026-05-02T08:00:00.000Z'
});
assert.ok(fallbackRow, '没有 updatedAt 的记录应回退 createdAt');
assert.match(fallbackRow.id, /^2026-05-02T08:00:00.000Z#court-b$/, '排序索引主键应能回退 createdAt');

const excludedRow = buildCourtSortIndexRow({
  id: 'match-court-finance',
  name: '约球订场',
  updatedAt: '2026-05-12T11:00:00.000Z'
});
assert.strictEqual(excludedRow, null, 'match-court-finance 不应进入样板页默认排序索引');

function createMemoryTableStorage() {
  const tables = new Map();
  const ensure = (tableName) => {
    if (!tables.has(tableName)) tables.set(tableName, []);
    return tables.get(tableName);
  };
  return {
    tables,
    async listPageDesc(tableName, { limit = 20, cursor = '' } = {}) {
      const rows = ensure(tableName).slice().sort((a, b) => String(b.id).localeCompare(String(a.id)));
      const startIndex = cursor ? rows.findIndex((row) => row.id === cursor) + 1 : 0;
      const items = rows.slice(startIndex, startIndex + limit);
      return {
        rows: items,
        nextCursor: rows[startIndex + limit] ? items[items.length - 1].id : ''
      };
    },
    async put(tableName, id, row) {
      const rows = ensure(tableName);
      const next = { ...row, id };
      const index = rows.findIndex((item) => item.id === id);
      if (index >= 0) rows[index] = next;
      else rows.push(next);
    },
    async scanAll(tableName) {
      return ensure(tableName).slice();
    },
    async del(tableName, id) {
      const rows = ensure(tableName);
      const index = rows.findIndex((item) => item.id === id);
      if (index >= 0) rows.splice(index, 1);
    }
  };
}

(async () => {
  const storage = createMemoryTableStorage();
  const service = createCourtSortIndexService({
    tableName: 'ft_court_sort_index',
    listPageDesc: storage.listPageDesc,
    put: storage.put,
    scanAll: storage.scanAll,
    del: storage.del
  });

  await service.syncCourt({
    id: 'court-a',
    name: 'A',
    updatedAt: '2026-05-12T10:00:00.000Z',
    createdAt: '2026-05-01T10:00:00.000Z'
  });
  await service.syncCourt({
    id: 'court-b',
    name: 'B',
    updatedAt: '2026-05-12T12:00:00.000Z',
    createdAt: '2026-05-01T09:00:00.000Z'
  });
  await service.syncCourt({
    id: 'court-c',
    name: 'C',
    createdAt: '2026-05-11T12:00:00.000Z'
  });
  await service.syncCourt({
    id: 'match-court-finance',
    name: '约球订场',
    updatedAt: '2026-05-13T12:00:00.000Z'
  });

  let page = await service.listPage({ limit: 2 });
  assert.deepStrictEqual(page.rows.map((row) => row.courtId), ['court-b', 'court-a'], '分页读取应按 updatedAt desc 返回');
  assert.ok(page.nextCursor, '超过单页大小时应返回 nextCursor');

  page = await service.listPage({ limit: 2, cursor: page.nextCursor });
  assert.deepStrictEqual(page.rows.map((row) => row.courtId), ['court-c'], '第二页应继续按索引顺序返回剩余记录');

  await service.syncCourt(
    {
      id: 'court-a',
      name: 'A',
      updatedAt: '2026-05-14T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z'
    },
    {
      id: 'court-a',
      name: 'A',
      updatedAt: '2026-05-12T10:00:00.000Z',
      createdAt: '2026-05-01T10:00:00.000Z'
    }
  );
  page = await service.listPage({ limit: 3 });
  assert.deepStrictEqual(page.rows.map((row) => row.courtId), ['court-a', 'court-b', 'court-c'], '更新排序时间后应重排且旧索引行应删除');

  const rebuild = await service.rebuild([
    { id: 'court-d', updatedAt: '2026-05-15T10:00:00.000Z', createdAt: '2026-05-01T10:00:00.000Z' },
    { id: 'match-court-finance', updatedAt: '2026-05-16T10:00:00.000Z', createdAt: '2026-05-01T10:00:00.000Z' }
  ], { dryRun: false });
  assert.deepStrictEqual(
    { total: rebuild.total, indexed: rebuild.indexed, excluded: rebuild.excluded },
    { total: 2, indexed: 1, excluded: 1 },
    '回填应统计总数、入索引数和排除数'
  );
  page = await service.listPage({ limit: 5 });
  assert.deepStrictEqual(page.rows.map((row) => row.courtId), ['court-d'], '重建后应只保留最新回填结果');

  const pageDataSource = fs.readFileSync(pageDataHandlerPath, 'utf8');
  assert.match(pageDataSource, /\/page-data\/courts-default-sort-preview/, 'page-data 处理器应提供 courts 默认排序预览入口');
  assert.match(pageDataSource, /loadCourtSortPreviewPage/, 'page-data 处理器应委托独立排序读能力');

  const courtsMembershipSource = fs.readFileSync(courtsMembershipHandlerPath, 'utf8');
  assert.match(courtsMembershipSource, /syncCourtSortIndex/, 'courts 写链应同步排序索引');
  assert.match(courtsMembershipSource, /rebuildCourtSortIndex/, 'courts 模块应暴露回填入口');

  const membershipWriteSource = fs.readFileSync(membershipWriteHandlerPath, 'utf8');
  assert.match(membershipWriteSource, /syncCourtSortIndex/, '会员购买写回 court.history 后应同步排序索引');

  const indexSource = fs.readFileSync(indexPath, 'utf8');
  assert.match(indexSource, /ft_court_sort_index/, 'api/index.js 应注册 courts 默认排序辅助表');
  assert.match(indexSource, /listTableRowsDesc/, 'api/index.js 应提供按主键倒序分页扫描能力');

  console.log('court sort index tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
