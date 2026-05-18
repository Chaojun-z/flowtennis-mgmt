const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'inspect-mabao-ledger-by-court' });

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

const TARGETS = new Set([
  'eed2716c-c642-49ac-b00d-96e8b7c4e549',
  '29c46280-0a29-4f11-bf52-b4fa9d3568e9',
  'c840ae23-51e4-48f2-a9ef-5b7486f6a185'
]);

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

function scan(tableName, limit = 20000) {
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

async function main() {
  const rows = await scan('ft_financial_ledger', 30000);
  const grouped = {};
  rows.forEach((row) => {
    const userId = String(row.userId || '');
    if (!TARGETS.has(userId)) return;
    grouped[userId] = grouped[userId] || [];
    grouped[userId].push(row);
  });
  Object.keys(grouped).forEach((key) => {
    grouped[key] = grouped[key].sort((a, b) => String(a.businessDate || a.createdAt || '').localeCompare(String(b.businessDate || b.createdAt || '')));
  });
  console.log(JSON.stringify(grouped, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
