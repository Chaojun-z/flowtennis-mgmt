const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'find-students-by-keyword' });

const keyword = String(process.argv[2] || '').trim();
if (!keyword) {
  console.error('Usage: node scripts/inspect/find-students-by-keyword.js <keyword>');
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
  const rows = await scan('ft_students');
  const matched = rows.filter((row) => String(row.name || '').includes(keyword));
  console.log(JSON.stringify(matched, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
