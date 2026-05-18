const path = require('path');
const TableStore = require('tablestore');
const { Pool } = require('pg');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-mabao-match-history' });

const MATCH_DATABASE_URL = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL;
if (!MATCH_DATABASE_URL) {
  throw new Error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL');
}

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

const pool = new Pool({
  connectionString: MATCH_DATABASE_URL,
  ssl: process.env.MATCH_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
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

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function containsMabao(...values) {
  const raw = values.filter(Boolean).join(' ');
  return /马坡|顺义马坡/.test(raw);
}

function normalizeHistoryRows(courts) {
  const rows = [];
  courts.forEach((court) => {
    (Array.isArray(court.history) ? court.history : []).forEach((historyRow) => {
      rows.push({
        courtId: court.id,
        courtName: court.name || '',
        courtCampus: court.campus || '',
        ...historyRow
      });
    });
  });
  return rows;
}

function sumBy(rows, predicate, field = 'amount') {
  return rows.filter(predicate).reduce((sum, row) => sum + money(row[field]), 0);
}

async function main() {
  const [courts, importRows, financialLedger, postsRes, splitsRes] = await Promise.all([
    scan('ft_courts', 10000),
    scan('ft_income_import_rows', 20000),
    scan('ft_financial_ledger', 20000),
    pool.query(`
      SELECT id,title,venuename,venueaddress,starttime,endtime,status,finalcourtfee,createdat,updatedat
      FROM match_posts
      WHERE COALESCE(venueName,'') LIKE '%马坡%'
         OR COALESCE(venueAddress,'') LIKE '%马坡%'
      ORDER BY startTime ASC
    `),
    pool.query(`
      SELECT
        s.id,
        s.matchId,
        s.userId,
        s.amount,
        s.paidAmount,
        s.payStatus,
        s.note,
        s.createdAt,
        s.updatedAt,
        p.title,
        p.venueName,
        p.venueAddress,
        p.startTime
      FROM match_fee_splits s
      JOIN match_posts p ON p.id = s.matchId
      WHERE COALESCE(p.venueName,'') LIKE '%马坡%'
         OR COALESCE(p.venueAddress,'') LIKE '%马坡%'
      ORDER BY p.startTime ASC, s.createdAt ASC
    `)
  ]);

  const allHistory = normalizeHistoryRows(courts);
  const matchFinanceHistory = allHistory.filter((row) => row.courtId === 'match-court-finance');
  const mabaoMatchHistory = matchFinanceHistory.filter((row) => containsMabao(row.venue, row.campus, row.note));
  const mabaoCourtRows = allHistory.filter((row) => containsMabao(row.courtCampus, row.campusName, row.campus, row.note));
  const mabaoStoredBookingRows = mabaoCourtRows.filter((row) => row.category === '订场' && String(row.payMethod || '').includes('储值'));
  const mabaoMatchStoredRows = mabaoCourtRows.filter((row) => row.sourceCategory === '约球订场' && String(row.payMethod || '').includes('储值'));

  const batchRows = importRows.filter((row) => String(row.batchId || '') === 'income-import-mabao-2026-01-10-2026-04-16');
  const bookingRows = batchRows.filter((row) => /约球局|定场/.test(String(row.rawIncomeType || '')));
  const matchOnlyRows = batchRows.filter((row) => /约球局/.test(String(row.rawIncomeType || '')));
  const storedValueBlockedRows = batchRows.filter((row) => String(row.reviewReason || '').includes('储值卡属于递延收入扣减'));
  const bookingParseTypeCounts = bookingRows.reduce((acc, row) => {
    const key = String(row.importMode || row.parseType || row.plannedTarget || 'unknown');
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const createdLedgerIds = new Set(
    bookingRows.flatMap((row) => Array.isArray(row.createdLedgerIds) ? row.createdLedgerIds.map((id) => String(id)) : [])
  );
  const linkedFinancialLedger = financialLedger.filter((row) => createdLedgerIds.has(String(row.id || '')));

  const splitRows = splitsRes.rows;
  const splitIds = new Set(splitRows.map((row) => String(row.id)));
  const financeRowsForSplits = mabaoMatchHistory.filter((row) => splitIds.has(String(row.matchFeeSplitId || '')));
  const matchedFinanceSplitIds = new Set(financeRowsForSplits.map((row) => String(row.matchFeeSplitId || '')));
  const missingPaidSplits = splitRows
    .filter((row) => String(row.paystatus || row.payStatus) === 'paid')
    .filter((row) => !matchedFinanceSplitIds.has(String(row.id)));

  const report = {
    mabaoMatches: {
      count: postsRes.rows.length,
      settledCount: postsRes.rows.filter((row) => row.status === 'settled').length,
      estimatedFinalCourtFee: postsRes.rows.reduce((sum, row) => sum + money(row.finalcourtfee), 0)
    },
    mabaoFeeSplits: {
      total: splitRows.length,
      paidCount: splitRows.filter((row) => String(row.paystatus || row.payStatus) === 'paid').length,
      refundedCount: splitRows.filter((row) => String(row.paystatus || row.payStatus) === 'refunded').length,
      pendingCount: splitRows.filter((row) => String(row.paystatus || row.payStatus) === 'pending').length,
      paidAmount: splitRows.filter((row) => String(row.paystatus || row.payStatus) === 'paid').reduce((sum, row) => sum + money(row.paidamount || row.paidAmount || row.amount), 0),
      refundedAmount: splitRows.filter((row) => String(row.paystatus || row.payStatus) === 'refunded').reduce((sum, row) => sum + money(row.paidamount || row.paidAmount || row.amount), 0)
    },
    matchCourtFinance: {
      totalHistoryCount: matchFinanceHistory.length,
      mabaoHistoryCount: mabaoMatchHistory.length,
      mabaoIncomeAmount: sumBy(mabaoMatchHistory, (row) => row.type === '消费'),
      mabaoRefundAmount: sumBy(mabaoMatchHistory, (row) => row.type === '退款'),
      mabaoNetAmount: sumBy(mabaoMatchHistory, (row) => row.type === '消费') - sumBy(mabaoMatchHistory, (row) => row.type === '退款'),
      linkedPaidSplitCount: financeRowsForSplits.filter((row) => row.type === '消费').length,
      linkedRefundSplitCount: financeRowsForSplits.filter((row) => row.type === '退款').length,
      missingPaidSplitCount: missingPaidSplits.length,
      missingPaidSplitExamples: missingPaidSplits.slice(0, 20).map((row) => ({
        splitId: row.id,
        matchId: row.matchid || row.matchId,
        title: row.title,
        venueName: row.venuename || row.venueName,
        amount: money(row.paidamount || row.paidAmount || row.amount)
      }))
    },
    mabaoImportedHistory: {
      bookingLikeRowCount: bookingRows.length,
      bookingLikeImportedCount: bookingRows.filter((row) => row.importStatus === 'imported').length,
      bookingLikePendingCount: bookingRows.filter((row) => row.importStatus === 'pending').length,
      bookingLikeSkippedCount: bookingRows.filter((row) => row.importStatus === 'skipped').length,
      bookingLikeActualAmount: bookingRows.reduce((sum, row) => sum + money(row.rawActualAmountText), 0),
      bookingLikePlannedCashAmount: bookingRows.reduce((sum, row) => sum + money(row.plannedLedgerPreview?.cashDelta) / 100, 0),
      bookingLikePlannedRecognizedAmount: bookingRows.reduce((sum, row) => sum + money(row.plannedLedgerPreview?.recognizedRevenueDelta) / 100, 0),
      matchOnlyRowCount: matchOnlyRows.length,
      matchOnlyImportedCount: matchOnlyRows.filter((row) => row.importStatus === 'imported').length,
      matchOnlyActualAmount: matchOnlyRows.reduce((sum, row) => sum + money(row.rawActualAmountText), 0),
      linkedFinancialLedgerCount: linkedFinancialLedger.length,
      linkedFinancialCashAmount: linkedFinancialLedger.reduce((sum, row) => sum + money(row.cashDelta) / 100, 0),
      linkedFinancialRecognizedAmount: linkedFinancialLedger.reduce((sum, row) => sum + money(row.recognizedRevenueDelta) / 100, 0)
      ,
      bookingParseTypeCounts
    },
    mabaoStoredValueBooking: {
      blockedImportRowCount: storedValueBlockedRows.length,
      blockedImportActualAmount: storedValueBlockedRows.reduce((sum, row) => sum + money(row.rawActualAmountText), 0),
      bookingRowsCount: mabaoStoredBookingRows.length,
      bookingConsumeAmount: sumBy(mabaoStoredBookingRows, (row) => row.type === '消费'),
      bookingRefundAmount: sumBy(mabaoStoredBookingRows, (row) => row.type === '退款' || row.type === '冲正'),
      linkedMembershipAccountCount: new Set(mabaoStoredBookingRows.map((row) => String(row.membershipAccountId || '')).filter(Boolean)).size,
      exampleRows: mabaoStoredBookingRows.slice(0, 20).map((row) => ({
        courtId: row.courtId,
        courtName: row.courtName,
        date: row.date,
        type: row.type,
        category: row.category,
        payMethod: row.payMethod,
        amount: money(row.amount),
        membershipAccountId: row.membershipAccountId || '',
        note: row.note || '',
        sourceCategory: row.sourceCategory || ''
      })),
      matchStoredRowsCount: mabaoMatchStoredRows.length
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end().catch(() => null);
  });
