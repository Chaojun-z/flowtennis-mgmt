const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'repair-entitlement-balances-from-ledger' });

const WRITE = process.argv.includes('--write');

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

function decodeRow(row) {
  if (!row || !row.primaryKey || !row.primaryKey[0]) return null;
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

function scan(tableName, limit = 10000) {
  return new Promise((resolve, reject) => {
    const rows = [];
    let lastSeenId = null;
    function next() {
      client.getRange({
        tableName,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: lastSeenId ? [{ id: lastSeenId }] : [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500
      }, (err, data) => {
        if (err) return reject(err);
        let appended = 0;
        (data.rows || []).forEach((row) => {
          const decoded = decodeRow(row);
          if (!decoded) return;
          if (lastSeenId && String(decoded.id) === String(lastSeenId)) return;
          rows.push(decoded);
          appended += 1;
          lastSeenId = decoded.id;
        });
        if (appended > 0 && rows.length < limit) return next();
        resolve(rows);
      });
    }
    next();
  });
}

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function putRow(tableName, id, attrs) {
  return new Promise((resolve, reject) => {
    client.putRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

(async () => {
  const [entitlements, entitlementLedger] = await Promise.all([
    scan('ft_entitlements', 5000),
    scan('ft_entitlement_ledger', 10000)
  ]);

  const ledgerByEntitlement = new Map();
  for (const row of entitlementLedger) {
    if (!row.entitlementId) continue;
    const key = String(row.entitlementId);
    ledgerByEntitlement.set(key, (ledgerByEntitlement.get(key) || 0) + num(row.lessonDelta));
  }

  const updates = [];
  for (const row of entitlements) {
    const total = num(row.totalLessons);
    const expectedUsed = Math.max(0, -(ledgerByEntitlement.get(String(row.id)) || 0));
    const expectedRemaining = Math.max(0, total - expectedUsed);
    const used = num(row.usedLessons);
    const remaining = num(row.remainingLessons);
    if (used !== expectedUsed || remaining !== expectedRemaining) {
      updates.push({
        ...row,
        usedLessons: expectedUsed,
        remainingLessons: expectedRemaining,
        updatedAt: new Date().toISOString()
      });
    }
  }

  if (WRITE) {
    for (const row of updates) {
      await putRow('ft_entitlements', row.id, row);
    }
  }

  console.log(JSON.stringify({
    dryRun: !WRITE,
    updateCount: updates.length,
    rows: updates.map((row) => ({
      entitlementId: row.id,
      studentName: row.studentName,
      packageName: row.packageName,
      usedLessons: row.usedLessons,
      remainingLessons: row.remainingLessons
    }))
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
