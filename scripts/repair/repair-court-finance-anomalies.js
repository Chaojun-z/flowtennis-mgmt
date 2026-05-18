const path = require('path');
const fs = require('fs');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'repair-court-finance-anomalies' });

const api = require('../../api/index.js');

const WRITE = process.argv.includes('--write');
const DETAIL_PATH = path.join(__dirname, '..', '..', 'docs', 'reports', 'court-finance-anomaly-details.json');
const REPORT_DIR = path.join(__dirname, '..', '..', 'docs', 'reports');
const T_COURTS = 'ft_courts';

const { normalizeCourtRecord } = api._test;

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

function getRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }] }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  });
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

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function pickFinance(record) {
  return {
    balance: money(record.balance),
    totalDeposit: money(record.totalDeposit),
    spentAmount: money(record.spentAmount),
    receivedAmount: money(record.receivedAmount),
    storedValueSpent: money(record.storedValueSpent),
    directPaidSpent: money(record.directPaidSpent),
    historyCount: Array.isArray(record.history) ? record.history.length : 0
  };
}

async function main() {
  if (!fs.existsSync(DETAIL_PATH)) {
    throw new Error(`找不到异常明细文件：${DETAIL_PATH}`);
  }
  const anomalies = JSON.parse(fs.readFileSync(DETAIL_PATH, 'utf8'));
  const targetIds = [...new Set(anomalies.map((row) => String(row.id || '')).filter(Boolean))];
  const beforeRows = [];
  const repairedRows = [];
  const failedRows = [];
  const now = new Date().toISOString();

  for (const id of targetIds) {
    try {
      const current = await getRow(T_COURTS, id);
      if (!current) {
        failedRows.push({ id, error: '账户不存在' });
        continue;
      }
      const normalized = normalizeCourtRecord({ ...current, updatedAt: now });
      beforeRows.push({
        id,
        name: current.name || '',
        phone: current.phone || '',
        campus: current.campus || '',
        before: pickFinance(current),
        after: pickFinance(normalized),
        issueTypes: (anomalies.find((row) => String(row.id) === id)?.issues || []).map((item) => item.type)
      });
      if (WRITE) {
        await putRow(T_COURTS, id, normalized);
      }
      repairedRows.push({
        id,
        name: current.name || '',
        before: pickFinance(current),
        after: pickFinance(normalized)
      });
    } catch (error) {
      failedRows.push({ id, error: error.message });
    }
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const beforePath = path.join(REPORT_DIR, 'court-finance-repair-before.json');
  const resultPath = path.join(REPORT_DIR, 'court-finance-repair-result.json');
  fs.writeFileSync(beforePath, JSON.stringify(beforeRows, null, 2));
  fs.writeFileSync(resultPath, JSON.stringify({
    dryRun: !WRITE,
    targetCount: targetIds.length,
    repairedCount: repairedRows.length,
    failedCount: failedRows.length,
    failedRows,
    rows: repairedRows
  }, null, 2));

  console.log(JSON.stringify({
    dryRun: !WRITE,
    targetCount: targetIds.length,
    repairedCount: repairedRows.length,
    failedCount: failedRows.length,
    failedRows,
    beforePath,
    resultPath
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
