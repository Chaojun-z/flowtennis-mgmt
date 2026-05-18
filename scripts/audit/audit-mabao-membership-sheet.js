const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-mabao-membership-sheet' });

const referencePath = path.join(__dirname, '..', '..', 'docs', 'reports', 'mabao-membership-sheet-reference.json');
const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');

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

function normalizePhone(value) {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeName(value) {
  return String(value || '')
    .replace(/[（）()]/g, '')
    .replace(/\s+/g, '')
    .replace(/刘洋/g, '刘洋')
    .trim();
}

function firstBenefits(order) {
  const snap = order?.benefits || order?.benefitSnapshot || {};
  return {
    publicLessonCount: parseInt(snap?.publicLesson?.count) || 0,
    stringingLaborCount: parseInt(snap?.stringingLabor?.count) || 0,
    ballMachineCount: parseInt(snap?.ballMachine?.count) || 0,
    level2PartnerCount: parseInt(snap?.level2Partner?.count) || 0
  };
}

function dateKey(value) {
  return String(value || '').replace(/\//g, '-').slice(0, 10);
}

function buildIssue(type, expected, actual, note = '') {
  return { type, expected, actual, note };
}

async function main() {
  const referenceRows = JSON.parse(fs.readFileSync(referencePath, 'utf8'));
  const [orders, courts] = await Promise.all([
    scan('ft_membership_orders', 5000),
    scan('ft_courts', 5000)
  ]);

  const courtById = new Map(courts.map((row) => [String(row.id || ''), row]));
  const relevantOrders = orders
    .filter((row) => String(row.membershipPlanName || '').includes('马坡订场会员'))
    .map((row) => {
      const court = courtById.get(String(row.courtId || '')) || {};
      return {
        id: row.id,
        courtId: row.courtId || '',
        name: row.courtName || court.name || '',
        phone: normalizePhone(court.phone || row.phone || ''),
        purchaseDate: dateKey(row.purchaseDate),
        rechargeAmount: money(row.rechargeAmount),
        bonusAmount: money(row.bonusAmount),
        discountRate: Number(row.discountRate) || 0,
        benefitSnapshot: row.benefitSnapshot || {},
        notes: String(row.notes || '').trim()
      };
    });

  const orderKeys = new Set();
  const referenceDetails = [];
  const mismatchRows = [];
  const missingInSystem = [];

  for (const ref of referenceRows) {
    const phone = normalizePhone(ref.phone);
    const isPendingOpen = String(ref.notes || '').includes('未开卡');
    const expectedOrderCount = isPendingOpen ? 0 : ((ref.storedValueAmount > 0 ? 1 : 0) + (ref.renewalAmount > 0 ? 1 : 0));
    const matchedOrders = relevantOrders
      .filter((row) => row.phone === phone || normalizeName(row.name) === normalizeName(ref.name))
      .sort((a, b) => String(a.purchaseDate).localeCompare(String(b.purchaseDate)));

    matchedOrders.forEach((row) => orderKeys.add(String(row.id)));

    const issues = [];
    if (matchedOrders.length !== expectedOrderCount) {
      issues.push(buildIssue('order_count_mismatch', expectedOrderCount, matchedOrders.length, '系统订单数量和表不一致'));
    }

    const firstOrder = matchedOrders[0] || null;
    if (isPendingOpen) {
      const detail = {
        rowNo: ref.rowNo,
        name: ref.name,
        phone: ref.phone,
        expectedOrderCount,
        systemOrderCount: matchedOrders.length,
        systemOrders: matchedOrders,
        issues: matchedOrders.length ? [buildIssue('should_not_open_yet', 0, matchedOrders.length, '表里标记为未开卡，但系统已有会员订单')] : []
      };
      referenceDetails.push(detail);
      if (detail.issues.length) mismatchRows.push(detail);
      continue;
    }
    if (firstOrder) {
      if (money(firstOrder.rechargeAmount) !== money(ref.storedValueAmount)) {
        issues.push(buildIssue('first_recharge_mismatch', ref.storedValueAmount, firstOrder.rechargeAmount));
      }
      if (money(firstOrder.bonusAmount) !== money(ref.bonusAmount)) {
        issues.push(buildIssue('first_bonus_mismatch', ref.bonusAmount, firstOrder.bonusAmount));
      }
      if (Number(firstOrder.discountRate || 0) !== Number(ref.discountRate || 0)) {
        issues.push(buildIssue('discount_mismatch', ref.discountRate, firstOrder.discountRate));
      }
      const expectedBenefits = {
        publicLessonCount: parseInt(ref.publicLessonCount) || 0,
        stringingLaborCount: parseInt(ref.stringingLaborCount) || 0,
        ballMachineCount: parseInt(ref.ballMachineCount) || 0,
        level2PartnerCount: parseInt(ref.level2PartnerCount) || 0
      };
      const actualBenefits = firstBenefits(firstOrder);
      Object.entries(expectedBenefits).forEach(([key, expectedValue]) => {
        if ((actualBenefits[key] || 0) !== expectedValue) {
          issues.push(buildIssue(`benefit_${key}_mismatch`, expectedValue, actualBenefits[key] || 0));
        }
      });
    } else {
      issues.push(buildIssue('missing_first_order', '存在', '缺失'));
    }

    if (ref.renewalAmount > 0) {
      const secondOrder = matchedOrders[1] || null;
      if (!secondOrder) {
        issues.push(buildIssue('missing_renewal_order', ref.renewalAmount, '缺失'));
      } else if (money(secondOrder.rechargeAmount) !== money(ref.renewalAmount)) {
        issues.push(buildIssue('renewal_recharge_mismatch', ref.renewalAmount, secondOrder.rechargeAmount));
      }
    }

    const detail = {
      rowNo: ref.rowNo,
      name: ref.name,
      phone: ref.phone,
      expectedOrderCount,
      systemOrderCount: matchedOrders.length,
      systemOrders: matchedOrders,
      issues
    };
    referenceDetails.push(detail);
    if (issues.length) mismatchRows.push(detail);
    if (!matchedOrders.length) missingInSystem.push(detail);
  }

  const extraSystemOrders = relevantOrders.filter((row) => !orderKeys.has(String(row.id)));

  const summary = {
    auditedAt: new Date().toISOString(),
    referenceRows: referenceRows.length,
    systemOrders: relevantOrders.length,
    mismatchRows: mismatchRows.length,
    missingInSystem: missingInSystem.length,
    extraSystemOrders: extraSystemOrders.length,
    topMismatchNames: mismatchRows.map((row) => row.name)
  };

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'mabao-membership-sheet-audit-summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportDir, 'mabao-membership-sheet-audit-details.json'), JSON.stringify({
    mismatches: mismatchRows,
    extraSystemOrders
  }, null, 2));

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
