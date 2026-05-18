const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'restore-damaged-mabao-membership-orders' });

const WRITE = process.argv.includes('--write');
const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');

const T_COURTS = 'ft_courts';
const T_MEMBERSHIP_ACCOUNTS = 'ft_membership_accounts';
const T_MEMBERSHIP_ORDERS = 'ft_membership_orders';
const T_MEMBERSHIP_BENEFIT_LEDGER = 'ft_membership_benefit_ledger';
const T_FINANCIAL_LEDGER = 'ft_financial_ledger';
const T_MEMBERSHIP_PLANS = 'ft_membership_plans';

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

const TARGETS = [
  {
    name: '唐果',
    orderId: 'daf10fa1-da77-4c7f-8686-53bcadff5e1d',
    accountId: '5c330c64-4fcc-44a7-ae46-76e86eabd7f1',
    courtId: 'eed2716c-c642-49ac-b00d-96e8b7c4e549',
    rechargeHistoryId: '20a84b06-10a8-4ca8-a0e3-25fbeec3f6f2',
    reference: {
      phone: '13901293813',
      purchaseDate: '2026-04-13',
      rechargeAmount: 5000,
      bonusAmount: 528,
      discountRate: 0.8,
      notes: '不需要Mira通知',
      benefitSnapshot: {}
    }
  },
  {
    name: '张满满（张颖）',
    orderId: '40bda10f-86fd-4b7c-99b6-7703946fe58c',
    accountId: 'ea6b1afe-51bd-45e0-9d16-18ff7699642d',
    courtId: '29c46280-0a29-4f11-bf52-b4fa9d3568e9',
    rechargeHistoryId: 'fcde1b5b-c216-4d77-b3b7-3cce4d688db1',
    reference: {
      phone: '13910192209',
      purchaseDate: '2026-04-13',
      rechargeAmount: 5000,
      bonusAmount: 498,
      discountRate: 0.8,
      notes: '一开始就已经告知',
      benefitSnapshot: {
        publicLesson: { label: '大师公开课', unit: '次', count: 6 },
        stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
        ballMachine: { label: '发球机免费', unit: '次', count: 6 },
        level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
      }
    }
  },
  {
    name: '胡之超',
    orderId: '68b8f708-437d-4073-bbeb-204e17060634',
    accountId: '7c1eb850-57e9-4612-b169-614e9ec76458',
    courtId: 'c840ae23-51e4-48f2-a9ef-5b7486f6a185',
    rechargeHistoryId: 'e21c5ddd-3bc2-4cc8-bf1c-66a08f4f389c',
    repairLedgerId: 'repair-membership-ledger-68b8f708-437d-4073-bbeb-204e17060634',
    reference: {
      phone: '13810753874',
      purchaseDate: '2026-04-25',
      rechargeAmount: 5000,
      bonusAmount: 800,
      discountRate: 0.8,
      notes: '一开始就已经告知',
      benefitSnapshot: {
        publicLesson: { label: '大师公开课', unit: '次', count: 6 },
        stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
        ballMachine: { label: '发球机免费', unit: '次', count: 6 },
        level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
      }
    }
  }
];

function money(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function cents(value) {
  return Math.round(money(value) * 100);
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
      attributeColumns: Object.entries(record)
        .filter(([key]) => key !== 'id' && record[key] !== undefined)
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err) => (err ? reject(err) : resolve(record)));
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

function computeCourtFinanceFromHistory(history) {
  const totals = {
    balance: 0,
    totalDeposit: 0,
    spentAmount: 0,
    receivedAmount: 0,
    storedValueSpent: 0,
    directPaidSpent: 0
  };
  history.forEach((row) => {
    const amount = money(row.amount);
    const bonus = money(row.bonusAmount);
    if (!amount) return;
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
    }
  });
  Object.keys(totals).forEach((key) => {
    totals[key] = money(totals[key]);
  });
  return totals;
}

function buildBenefitSnapshot(reference) {
  const base = {};
  const source = reference.benefitSnapshot || {};
  ['publicLesson', 'stringingLabor', 'ballMachine', 'level2Partner'].forEach((key) => {
    if (source[key]) base[key] = source[key];
  });
  return base;
}

function buildRechargeHistory({ target, order, account, plan }) {
  return {
    id: target.rechargeHistoryId,
    date: target.reference.purchaseDate,
    type: '充值',
    payMethod: '会员充值',
    category: '会员充值',
    amount: target.reference.rechargeAmount,
    bonusAmount: target.reference.bonusAmount,
    membershipOrderId: target.orderId,
    membershipAccountId: target.accountId,
    membershipPlanId: plan.id,
    membershipPlanName: plan.name,
    systemAmount: target.reference.rechargeAmount,
    finalAmount: target.reference.rechargeAmount,
    priceOverridden: false,
    overrideReason: '',
    discountRate: target.reference.discountRate,
    originalAmount: 0,
    discountedAmount: 0,
    note: `${plan.name}开卡/续充`
  };
}

function buildConsumeHistoryFromLedger(row) {
  return {
    id: row.productSnapshotMeta?.historyId || row.sourceId || row.id,
    date: row.businessDate || String(row.createdAt || '').slice(0, 10),
    type: '消费',
    payMethod: row.paymentChannel || '储值扣款',
    category: row.businessType || row.productSnapshotName || '订场',
    amount: money((Number(row.recognizedRevenueDelta) || 0) / 100),
    bonusAmount: 0,
    membershipAccountId: row.productSnapshotMeta?.membershipAccountId || '',
    note: row.notes || row.reason || ''
  };
}

function buildOrder({ target, account, plan }) {
  const customBenefit = Object.keys(target.reference.benefitSnapshot || {}).length > 0 || target.name === '唐果';
  return {
    id: target.orderId,
    membershipAccountId: account.id,
    courtId: target.courtId,
    courtName: target.name,
    phone: target.reference.phone,
    studentIds: Array.isArray(account.studentIds) ? account.studentIds : [],
    membershipPlanId: plan.id,
    membershipPlanName: plan.name,
    priceSource: 'membership_plan',
    priceSourceId: plan.id,
    priceSourceName: plan.name,
    systemAmount: target.reference.rechargeAmount,
    finalAmount: target.reference.rechargeAmount,
    priceOverridden: false,
    overrideReason: '',
    rechargeAmount: target.reference.rechargeAmount,
    bonusAmount: target.reference.bonusAmount,
    discountRate: target.reference.discountRate,
    purchaseDate: target.reference.purchaseDate,
    effectiveDate: target.reference.purchaseDate,
    cycleStartDate: account.cycleStartDate,
    validUntil: account.validUntil,
    hardExpireAt: account.hardExpireAt,
    qualifiesRenewalReset: true,
    planBenefitTemplateSnapshot: plan.benefitTemplate || {},
    benefitSnapshot: buildBenefitSnapshot(target.reference),
    benefitSnapshotCustomized: customBenefit,
    benefitValidUntil: account.validUntil,
    courtHistoryRechargeId: target.rechargeHistoryId,
    operator: '管理员',
    requestKey: '',
    status: 'active',
    notes: target.reference.notes,
    createdAt: account.createdAt,
    updatedAt: new Date().toISOString()
  };
}

function buildCourt({ target, account, ledgerRows, plan }) {
  const history = [
    buildRechargeHistory({ target, account, plan }),
    ...ledgerRows
      .filter((row) => row.actionType === '消费')
      .map(buildConsumeHistoryFromLedger)
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')))
  ];
  const finance = computeCourtFinanceFromHistory(history);
  return {
    id: target.courtId,
    name: target.name,
    phone: target.reference.phone,
    studentId: Array.isArray(account.studentIds) && account.studentIds[0] ? account.studentIds[0] : '',
    studentIds: Array.isArray(account.studentIds) ? account.studentIds : [],
    campus: 'mabao',
    joinDate: target.reference.purchaseDate,
    recentFollowUpDate: '',
    nextFollowUpDate: '',
    owner: '',
    depositAttitude: '',
    familiarity: '',
    notes: '',
    status: 'active',
    history,
    ...finance,
    updatedAt: new Date().toISOString()
  };
}

function buildLedger({ target, account, plan, existingLedger }) {
  if (existingLedger) {
    return {
      ...existingLedger,
      businessDate: target.reference.purchaseDate,
      cashDelta: cents(target.reference.rechargeAmount),
      deferredRevenueDelta: cents(target.reference.rechargeAmount),
      productSnapshotPrice: cents(target.reference.rechargeAmount),
      notes: `${target.reference.notes || ''}${target.reference.notes ? ' | ' : ''}历史补账`,
      productSnapshotMeta: {
        ...(existingLedger.productSnapshotMeta || {}),
        membershipOrderId: target.orderId,
        membershipAccountId: target.accountId,
        courtHistoryRechargeId: target.rechargeHistoryId,
        rechargeAmount: cents(target.reference.rechargeAmount),
        bonusAmount: cents(target.reference.bonusAmount)
      },
      userId: target.courtId,
      userName: target.name,
      updatedAt: new Date().toISOString()
    };
  }
  return {
    id: target.repairLedgerId,
    actionType: '收款',
    actorId: '',
    actorName: '管理员',
    businessDate: target.reference.purchaseDate,
    businessType: '会员',
    cashDelta: cents(target.reference.rechargeAmount),
    clubId: 'default',
    createdAt: account.createdAt,
    deferredRevenueDelta: cents(target.reference.rechargeAmount),
    entitlementDelta: '',
    idempotencyKey: `membership_order:${target.orderId}:会员充值`,
    ledgerType: '会员充值',
    notes: `${target.reference.notes} | 历史补账`,
    openingDeferredRevenueDelta: 0,
    paymentChannel: '会员充值',
    paymentStatus: 'success',
    productId: plan.id,
    productSnapshotMeta: {
      membershipOrderId: target.orderId,
      membershipAccountId: target.accountId,
      courtHistoryRechargeId: target.rechargeHistoryId,
      rechargeAmount: cents(target.reference.rechargeAmount),
      bonusAmount: cents(target.reference.bonusAmount)
    },
    productSnapshotName: plan.name,
    productSnapshotPrice: cents(target.reference.rechargeAmount),
    reason: `${plan.name}开卡/续充 | 历史补账`,
    recognizedRevenueDelta: 0,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: target.orderId,
    sourceType: 'membership_order',
    status: 'active',
    tenantId: 'default',
    userId: target.courtId,
    userName: target.name,
    userType: 'court_customer'
  };
}

async function main() {
  const [plans, ledgers] = await Promise.all([
    scan(T_MEMBERSHIP_PLANS, 1000),
    scan(T_FINANCIAL_LEDGER, 30000)
  ]);
  const plan = plans.find((row) => String(row.id || '') === 'f6996b4e-524f-4d58-8e84-764746bde79a');
  if (!plan) throw new Error('未找到马坡黄金卡会员方案');

  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    restored: []
  };

  for (const target of TARGETS) {
    const account = await getRow(T_MEMBERSHIP_ACCOUNTS, target.accountId);
    if (!account) throw new Error(`未找到会员账户 ${target.accountId}`);
    const relatedLedgerRows = ledgers.filter((row) => String(row.userId || '') === String(target.courtId));
    const rechargeLedger = relatedLedgerRows.find((row) => String(row.sourceId || '') === String(target.orderId) && String(row.sourceType || '') === 'membership_order') || null;
    const order = buildOrder({ target, account, plan });
    const court = buildCourt({ target, account, ledgerRows: relatedLedgerRows, plan });
    const ledger = buildLedger({ target, account, plan, existingLedger: rechargeLedger });
    if (WRITE) {
      await putRow(T_MEMBERSHIP_ORDERS, order);
      await putRow(T_COURTS, court);
      await putRow(T_FINANCIAL_LEDGER, ledger);
    }
    report.restored.push({
      name: target.name,
      orderId: order.id,
      courtId: court.id,
      ledgerId: ledger.id,
      totalDeposit: court.totalDeposit,
      balance: court.balance,
      spentAmount: court.spentAmount,
      bonusAmount: order.bonusAmount,
      historyCount: court.history.length
    });
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'restore-damaged-mabao-membership-orders-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
