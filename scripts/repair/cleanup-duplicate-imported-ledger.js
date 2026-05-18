const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'cleanup-duplicate-imported-ledger' });

const dryRun = process.argv.includes('--dry-run');

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3
});

function decodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const obj = { id: row.primaryKey[0].value };
  (row.attributes || []).forEach((a) => {
    try {
      obj[a.columnName] = JSON.parse(a.columnValue);
    } catch {
      obj[a.columnName] = a.columnValue;
    }
  });
  return obj;
}

function scan(tableName) {
  return new Promise((resolve, reject) => {
    const rows = [];
    function next(startKey) {
      client.getRange({
        tableName,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: startKey || [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500
      }, (err, data) => {
        if (err) return reject(err);
        (data.rows || []).forEach((row) => {
          const decoded = decodeRow(row);
          if (decoded) rows.push(decoded);
        });
        if (data.nextStartPrimaryKey) return next(data.nextStartPrimaryKey);
        resolve(rows);
      });
    }
    next();
  });
}

function del(tableName, id) {
  return new Promise((resolve, reject) => {
    client.deleteRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}
async function delWithRetry(tableName, id, maxAttempts = 4) {
  let lastErr;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await del(tableName, id);
      return true;
    } catch (err) {
      lastErr = err;
      if (attempt === maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 400));
    }
  }
  throw lastErr;
}

function importedLedgerMonthKey(row) {
  const sourceMonth = String(row?.sourceMonth || '').trim();
  if (sourceMonth) return sourceMonth;
  if (row?.scheduleId || Number(row?.lessonDelta) >= 0) return '';
  const reason = String(row?.reason || '').trim();
  const match = reason.match(/^历史导入\s*(\d{1,2})月消课$/);
  if (!match) return '';
  const year = String(row?.relatedDate || row?.createdAt || '').slice(0, 4);
  if (!/^\d{4}$/.test(year)) return '';
  return `${year}-${String(match[1]).padStart(2, '0')}`;
}

function duplicateGroupKey(row) {
  const monthKey = importedLedgerMonthKey(row);
  if (!monthKey) return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.reason || '',
    monthKey
  ].join('|');
}

function isCurrentImportedLedgerRow(row) {
  return !!(
    importedLedgerMonthKey(row) &&
    String(row?.sourceMonth || '').trim() &&
    String(row?.seedTag || '').startsWith('mabao-finance-seed-') &&
    String(row?.studentId || '').trim()
  );
}

function exactDuplicateKey(row) {
  const monthKey = importedLedgerMonthKey(row);
  if (!monthKey) return '';
  return [
    row.entitlementId,
    row.purchaseId,
    row.studentId,
    Number(row.lessonDelta) || 0,
    row.action || '',
    row.reason || '',
    monthKey,
    row.sourceSheet || '',
    row.notes || ''
  ].join('|');
}

function score(row) {
  return [
    String(row?.sourceMonth || '').trim() ? 1 : 0,
    String(row?.seedTag || '').startsWith('mabao-finance-seed-') ? 1 : 0,
    String(row?.studentId || '').trim() ? 1 : 0,
    String(row?.notes || '').trim() ? 1 : 0,
    String(row?.relatedDate || ''),
    String(row?.createdAt || '')
  ];
}

function compareScore(a, b) {
  const sa = score(a);
  const sb = score(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] === sb[i]) continue;
    return sa[i] > sb[i] ? 1 : -1;
  }
  return 0;
}

function findDuplicateRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = duplicateGroupKey(row);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(row);
    groups.set(key, list);
  }
  const duplicates = [];
  for (const [key, list] of groups.entries()) {
    if (list.length <= 1) continue;
    const currentRows = list.filter(isCurrentImportedLedgerRow);
    const candidates = currentRows.length ? currentRows : list;
    const keepIds = new Set(candidates.map((row) => row.id));
    const remove = list.filter((row) => !keepIds.has(row.id));
    const exactKeepers = new Map();
    candidates.forEach((row) => {
      const exactKey = exactDuplicateKey(row) || duplicateGroupKey(row);
      const current = exactKeepers.get(exactKey);
      if (!current) {
        exactKeepers.set(exactKey, row);
        return;
      }
      if (compareScore(row, current) > 0) {
        remove.push(current);
        exactKeepers.set(exactKey, row);
        return;
      }
      remove.push(row);
    });
    if (!remove.length) continue;
    const keep = [...exactKeepers.values()].sort((a, b) => compareScore(b, a))[0] || candidates[0];
    duplicates.push({ key, keep, remove });
  }
  return duplicates;
}

(async () => {
  const [ledger, students] = await Promise.all([
    scan('ft_entitlement_ledger'),
    scan('ft_students')
  ]);
  const studentMap = new Map(students.map((s) => [s.id, s.name || '']));
  const duplicates = findDuplicateRows(ledger);
  const removeRows = duplicates.flatMap((group) => group.remove);

  console.log(JSON.stringify({
    dryRun,
    duplicateGroupCount: duplicates.length,
    removeCount: removeRows.length,
    preview: duplicates.slice(0, 20).map((group) => ({
      key: group.key,
      keep: {
        id: group.keep.id,
        studentName: studentMap.get(group.keep.studentId) || '',
        relatedDate: group.keep.relatedDate || '',
        sourceMonth: group.keep.sourceMonth || '',
        reason: group.keep.reason || '',
        lessonDelta: group.keep.lessonDelta
      },
      remove: group.remove.map((row) => ({
        id: row.id,
        studentName: studentMap.get(row.studentId) || '',
        relatedDate: row.relatedDate || '',
        sourceMonth: row.sourceMonth || '',
        reason: row.reason || '',
        lessonDelta: row.lessonDelta
      }))
    }))
  }, null, 2));

  if (dryRun) return;

  const removedIds = [];
  const failed = [];
  for (const row of removeRows) {
    try {
      await delWithRetry('ft_entitlement_ledger', row.id);
      removedIds.push(row.id);
    } catch (err) {
      failed.push({ id: row.id, error: String(err?.message || err) });
    }
  }
  console.log(JSON.stringify({ success: failed.length === 0, removedIds, failed }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
