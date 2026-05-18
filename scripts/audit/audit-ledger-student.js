const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-ledger-student' });

const studentName = process.argv[2];
if (!studentName) {
  console.error('Usage: node scripts/audit/audit-ledger-student.js <studentName>');
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

(async () => {
  const [students, entitlements, ledger, purchases] = await Promise.all([
    scan('ft_students'),
    scan('ft_entitlements'),
    scan('ft_entitlement_ledger'),
    scan('ft_purchases')
  ]);
  const student = students.find((s) => String(s.name || '').trim() === studentName.trim());
  if (!student) {
    console.error('student not found:', studentName);
    process.exit(2);
  }
  const studentEntitlements = entitlements.filter((e) => e.studentId === student.id);
  const entitlementIds = new Set(studentEntitlements.map((e) => e.id));
  const rows = ledger
    .filter((r) => r.studentId === student.id || entitlementIds.has(r.entitlementId))
    .sort((a, b) => String(a.relatedDate || a.createdAt || '').localeCompare(String(b.relatedDate || b.createdAt || '')));
  const studentPurchases = purchases.filter((p) => p.studentId === student.id);
  console.log(JSON.stringify({
    student,
    purchases: studentPurchases,
    entitlements: studentEntitlements,
    ledger: rows
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
