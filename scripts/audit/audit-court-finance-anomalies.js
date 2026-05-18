const path = require('path');
const fs = require('fs');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-court-finance-anomalies' });

const api = require('../../api/index.js');

const {
  computeCourtFinance,
  normalizeCourtRecord,
  legacyCourtFinanceWarnings
} = api._test;

const T_COURTS = 'ft_courts';
const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';

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

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function diff(a, b) {
  return money(money(a) - money(b));
}

function nonZero(value) {
  return Math.abs(Number(value) || 0) >= 0.01;
}

function sumHistoryBonus(history = []) {
  return money((Array.isArray(history) ? history : []).reduce((sum, row) => {
    return sum + (Number(row?.bonusAmount) || 0);
  }, 0));
}

function buildLegacyWarnings(court) {
  const history = Array.isArray(court?.history) ? court.history : [];
  const total = money(court?.totalDeposit);
  const balance = money(court?.balance);
  const spent = money(court?.spentAmount);
  const bonus = sumHistoryBonus(history);
  const effectiveDeposit = money(total + bonus);
  const warnings = [];
  if (balance > effectiveDeposit) {
    warnings.push({
      type: 'legacy_balance_gt_effective_deposit',
      message: '余额大于累计充值+赠送金额',
      detail: { totalDeposit: total, totalBonus: bonus, effectiveDeposit, balance }
    });
  }
  if (effectiveDeposit - balance > spent) {
    warnings.push({
      type: 'legacy_balance_drop_gt_spent',
      message: '余额减少金额大于累计消费（已计入赠送金额）',
      detail: { totalDeposit: total, totalBonus: bonus, effectiveDeposit, balance, spentAmount: spent }
    });
  }
  return warnings;
}

function addType(map, type) {
  map[type] = (map[type] || 0) + 1;
}

function pushIssue(target, type, message, detail = {}) {
  target.push({ type, message, ...detail });
}

async function main() {
  const allRows = await scan(T_COURTS, 30000);
  const courts = allRows.filter((row) => String(row.id || '') !== MATCH_COURT_FINANCE_ACCOUNT_ID);
  const activeCourts = courts.filter((row) => String(row.status || 'active') !== 'inactive');
  const issuesByCourt = [];
  const typeCount = {};

  for (const court of courts) {
    const issues = [];
    const legacyWarnings = buildLegacyWarnings(court);
    legacyWarnings.forEach((warning) => {
      pushIssue(issues, warning.type, warning.message, warning.detail || {});
    });

    const history = Array.isArray(court.history) ? court.history : [];
    const hasLegacyNumbers = [court.balance, court.totalDeposit, court.spentAmount, court.receivedAmount].some((value) => nonZero(value));
    if (!history.length && hasLegacyNumbers) {
      pushIssue(issues, 'legacy_no_history', '存在财务数字但没有显式账史');
    }

    let recomputed = null;
    let normalized = null;
    try {
      normalized = normalizeCourtRecord(court);
      recomputed = computeCourtFinance(normalized);
    } catch (error) {
      pushIssue(issues, 'history_compute_error', error.message);
    }

    if (recomputed) {
      const deltas = {
        balance: diff(court.balance, recomputed.balance),
        totalDeposit: diff(court.totalDeposit, recomputed.totalDeposit),
        spentAmount: diff(court.spentAmount, recomputed.spentAmount),
        receivedAmount: diff(court.receivedAmount, recomputed.receivedAmount),
        storedValueSpent: diff(court.storedValueSpent, recomputed.storedValueSpent),
        directPaidSpent: diff(court.directPaidSpent, recomputed.directPaidSpent)
      };
      if (Object.values(deltas).some(nonZero)) {
        pushIssue(issues, 'stored_vs_recomputed_mismatch', '当前字段和按账史重算结果不一致', deltas);
      }
      if (recomputed.storedValueSpent > 0 && recomputed.totalDeposit <= 0) {
        pushIssue(issues, 'stored_value_spent_without_deposit', '有储值扣款，但没有储值来源', {
          storedValueSpent: recomputed.storedValueSpent,
          totalDeposit: recomputed.totalDeposit
        });
      }
      if (recomputed.balance < 0 || recomputed.receivedAmount < 0 || recomputed.spentAmount < 0) {
        pushIssue(issues, 'negative_finance_total', '重算后出现负数财务结果', recomputed);
      }
    }

    if (issues.length) {
      issues.forEach((issue) => addType(typeCount, issue.type));
      issuesByCourt.push({
        id: court.id,
        name: court.name || '',
        phone: court.phone || '',
        campus: court.campus || '',
        status: court.status || 'active',
        balance: money(court.balance),
        totalDeposit: money(court.totalDeposit),
        spentAmount: money(court.spentAmount),
        receivedAmount: money(court.receivedAmount),
        issueCount: issues.length,
        issues
      });
    }
  }

  const summary = {
    scannedAt: new Date().toISOString(),
    totalCourts: courts.length,
    activeCourts: activeCourts.length,
    inactiveCourts: courts.length - activeCourts.length,
    anomalyCourts: issuesByCourt.length,
    normalCourts: courts.length - issuesByCourt.length,
    anomalyRate: courts.length ? Math.round((issuesByCourt.length / courts.length) * 10000) / 100 : 0,
    issueTypeCount: Object.fromEntries(Object.entries(typeCount).sort((a, b) => b[1] - a[1])),
    topExamples: issuesByCourt
      .sort((a, b) => b.issueCount - a.issueCount)
      .slice(0, 20)
      .map((row) => ({
        id: row.id,
        name: row.name,
        phone: row.phone,
        campus: row.campus,
        issueCount: row.issueCount,
        issueTypes: row.issues.map((item) => item.type)
      }))
  };

  const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const jsonPath = path.join(reportDir, 'court-finance-anomaly-summary.json');
  const detailPath = path.join(reportDir, 'court-finance-anomaly-details.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 2));
  fs.writeFileSync(detailPath, JSON.stringify(issuesByCourt, null, 2));

  console.log(JSON.stringify({
    jsonPath,
    detailPath,
    ...summary
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
