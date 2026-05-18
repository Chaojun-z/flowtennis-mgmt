const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-history-income-import' });

const BATCH_ID = 'income-import-mabao-2026-01-10-2026-04-16';

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

function inBatch(id) {
  return String(id || '').startsWith(`${BATCH_ID}:`);
}

(async () => {
  const [importRows, financialLedger, entitlements, entitlementLedger] = await Promise.all([
    scan('ft_income_import_rows', 5000),
    scan('ft_financial_ledger', 10000),
    scan('ft_entitlements', 5000),
    scan('ft_entitlement_ledger', 10000)
  ]);

  const batchRows = importRows.filter((row) => inBatch(row.id));
  const pendingRows = batchRows.filter((row) => row.importStatus === 'pending');
  const importedRows = batchRows.filter((row) => row.importStatus === 'imported');
  const skippedRows = batchRows.filter((row) => row.importStatus === 'skipped');

  const batchLedger = financialLedger.filter((row) => {
    const sourceId = String(row.sourceId || '');
    return sourceId.startsWith(BATCH_ID)
      || sourceId.startsWith('income-import-entitlement-ledger:')
      || String(row.id || '').startsWith('income-import-financial-ledger:');
  });

  let cash = 0;
  let recognized = 0;
  let deferred = 0;
  for (const row of batchLedger) {
    cash += num(row.cashDelta);
    recognized += num(row.recognizedRevenueDelta);
    deferred += num(row.deferredRevenueDelta);
  }

  const entitlementMap = new Map(entitlements.map((row) => [String(row.id), row]));
  const entitlementLedgerIds = new Set(entitlementLedger.map((row) => String(row.id)));
  const financialLedgerIds = new Set(batchLedger.map((row) => String(row.id)));
  const ledgerByEntitlement = new Map();
  for (const row of entitlementLedger) {
    if (!row.entitlementId) continue;
    const key = String(row.entitlementId);
    ledgerByEntitlement.set(key, (ledgerByEntitlement.get(key) || 0) + num(row.lessonDelta));
  }

  const entitlementMismatches = [];
  for (const row of entitlements) {
    const total = num(row.totalLessons);
    const used = num(row.usedLessons);
    const remaining = num(row.remainingLessons);
    const ledgerDelta = ledgerByEntitlement.get(String(row.id)) || 0;
    const expectedUsed = Math.max(0, -ledgerDelta);
    const expectedRemaining = Math.max(0, total - expectedUsed);
    if (used !== expectedUsed || remaining !== expectedRemaining) {
      entitlementMismatches.push({
        entitlementId: row.id,
        studentName: row.studentName,
        packageName: row.packageName,
        used,
        expectedUsed,
        remaining,
        expectedRemaining
      });
    }
  }

  const missingLedgerRefs = [];
  for (const row of importedRows) {
    const created = Array.isArray(row.createdLedgerIds) ? row.createdLedgerIds : [];
    const missing = created.filter((id) => {
      const key = String(id);
      return !financialLedgerIds.has(key) && !entitlementLedgerIds.has(key);
    });
    if (missing.length) {
      missingLedgerRefs.push({ rowNo: row.sourceRowNumber, missing });
    }
  }

  const campusSummary = {};
  for (const row of batchLedger) {
    const campus = String(row.campusName || row.campusId || '未标记');
    if (!campusSummary[campus]) campusSummary[campus] = { cash: 0, recognized: 0, deferred: 0, count: 0 };
    campusSummary[campus].cash += num(row.cashDelta);
    campusSummary[campus].recognized += num(row.recognizedRevenueDelta);
    campusSummary[campus].deferred += num(row.deferredRevenueDelta);
    campusSummary[campus].count += 1;
  }

  const report = {
    batchId: BATCH_ID,
    importRows: {
      total: batchRows.length,
      imported: importedRows.length,
      skipped: skippedRows.length,
      pending: pendingRows.length,
      pendingRowNumbers: pendingRows.map((row) => row.sourceRowNumber)
    },
    equationCheck: {
      cash,
      recognized,
      deferred,
      diff: cash - recognized - deferred,
      pass: cash === recognized + deferred
    },
    createdLedgerReferenceCheck: {
      missingCount: missingLedgerRefs.length,
      rows: missingLedgerRefs
    },
    entitlementBalanceCheck: {
      mismatchCount: entitlementMismatches.length,
      rows: entitlementMismatches.slice(0, 50)
    },
    campusSummary
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.equationCheck.pass || pendingRows.length || missingLedgerRefs.length || entitlementMismatches.length) {
    process.exitCode = 2;
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
