const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'fix-mabao-membership-orders' });

const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');
const repairPlanPath = path.join(reportDir, 'mabao-membership-repair-plan-details.json');
const WRITE = process.argv.includes('--write');

const T_COURTS = 'ft_courts';
const T_MEMBERSHIP_ACCOUNTS = 'ft_membership_accounts';
const T_MEMBERSHIP_ORDERS = 'ft_membership_orders';
const T_MEMBERSHIP_BENEFIT_LEDGER = 'ft_membership_benefit_ledger';
const T_FINANCIAL_LEDGER = 'ft_financial_ledger';

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

function normalizeMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
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

function encodeAttributes(record) {
  return Object.entries(record)
    .filter(([key]) => key !== 'id' && record[key] !== undefined)
    .map(([columnName, columnValue]) => ({
      [columnName]: typeof columnValue === 'object' ? JSON.stringify(columnValue) : String(columnValue ?? '')
    }));
}

function getRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }] }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  });
}

function putRow(tableName, record) {
  return new Promise((resolve, reject) => {
    client.putRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(record.id) }],
      attributeColumns: encodeAttributes(record)
    }, (err) => (err ? reject(err) : resolve(record)));
  });
}

function deleteRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.deleteRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (err) => (err ? reject(err) : resolve()));
  });
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

function normalizeCourtHistory(history) {
  if (!Array.isArray(history)) return [];
  return history.map((row) => ({
    ...row,
    type: row.type || '消费',
    payMethod: row.payMethod || '',
    category: row.category || '其他',
    amount: Math.abs(normalizeMoney(row.amount)),
    bonusAmount: normalizeMoney(row.bonusAmount)
  }));
}

function computeCourtFinanceFromHistory(history, fallback = {}) {
  const rows = normalizeCourtHistory(history);
  if (!rows.length) {
    return {
      balance: normalizeMoney(fallback.balance),
      totalDeposit: normalizeMoney(fallback.totalDeposit),
      spentAmount: normalizeMoney(fallback.spentAmount),
      receivedAmount: normalizeMoney(fallback.receivedAmount != null ? fallback.receivedAmount : fallback.totalDeposit),
      storedValueSpent: normalizeMoney(fallback.storedValueSpent),
      directPaidSpent: normalizeMoney(fallback.directPaidSpent)
    };
  }
  const totals = {
    balance: 0,
    totalDeposit: 0,
    spentAmount: 0,
    receivedAmount: 0,
    storedValueSpent: 0,
    directPaidSpent: 0
  };
  rows.forEach((row) => {
    const amount = normalizeMoney(row.amount);
    const bonus = normalizeMoney(row.bonusAmount);
    if (!amount) return;
    if (row.type === '消费' && row.category === '内部占用') return;
    if (row.type === '充值') {
      totals.totalDeposit += amount;
      totals.receivedAmount += amount;
      totals.balance += amount + bonus;
      return;
    }
    if (row.type === '消费') {
      totals.spentAmount += amount;
      if (row.payMethod === '储值扣款') {
        totals.storedValueSpent += amount;
        totals.balance -= amount;
      } else {
        totals.directPaidSpent += amount;
        totals.receivedAmount += amount;
      }
      return;
    }
    if (row.type === '退款') {
      if (row.payMethod === '储值退款') totals.balance -= amount;
      totals.receivedAmount -= amount;
      return;
    }
    if (row.type === '冲正') {
      if (row.category === '会员到期清零') {
        totals.balance -= amount;
        return;
      }
      totals.spentAmount -= amount;
      if (row.payMethod === '储值扣款') {
        totals.storedValueSpent -= amount;
        totals.balance += amount;
      } else {
        totals.directPaidSpent -= amount;
        totals.receivedAmount -= amount;
      }
    }
  });
  Object.keys(totals).forEach((key) => {
    totals[key] = normalizeMoney(totals[key]);
  });
  return totals;
}

function updateCourtWithHistory(court, nextHistory) {
  return {
    ...court,
    history: nextHistory,
    ...computeCourtFinanceFromHistory(nextHistory, court),
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const plan = JSON.parse(fs.readFileSync(repairPlanPath, 'utf8'));
  const autoFixRows = Array.isArray(plan.autoFix) ? plan.autoFix : [];
  const archiveCandidates = Array.isArray(plan.archiveCandidates) ? plan.archiveCandidates : [];

  const [financialLedger, benefitLedger, membershipOrders] = await Promise.all([
    scan(T_FINANCIAL_LEDGER, 15000),
    scan(T_MEMBERSHIP_BENEFIT_LEDGER, 10000),
    scan(T_MEMBERSHIP_ORDERS, 5000)
  ]);

  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    autoFixed: [],
    archived: [],
    skipped: []
  };

  for (const row of autoFixRows) {
    const order = await getRow(T_MEMBERSHIP_ORDERS, row.membershipOrderId).catch(() => null);
    if (!order) {
      report.skipped.push({ type: 'autoFix', orderId: row.membershipOrderId, reason: 'membership_order_missing' });
      continue;
    }
    const court = await getRow(T_COURTS, order.courtId).catch(() => null);
    const nextOrder = {
      ...order,
      bonusAmount: normalizeMoney(row.expected.bonusAmount),
      discountRate: Number(row.expected.discountRate || order.discountRate || 1),
      notes: row.expected.notes || order.notes || '',
      updatedAt: new Date().toISOString()
    };
    let nextCourt = null;
    if (court) {
      const history = normalizeCourtHistory(court.history).map((item) => {
        if (String(item.membershipOrderId || '') !== String(order.id)) return item;
        return {
          ...item,
          bonusAmount: normalizeMoney(row.expected.bonusAmount)
        };
      });
      nextCourt = updateCourtWithHistory(court, history);
    }
    if (WRITE) {
      await putRow(T_MEMBERSHIP_ORDERS, nextOrder);
      if (nextCourt) await putRow(T_COURTS, nextCourt);
    }
    report.autoFixed.push({
      orderId: order.id,
      name: order.courtName,
      courtId: order.courtId,
      beforeBonusAmount: normalizeMoney(order.bonusAmount),
      afterBonusAmount: normalizeMoney(nextOrder.bonusAmount),
      beforeBalance: normalizeMoney(court?.balance),
      afterBalance: normalizeMoney(nextCourt?.balance)
    });
  }

  for (const row of archiveCandidates) {
    const order = await getRow(T_MEMBERSHIP_ORDERS, row.membershipOrderId).catch(() => null);
    if (!order) {
      report.skipped.push({ type: 'archive', orderId: row.membershipOrderId, reason: 'membership_order_missing' });
      continue;
    }
    const court = await getRow(T_COURTS, order.courtId).catch(() => null);
    const benefitRows = benefitLedger.filter((item) => String(item.membershipOrderId || '') === String(order.id));
    const ledgerRows = financialLedger.filter((item) => String(item.sourceId || '') === String(order.id));
    const siblingCount = membershipOrders.filter((item) => String(item.membershipAccountId || '') === String(order.membershipAccountId || '') && String(item.id) !== String(order.id)).length;
    let nextCourt = null;
    if (court) {
      const history = normalizeCourtHistory(court.history).filter((item) => String(item.membershipOrderId || '') !== String(order.id));
      nextCourt = updateCourtWithHistory(court, history);
    }
    if (WRITE) {
      await Promise.all(benefitRows.map((item) => deleteRow(T_MEMBERSHIP_BENEFIT_LEDGER, item.id)));
      await Promise.all(ledgerRows.map((item) => deleteRow(T_FINANCIAL_LEDGER, item.id)));
      await deleteRow(T_MEMBERSHIP_ORDERS, order.id);
      if (nextCourt) await putRow(T_COURTS, nextCourt);
      if (!siblingCount && order.membershipAccountId) await deleteRow(T_MEMBERSHIP_ACCOUNTS, order.membershipAccountId);
    }
    report.archived.push({
      orderId: order.id,
      name: order.courtName,
      courtId: order.courtId,
      deletedBenefitLedgerIds: benefitRows.map((item) => item.id),
      deletedFinancialLedgerIds: ledgerRows.map((item) => item.id),
      deletedMembershipAccountId: !siblingCount ? order.membershipAccountId : '',
      removedHistoryCount: court ? normalizeCourtHistory(court.history).filter((item) => String(item.membershipOrderId || '') === String(order.id)).length : 0
    });
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'mabao-membership-fix-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
