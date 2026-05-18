const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'inspect-purchase-entitlement-by-id' });

const purchaseId = process.argv[2];
if (!purchaseId) {
  console.error('Usage: node scripts/inspect/inspect-purchase-entitlement-by-id.js <purchaseId>');
  process.exit(1);
}

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
  (row.attributes || []).forEach((attr) => {
    try {
      obj[attr.columnName] = JSON.parse(attr.columnValue);
    } catch {
      obj[attr.columnName] = attr.columnValue;
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

(async () => {
  const purchases = await scan('ft_purchases');
  const purchase = purchases.find((row) => row.id === purchaseId) || null;
  const entitlements = (await scan('ft_entitlements')).filter((row) => row.purchaseId === purchaseId);
  const students = purchase?.studentId ? await scan('ft_students') : [];
  const student = purchase?.studentId ? students.find((row) => row.id === purchase.studentId) || null : null;
  console.log(JSON.stringify({
    purchase,
    student,
    entitlements
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
