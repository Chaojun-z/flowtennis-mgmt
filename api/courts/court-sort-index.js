const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';

function normalizePositiveInt(value, fallback = DEFAULT_LIMIT) {
  const next = parseInt(value, 10);
  if (!Number.isFinite(next) || next <= 0) return fallback;
  return Math.min(next, MAX_LIMIT);
}

function normalizeSortTimestamp(court = {}) {
  const updatedAt = String(court.updatedAt || '').trim();
  if (updatedAt) return updatedAt;
  const createdAt = String(court.createdAt || '').trim();
  if (createdAt) return createdAt;
  return '0000-00-00T00:00:00.000Z';
}

function isCourtSortableRecord(court = {}) {
  const id = String(court.id || '').trim();
  const status = String(court.status || '').trim();
  if (!id) return false;
  if (id === MATCH_COURT_FINANCE_ACCOUNT_ID) return false;
  if (status === 'inactive' || status === 'deleted') return false;
  if (court.deletedAt || court.mergedIntoCourtId) return false;
  return true;
}

function buildCourtSortIndexRow(court = {}) {
  if (!isCourtSortableRecord(court)) return null;
  const courtId = String(court.id || '').trim();
  const sortAt = normalizeSortTimestamp(court);
  return {
    id: `${sortAt}#${courtId}`,
    courtId,
    sortAt,
    updatedAt: String(court.updatedAt || '').trim(),
    createdAt: String(court.createdAt || '').trim()
  };
}

function createCourtSortIndexService(deps = {}) {
  const {
    tableName,
    listPageDesc,
    put,
    del,
    scanAll = async () => []
  } = deps;

  if (!tableName) throw new Error('缺少排序索引表名');
  if (typeof listPageDesc !== 'function') throw new Error('缺少排序索引分页读取能力');
  if (typeof put !== 'function') throw new Error('缺少排序索引写入能力');
  if (typeof del !== 'function') throw new Error('缺少排序索引删除能力');

  async function removeCourt(court = {}) {
    const row = buildCourtSortIndexRow(court);
    if (!row) return { removed: false };
    await del(tableName, row.id);
    return { removed: true, rowId: row.id };
  }

  async function syncCourt(nextCourt = {}, prevCourt = null) {
    const nextRow = buildCourtSortIndexRow(nextCourt);
    const prevRow = buildCourtSortIndexRow(prevCourt || {});
    if (prevRow && (!nextRow || prevRow.id !== nextRow.id)) await del(tableName, prevRow.id);
    if (!nextRow) return { indexed: false, row: null };
    await put(tableName, nextRow.id, nextRow);
    return { indexed: true, row: nextRow };
  }

  async function listPage(input = {}) {
    const limit = normalizePositiveInt(input.limit, DEFAULT_LIMIT);
    const cursor = String(input.cursor || '').trim();
    return listPageDesc(tableName, { limit, cursor });
  }

  async function rebuild(courts = [], options = {}) {
    const dryRun = options.dryRun !== false;
    const rows = Array.isArray(courts) ? courts : [];
    const nextRows = [];
    let excluded = 0;
    rows.forEach((court) => {
      const row = buildCourtSortIndexRow(court);
      if (row) nextRows.push(row);
      else excluded += 1;
    });
    nextRows.sort((a, b) => String(b.id).localeCompare(String(a.id)));
    if (!dryRun) {
      const existing = await scanAll(tableName).catch(() => []);
      for (const row of existing) await del(tableName, row.id);
      for (const row of nextRows) await put(tableName, row.id, row);
    }
    return {
      dryRun,
      total: rows.length,
      indexed: nextRows.length,
      excluded,
      preview: nextRows.slice(0, normalizePositiveInt(options.previewLimit, DEFAULT_LIMIT))
    };
  }

  return {
    listPage,
    syncCourt,
    removeCourt,
    rebuild
  };
}

module.exports = {
  MATCH_COURT_FINANCE_ACCOUNT_ID,
  buildCourtSortIndexRow,
  createCourtSortIndexService,
  isCourtSortableRecord,
  normalizeSortTimestamp,
  normalizePositiveInt
};
