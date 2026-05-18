const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'backfill-court-cached-finance' });

const api = require('../../api/index.js');

const { computeCourtFinance } = api._test;

const T_COURTS = 'ft_courts';
const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';
const REPORT_DIR = path.join(__dirname, '..', '..', 'docs', 'reports');
const NETWORK_RETRY_LIMIT = 3;
const DEFAULT_SCAN_LIMIT = 30000;
const DEFAULT_PREVIEW_ROW_LIMIT = 50;

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function parseArgs(argv) {
  const args = {
    write: false,
    includeMatchFinance: false,
    sampleIds: [],
    limit: 0,
    batchSize: 0,
    startAfter: '',
    reportTag: '',
    previewRowLimit: DEFAULT_PREVIEW_ROW_LIMIT
  };
  for (const raw of argv) {
    if (raw === '--write') {
      args.write = true;
      continue;
    }
    if (raw === '--include-match-finance') {
      args.includeMatchFinance = true;
      continue;
    }
    if (raw.startsWith('--ids=')) {
      args.sampleIds = raw.slice('--ids='.length).split(',').map((item) => String(item || '').trim()).filter(Boolean);
      continue;
    }
    if (raw.startsWith('--limit=')) {
      const limit = parseInt(raw.slice('--limit='.length), 10);
      args.limit = Number.isFinite(limit) && limit > 0 ? limit : 0;
      continue;
    }
    if (raw.startsWith('--batch-size=')) {
      const batchSize = parseInt(raw.slice('--batch-size='.length), 10);
      args.batchSize = Number.isFinite(batchSize) && batchSize > 0 ? batchSize : 0;
      continue;
    }
    if (raw.startsWith('--start-after=')) {
      args.startAfter = String(raw.slice('--start-after='.length) || '').trim();
      continue;
    }
    if (raw.startsWith('--report-tag=')) {
      args.reportTag = String(raw.slice('--report-tag='.length) || '').trim();
      continue;
    }
    if (raw.startsWith('--preview-row-limit=')) {
      const previewRowLimit = parseInt(raw.slice('--preview-row-limit='.length), 10);
      args.previewRowLimit = Number.isFinite(previewRowLimit) && previewRowLimit > 0 ? previewRowLimit : DEFAULT_PREVIEW_ROW_LIMIT;
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

function isTransientNetworkError(error) {
  const text = String(error?.message || error || '');
  return /Client network socket disconnected before secure TLS connection was established|ECONNRESET|ETIMEDOUT|socket hang up|EAI_AGAIN/i.test(text);
}

async function withNetworkRetry(fn, maxAttempts = NETWORK_RETRY_LIMIT) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
}

function scanTable(client, tableName, limit = DEFAULT_SCAN_LIMIT, startAfter = '') {
  return withNetworkRetry(() => new Promise((resolve, reject) => {
    const rows = [];
    let lastSeenId = startAfter || null;
    let hasMore = false;
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
          if (rows.length >= limit) {
            hasMore = true;
            return;
          }
        });
        if (hasMore) return resolve({ rows: rows.slice(0, limit), lastSeenId, hasMore: true });
        if (appended > 0 && rows.length < limit && data.nextStartPrimaryKey) return next();
        resolve({ rows, lastSeenId, hasMore: false });
      });
    }
    next();
  }));
}
function getRow(client, tableName, id) {
  return withNetworkRetry(() => new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  }));
}

function putRow(client, tableName, record) {
  return withNetworkRetry(() => new Promise((resolve, reject) => {
    client.putRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(record.id) }],
      attributeColumns: Object.entries(record)
        .filter(([key, value]) => key !== 'id' && value !== undefined)
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  }));
}

function computeCachedCourtFinance(court) {
  const finance = computeCourtFinance(court || { history: [] });
  return {
    cachedBalance: money(finance.balance),
    cachedTotalDeposit: money(finance.totalDeposit),
    cachedTotalSpent: money(finance.spentAmount),
    cachedTotalReceived: money(finance.receivedAmount)
  };
}

function pickCachedFields(court) {
  return {
    cachedBalance: money(court?.cachedBalance),
    cachedTotalDeposit: money(court?.cachedTotalDeposit),
    cachedTotalSpent: money(court?.cachedTotalSpent),
    cachedTotalReceived: money(court?.cachedTotalReceived)
  };
}

function buildBackfillPreviewRow(court) {
  const before = pickCachedFields(court);
  const after = computeCachedCourtFinance(court);
  const changed = Object.keys(after).some((key) => before[key] !== after[key]);
  return {
    id: court.id,
    name: court.name || '',
    status: court.status || 'active',
    historyCount: Array.isArray(court.history) ? court.history.length : 0,
    before,
    after,
    changed
  };
}

function buildReportFileName({ write = false, reportTag = '' } = {}) {
  const baseName = write ? 'court-cached-finance-backfill-result' : 'court-cached-finance-backfill-preview';
  const safeTag = String(reportTag || '').trim().replace(/[^a-zA-Z0-9._-]+/g, '-');
  return safeTag ? `${baseName}-${safeTag}.json` : `${baseName}.json`;
}

function filterTargetCourts(rows, options = {}) {
  let result = Array.isArray(rows) ? [...rows] : [];
  if (!options.includeMatchFinance) {
    result = result.filter((row) => String(row.id || '') !== MATCH_COURT_FINANCE_ACCOUNT_ID);
  }
  if (Array.isArray(options.sampleIds) && options.sampleIds.length) {
    const ids = new Set(options.sampleIds.map((id) => String(id)));
    result = result.filter((row) => ids.has(String(row.id || '')));
  }
  result.sort((a, b) => String(a.id || '').localeCompare(String(b.id || '')));
  if (options.limit > 0) result = result.slice(0, options.limit);
  return result;
}

async function runBackfill(options = {}) {
  const client = createClient();
  const scanResult = Array.isArray(options.sampleIds) && options.sampleIds.length
    ? (await Promise.all(options.sampleIds.map((id) => getRow(client, T_COURTS, id).catch(() => null)))).filter(Boolean)
    : await scanTable(
      client,
      T_COURTS,
      options.batchSize > 0 ? options.batchSize : (options.limit > 0 ? options.limit : DEFAULT_SCAN_LIMIT),
      options.startAfter || ''
    );
  const rawRows = Array.isArray(scanResult) ? scanResult : (scanResult.rows || []);
  const targetRows = filterTargetCourts(rawRows, options);
  const previewRows = [];
  let changedCount = 0;
  let writtenCount = 0;
  let failedCount = 0;
  const failedRows = [];
  for (const court of targetRows) {
    const preview = buildBackfillPreviewRow(court);
    if (previewRows.length < (options.previewRowLimit || DEFAULT_PREVIEW_ROW_LIMIT)) previewRows.push(preview);
    if (!preview.changed) continue;
    changedCount += 1;
    if (options.write) {
      try {
        await putRow(client, T_COURTS, {
          ...court,
          ...preview.after,
          updatedAt: new Date().toISOString()
        });
        writtenCount += 1;
      } catch (error) {
        failedCount += 1;
        failedRows.push({ id: court.id, name: court.name || '', error: String(error?.message || error || '') });
      }
    }
  }
  const hasMore = Array.isArray(scanResult) ? false : scanResult.hasMore === true;
  const nextStartAfter = hasMore && targetRows.length ? String(targetRows[targetRows.length - 1]?.id || '') : (hasMore ? String(scanResult.lastSeenId || '') : '');
  const report = {
    dryRun: !options.write,
    includeMatchFinance: options.includeMatchFinance === true,
    sampleIds: options.sampleIds || [],
    limit: options.limit || 0,
    batchSize: options.batchSize || 0,
    startAfter: options.startAfter || '',
    nextStartAfter,
    hasMore,
    scannedCount: targetRows.length,
    changedCount,
    writtenCount,
    unchangedCount: targetRows.length - changedCount,
    failedCount,
    failedRows,
    rows: previewRows
  };
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const outputPath = path.join(REPORT_DIR, buildReportFileName({ write: options.write, reportTag: options.reportTag }));
  fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
  return { report, outputPath };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const { report, outputPath } = await runBackfill(args);
  console.log(JSON.stringify({ ...report, outputPath }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  computeCachedCourtFinance,
  buildBackfillPreviewRow,
  filterTargetCourts,
  getRow,
  isTransientNetworkError,
  parseArgs,
  buildReportFileName,
  runBackfill
};
