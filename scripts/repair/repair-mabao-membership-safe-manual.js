const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'repair-mabao-membership-safe-manual' });

const WRITE = process.argv.includes('--write');
const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');

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

const PLAN_ID_GOLD = 'f6996b4e-524f-4d58-8e84-764746bde79a';
const PLAN_NAME_GOLD = '马坡订场会员';
const SKY_RENEWAL_ORDER_ID = 'repair-sky-renewal-2026-04-14';
const SKY_RENEWAL_LEDGER_ID = 'repair-sky-renewal-ledger-2026-04-14';

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

function deleteRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.deleteRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }]
    }, (err) => (err ? reject(err) : resolve()));
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

function toIso(localText) {
  if (!localText) return new Date().toISOString();
  const [datePart, timePart = '00:00'] = String(localText).trim().split(/\s+/);
  return new Date(`${datePart}T${timePart}:00+08:00`).toISOString();
}

function addMonthsKey(ds, months) {
  const [y, m, d0] = String(ds || '').slice(0, 10).split('-').map((n) => parseInt(n, 10) || 0);
  const d = new Date(Date.UTC(y, m - 1, d0));
  d.setUTCMonth(d.getUTCMonth() + (parseInt(months, 10) || 0));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function repairWang(report) {
  const [court, account, keepOrder, dropOrder, keepLedger, dropLedger] = await Promise.all([
    getRow(T_COURTS, '1c097e22-5582-4693-bfb9-9adf0c0957b8'),
    getRow(T_MEMBERSHIP_ACCOUNTS, 'acf536e7-6f4b-4916-ae4e-01e8e5c3a112'),
    getRow(T_MEMBERSHIP_ORDERS, '54bcf95d-95f4-4ff9-8aa1-2c6a632817fa'),
    getRow(T_MEMBERSHIP_ORDERS, '3dfa1f33-edca-4992-9f80-d0542b07b3f3'),
    getRow(T_FINANCIAL_LEDGER, '1bee5a09-53c5-4fc4-ae1e-3e60986e9180'),
    getRow(T_FINANCIAL_LEDGER, 'bb9c76a1-e831-4240-9825-31bbed32eb86')
  ]);
  const firstOpenAt = '2026-04-07 11:17';
  const purchaseDate = '2026-04-07';
  const cycleStartDate = purchaseDate;
  const validUntil = addMonthsKey(purchaseDate, 12);
  const hardExpireAt = addMonthsKey(purchaseDate, 24);
  const keepOrderNext = {
    ...keepOrder,
    purchaseDate,
    effectiveDate: purchaseDate,
    cycleStartDate,
    validUntil,
    hardExpireAt,
    rechargeAmount: 10000,
    finalAmount: 10000,
    systemAmount: 10000,
    bonusAmount: 1500,
    discountRate: 0.8,
    notes: '不要其他会员权益，只需要穿线次数；需要处置储值合同',
    benefitSnapshot: {
      stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 }
    },
    benefitSnapshotCustomized: true,
    planBenefitTemplateSnapshot: keepOrder.planBenefitTemplateSnapshot || {},
    phone: '15001010368',
    updatedAt: new Date().toISOString()
  };
  const keepLedgerNext = {
    ...keepLedger,
    businessDate: purchaseDate,
    cashDelta: cents(10000),
    deferredRevenueDelta: cents(10000),
    productSnapshotPrice: cents(10000),
    notes: '不要其他会员权益，只需要穿线次数；需要处置储值合同 | 历史补账',
    productSnapshotMeta: {
      ...(keepLedger.productSnapshotMeta || {}),
      membershipOrderId: keepOrder.id,
      membershipAccountId: account.id,
      courtHistoryRechargeId: '675dc6c8-4e01-4aa6-8f8c-e9d7bffce864',
      rechargeAmount: cents(10000),
      bonusAmount: cents(1500)
    },
    sourceId: keepOrder.id,
    userId: court.id,
    userName: court.name
  };
  const nextHistory = (Array.isArray(court.history) ? court.history : [])
    .filter((row) => String(row.membershipOrderId || '') !== String(dropOrder.id))
    .map((row) => {
      if (String(row.id) !== '675dc6c8-4e01-4aa6-8f8c-e9d7bffce864') return row;
      return {
        ...row,
        date: purchaseDate,
        amount: 10000,
        bonusAmount: 1500,
        membershipOrderId: keepOrder.id,
        membershipAccountId: account.id,
        membershipPlanId: PLAN_ID_GOLD,
        membershipPlanName: PLAN_NAME_GOLD,
        payMethod: '会员充值',
        category: '会员充值',
        systemAmount: 10000,
        finalAmount: 10000,
        discountRate: 0.8,
        note: `${PLAN_NAME_GOLD}开卡/续充`
      };
    });
  const nextCourt = {
    ...court,
    phone: '15001010368',
    joinDate: purchaseDate,
    history: nextHistory,
    ...computeCourtFinanceFromHistory(nextHistory),
    updatedAt: new Date().toISOString()
  };
  const nextAccount = {
    ...account,
    phone: '15001010368',
    lastOrderId: keepOrder.id,
    lastQualifiedRechargeAmount: 10000,
    cycleStartDate,
    validUntil,
    hardExpireAt,
    createdAt: toIso(firstOpenAt),
    updatedAt: new Date().toISOString()
  };
  if (WRITE) {
    await putRow(T_MEMBERSHIP_ORDERS, keepOrderNext);
    await putRow(T_FINANCIAL_LEDGER, keepLedgerNext);
    await putRow(T_COURTS, nextCourt);
    await putRow(T_MEMBERSHIP_ACCOUNTS, nextAccount);
    await deleteRow(T_MEMBERSHIP_ORDERS, dropOrder.id);
    await deleteRow(T_FINANCIAL_LEDGER, dropLedger.id);
  }
  report.actions.push({
    name: '王大人',
    type: 'merge_duplicate_orders',
    keptOrderId: keepOrder.id,
    deletedOrderId: dropOrder.id,
    beforeOrderCount: 2,
    afterOrderCount: 1,
    balance: nextCourt.balance
  });
}

async function repairSky(report) {
  const [court, account, firstOrder, firstLedger, renewalOrderExisting, renewalLedgerExisting] = await Promise.all([
    getRow(T_COURTS, '4ebd2b73-7e7c-4c44-9582-d50920c2c2ef'),
    getRow(T_MEMBERSHIP_ACCOUNTS, 'df91e3bb-6545-4766-acf4-b411bb8ab55b'),
    getRow(T_MEMBERSHIP_ORDERS, '29f4ac41-3e41-433c-bb82-a58f50041bbc'),
    getRow(T_FINANCIAL_LEDGER, 'dc13a5c6-6d3e-4894-9ffa-dd0d6bf39fea'),
    getRow(T_MEMBERSHIP_ORDERS, SKY_RENEWAL_ORDER_ID).catch(() => null),
    getRow(T_FINANCIAL_LEDGER, SKY_RENEWAL_LEDGER_ID).catch(() => null)
  ]);
  const firstOpenAt = '2026-03-24 14:50';
  const renewalAt = '2026-04-14 20:25';
  const firstPurchaseDate = '2026-03-24';
  const renewalDate = '2026-04-14';
  const firstOrderNext = {
    ...firstOrder,
    purchaseDate: firstPurchaseDate,
    effectiveDate: firstPurchaseDate,
    cycleStartDate: firstPurchaseDate,
    validUntil: addMonthsKey(firstPurchaseDate, 12),
    hardExpireAt: addMonthsKey(firstPurchaseDate, 24),
    rechargeAmount: 5000,
    finalAmount: 5000,
    systemAmount: 5000,
    bonusAmount: 336,
    discountRate: 0.8,
    benefitSnapshot: {
      publicLesson: { label: '大师公开课', unit: '次', count: 6 },
      stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
      ballMachine: { label: '发球机免费', unit: '次', count: 6 },
      level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
    },
    benefitSnapshotCustomized: true,
    notes: '',
    phone: '18813066492',
    createdAt: toIso(firstOpenAt),
    updatedAt: new Date().toISOString()
  };
  const renewalOrder = {
    ...(renewalOrderExisting || {}),
    id: SKY_RENEWAL_ORDER_ID,
    membershipAccountId: account.id,
    courtId: court.id,
    courtName: court.name,
    phone: '18813066492',
    studentIds: Array.isArray(account.studentIds) ? account.studentIds : [],
    membershipPlanId: PLAN_ID_GOLD,
    membershipPlanName: PLAN_NAME_GOLD,
    priceSource: 'membership_plan',
    priceSourceId: PLAN_ID_GOLD,
    priceSourceName: PLAN_NAME_GOLD,
    systemAmount: 5000,
    finalAmount: 5000,
    priceOverridden: false,
    overrideReason: '',
    rechargeAmount: 5000,
    bonusAmount: 0,
    discountRate: 0.8,
    purchaseDate: renewalDate,
    effectiveDate: renewalDate,
    cycleStartDate: renewalDate,
    validUntil: addMonthsKey(renewalDate, 12),
    hardExpireAt: addMonthsKey(renewalDate, 24),
    qualifiesRenewalReset: true,
    planBenefitTemplateSnapshot: firstOrder.planBenefitTemplateSnapshot || {},
    benefitSnapshot: {},
    benefitSnapshotCustomized: true,
    benefitValidUntil: addMonthsKey(renewalDate, 12),
    courtHistoryRechargeId: 'legacy-deposit-legacy',
    operator: '管理员',
    requestKey: '',
    status: 'active',
    notes: '',
    createdAt: toIso(renewalAt),
    updatedAt: new Date().toISOString()
  };
  const firstLedgerNext = {
    ...firstLedger,
    businessDate: firstPurchaseDate,
    notes: '历史补账',
    productSnapshotMeta: {
      ...(firstLedger.productSnapshotMeta || {}),
      membershipOrderId: firstOrder.id,
      membershipAccountId: account.id,
      rechargeAmount: cents(5000),
      bonusAmount: cents(336)
    },
    sourceId: firstOrder.id
  };
  const renewalLedger = {
    ...(renewalLedgerExisting || {}),
    id: SKY_RENEWAL_LEDGER_ID,
    actionType: '收款',
    actorId: '',
    actorName: '管理员',
    businessDate: renewalDate,
    businessType: '会员',
    cashDelta: cents(5000),
    clubId: 'default',
    createdAt: toIso(renewalAt),
    deferredRevenueDelta: cents(5000),
    entitlementDelta: '',
    idempotencyKey: `membership_order:${SKY_RENEWAL_ORDER_ID}:会员充值`,
    ledgerType: '会员充值',
    notes: '历史补账',
    openingDeferredRevenueDelta: 0,
    paymentChannel: '会员充值',
    paymentStatus: 'success',
    productId: PLAN_ID_GOLD,
    productSnapshotMeta: {
      membershipOrderId: SKY_RENEWAL_ORDER_ID,
      membershipAccountId: account.id,
      courtHistoryRechargeId: 'legacy-deposit-legacy',
      rechargeAmount: cents(5000),
      bonusAmount: 0
    },
    productSnapshotName: PLAN_NAME_GOLD,
    productSnapshotPrice: cents(5000),
    reason: `${PLAN_NAME_GOLD}开卡/续充 | 历史补账`,
    recognizedRevenueDelta: 0,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: SKY_RENEWAL_ORDER_ID,
    sourceType: 'membership_order',
    status: 'active',
    tenantId: 'default',
    userId: court.id,
    userName: court.name,
    userType: 'court_customer'
  };
  const nextHistory = [];
  (Array.isArray(court.history) ? court.history : []).forEach((row) => {
    if (String(row.id) === 'b1b07e39-eda4-4162-84bb-bb9c99ad7b08') {
      nextHistory.push({
        ...row,
        date: firstPurchaseDate,
        membershipOrderId: firstOrder.id,
        membershipAccountId: account.id,
        membershipPlanId: PLAN_ID_GOLD,
        membershipPlanName: PLAN_NAME_GOLD,
        amount: 5000,
        bonusAmount: 336,
        payMethod: '会员充值',
        category: '会员充值',
        note: `${PLAN_NAME_GOLD}开卡/续充`
      });
      return;
    }
    if (String(row.id) === 'legacy-deposit-legacy') return;
    if (String(row.id) === 'legacy-stored-spent-legacy') {
      nextHistory.push({ ...row, date: '2026-04-13' });
      return;
    }
    if (String(row.id) === 'legacy-direct-spent-legacy') {
      nextHistory.push({ ...row, date: '2026-04-13' });
      return;
    }
    nextHistory.push(row);
  });
  nextHistory.splice(3, 0, {
    id: 'legacy-deposit-legacy',
    date: renewalDate,
    type: '充值',
    payMethod: '会员充值',
    category: '会员充值',
    amount: 5000,
    bonusAmount: 0,
    membershipOrderId: SKY_RENEWAL_ORDER_ID,
    membershipAccountId: account.id,
    membershipPlanId: PLAN_ID_GOLD,
    membershipPlanName: PLAN_NAME_GOLD,
    discountRate: 0.8,
    originalAmount: 0,
    discountedAmount: 0,
    note: `${PLAN_NAME_GOLD}开卡/续充`,
    studentId: ''
  });
  const nextCourt = {
    ...court,
    phone: '18813066492',
    joinDate: firstPurchaseDate,
    history: nextHistory,
    ...computeCourtFinanceFromHistory(nextHistory),
    updatedAt: new Date().toISOString()
  };
  const nextAccount = {
    ...account,
    phone: '18813066492',
    lastOrderId: SKY_RENEWAL_ORDER_ID,
    lastQualifiedRechargeAmount: 5000,
    cycleStartDate: renewalDate,
    validUntil: addMonthsKey(renewalDate, 12),
    hardExpireAt: addMonthsKey(renewalDate, 24),
    createdAt: toIso(firstOpenAt),
    updatedAt: new Date().toISOString()
  };
  if (WRITE) {
    await putRow(T_MEMBERSHIP_ORDERS, firstOrderNext);
    await putRow(T_MEMBERSHIP_ORDERS, renewalOrder);
    await putRow(T_FINANCIAL_LEDGER, firstLedgerNext);
    await putRow(T_FINANCIAL_LEDGER, renewalLedger);
    await putRow(T_COURTS, nextCourt);
    await putRow(T_MEMBERSHIP_ACCOUNTS, nextAccount);
  }
  report.actions.push({
    name: 'sky',
    type: 'restore_missing_renewal_order',
    firstOrderId: firstOrder.id,
    renewalOrderId: SKY_RENEWAL_ORDER_ID,
    orderCountAfter: 2,
    balance: nextCourt.balance
  });
}

async function main() {
  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    actions: []
  };
  await repairWang(report);
  await repairSky(report);
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'repair-mabao-membership-safe-manual-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
