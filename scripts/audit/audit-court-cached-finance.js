const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-court-cached-finance' });

const repairScript = require('../repair/backfill-court-cached-finance.js');

const T_COURTS = 'ft_courts';
const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';
const REPORT_DIR = path.join(__dirname, '..', '..', 'docs', 'reports');

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseArgs(argv) {
  const args = {
    includeMatchFinance: false,
    sampleSize: 10,
    sampleIds: []
  };
  for (const raw of argv) {
    if (raw === '--include-match-finance') {
      args.includeMatchFinance = true;
      continue;
    }
    if (raw.startsWith('--sample-size=')) {
      const count = parseInt(raw.slice('--sample-size='.length), 10);
      args.sampleSize = Number.isFinite(count) && count > 0 ? count : 10;
      continue;
    }
    if (raw.startsWith('--ids=')) {
      args.sampleIds = raw.slice('--ids='.length).split(',').map((item) => String(item || '').trim()).filter(Boolean);
    }
  }
  return args;
}

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

function createClient() {
  return new TableStore.Client({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: process.env.TS_ENDPOINT,
    instancename: process.env.TS_INSTANCE || 'flowtennis',
    maxRetries: 3,
    httpOptions: { timeout: 12000, maxSockets: 5 }
  });
}

function scanTable(client, tableName, limit = 30000) {
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
function getRow(client, tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  });
}

function pickSampleCourts(rows, options = {}) {
  let list = Array.isArray(rows) ? [...rows] : [];
  if (!options.includeMatchFinance) {
    list = list.filter((row) => String(row.id || '') !== MATCH_COURT_FINANCE_ACCOUNT_ID);
  }
  if (Array.isArray(options.sampleIds) && options.sampleIds.length) {
    const ids = new Set(options.sampleIds.map((id) => String(id)));
    list = list.filter((row) => ids.has(String(row.id || '')));
  }
  list.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  const sampleSize = Number.isFinite(options.sampleSize) && options.sampleSize > 0 ? options.sampleSize : 10;
  return list.slice(0, sampleSize);
}

function legacyFields(court) {
  return {
    balance: money(court?.balance),
    totalDeposit: money(court?.totalDeposit),
    spentAmount: money(court?.spentAmount),
    receivedAmount: money(court?.receivedAmount)
  };
}

function cachedFields(court) {
  return repairScript.buildBackfillPreviewRow(court).after;
}

function buildAuditRow(court) {
  const historyComputed = repairScript.computeCachedCourtFinance(court);
  const legacy = legacyFields(court);
  const cached = {
    cachedBalance: money(court?.cachedBalance),
    cachedTotalDeposit: money(court?.cachedTotalDeposit),
    cachedTotalSpent: money(court?.cachedTotalSpent),
    cachedTotalReceived: money(court?.cachedTotalReceived)
  };
  return {
    id: court.id,
    name: court.name || '',
    status: court.status || 'active',
    historyCount: Array.isArray(court.history) ? court.history.length : 0,
    historyComputed,
    legacyFields: legacy,
    cachedFields: cached,
    matches: {
      cachedBalance: money(historyComputed.cachedBalance) === money(cached.cachedBalance),
      cachedTotalDeposit: money(historyComputed.cachedTotalDeposit) === money(cached.cachedTotalDeposit),
      cachedTotalSpent: money(historyComputed.cachedTotalSpent) === money(cached.cachedTotalSpent),
      cachedTotalReceived: money(historyComputed.cachedTotalReceived) === money(cached.cachedTotalReceived),
      legacyBalance: money(historyComputed.cachedBalance) === money(legacy.balance),
      legacyTotalDeposit: money(historyComputed.cachedTotalDeposit) === money(legacy.totalDeposit),
      legacyTotalSpent: money(historyComputed.cachedTotalSpent) === money(legacy.spentAmount),
      legacyTotalReceived: money(historyComputed.cachedTotalReceived) === money(legacy.receivedAmount)
    }
  };
}

async function runAudit(options = {}) {
  const client = createClient();
  const allRows = Array.isArray(options.sampleIds) && options.sampleIds.length
    ? (await Promise.all(options.sampleIds.map((id) => getRow(client, T_COURTS, id).catch(() => null)))).filter(Boolean)
    : await scanTable(client, T_COURTS, 30000);
  const sampleRows = pickSampleCourts(allRows, options);
  const rows = sampleRows.map(buildAuditRow);
  const report = {
    sampledAt: new Date().toISOString(),
    sampleSize: rows.length,
    includeMatchFinance: options.includeMatchFinance === true,
    sampleIds: options.sampleIds || [],
    rows
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_DIR, 'court-cached-finance-audit-sample.json');
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return { report, outputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, outputPath } = await runAudit(args);
  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  buildAuditRow,
  cachedFields,
  getRow,
  legacyFields,
  parseArgs,
  pickSampleCourts,
  runAudit
};
