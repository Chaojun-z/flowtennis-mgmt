const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'finalize-mabao-zhoutao-viki' });

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

const PLAN_GOLD = {
  id: 'f6996b4e-524f-4d58-8e84-764746bde79a',
  name: '马坡订场会员',
  tierCode: '黄金卡',
  rechargeAmount: 5000,
  bonusAmount: 498,
  discountRate: 0.8,
  benefits: {
    publicLesson: { label: '大师公开课', unit: '次', count: 6 },
    stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
    ballMachine: { label: '发球机免费', unit: '次', count: 6 },
    level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
  }
};

const PLAN_SILVER = {
  id: '416e91d2-90e8-4452-8595-bd6685c96d87',
  name: '马坡订场会员',
  tierCode: '白银卡',
  rechargeAmount: 2000,
  bonusAmount: 166,
  discountRate: 0.9,
  benefits: {
    publicLesson: { label: '大师公开课', unit: '次', count: 2 },
    stringingLabor: { label: '穿线免手工费', unit: '次', count: 2 },
    ballMachine: { label: '发球机免费', unit: '次', count: 2 }
  }
};

const TARGETS = [
  {
    name: '周涛',
    keepCourtId: '14000c5d-4c32-45d2-9368-e809af1c7e14',
    dropCourtId: 'f7bcf070-82fb-4eb4-8a83-8abefc49354d',
    phone: '13426439488',
    plan: PLAN_GOLD,
    accountId: 'repair-mabao-account-zhoutao',
    orderId: 'repair-mabao-order-zhoutao-2026-04-18',
    ledgerRechargeId: 'repair-mabao-ledger-zhoutao-recharge',
    ledgerStoredSpendId: 'repair-mabao-ledger-zhoutao-stored-spend',
    openAt: '2026-04-18 00:00',
    notes: '一开始就已经告知',
    bookingRows: [
      { id: 'repair-zhoutao-booking-2026-03-04', date: '2026-03-04', timeRange: '20-21点', payMethod: '小程序', amount: 180, note: '周涛订场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-zhoutao-booking-2026-03-06', date: '2026-03-06', timeRange: '20-21点', payMethod: '小程序', amount: 180, note: '周涛订场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-zhoutao-booking-2026-03-09', date: '2026-03-09', timeRange: '20-21点', payMethod: '小程序', amount: 180, note: '周涛订场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-zhoutao-booking-2026-03-13', date: '2026-03-13', timeRange: '20-21点', payMethod: '小程序', amount: 180, note: '周涛订场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-zhoutao-booking-2026-03-16', date: '2026-03-16', timeRange: '20-21点', payMethod: '小程序', amount: 180, note: '周涛订场 / 散客纯定场 / 小程序' }
    ],
    storedBooking: {
      id: 'repair-zhoutao-booking-2026-04-19-stored',
      date: '2026-04-19',
      timeRange: '10点30-11点30',
      payMethod: '储值扣款',
      amount: 176,
      note: '周涛订场 / 散客纯定场（小程序） / 8折储值卡'
    }
  },
  {
    name: 'viki',
    keepCourtId: '2f383d54-73f1-443a-b171-f0104edaf330',
    dropCourtId: 'd2ba0669-a0af-4642-a2aa-fa00a4285fb0',
    phone: '16601175725',
    plan: PLAN_SILVER,
    accountId: 'repair-mabao-account-viki',
    orderId: 'repair-mabao-order-viki-2026-04-25',
    ledgerRechargeId: 'repair-mabao-ledger-viki-recharge',
    openAt: '2026-04-25 20:08',
    notes: '一开始就已经告知',
    bookingRows: [
      { id: 'repair-viki-booking-2026-02-01', date: '2026-02-01', timeRange: '17-18点30分', payMethod: '小程序', amount: 330, note: 'viki定场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-viki-booking-2026-02-07', date: '2026-02-07', timeRange: '11-12点', payMethod: '小程序', amount: 220, note: 'viki定场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-viki-booking-2026-02-23', date: '2026-02-23', timeRange: '7-8点', payMethod: '小程序', amount: 100, note: 'viki订场 / 散客纯定场（小程序） / 小程序' },
      { id: 'repair-viki-booking-2026-03-22', date: '2026-03-22', timeRange: '7点30分-8点30分', payMethod: '支付宝转账支付', amount: 160, note: 'viki订场 / 散客纯定场（小程序） / 支付宝转账支付' },
      { id: 'repair-viki-booking-2026-03-29', date: '2026-03-29', timeRange: '18-19点', payMethod: '小程序', amount: 220, note: 'viki订场 / 散客纯定场（小程序） / 小程序' }
    ]
  }
];

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
}

function money(value) {
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

function toIso(localText) {
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

function bookingHistoryRow(item, membershipMeta = null) {
  return {
    id: item.id,
    date: item.date,
    type: '消费',
    category: '订场',
    payMethod: item.payMethod,
    amount: item.amount,
    bonusAmount: 0,
    note: item.note,
    timeRange: item.timeRange,
    ...(membershipMeta || {})
  };
}

function bookingLedgerRow(base, item, isStored = false) {
  const amount = cents(item.amount);
  return {
    id: base.id,
    actionType: isStored ? '消费' : '收款',
    actorId: '',
    actorName: item.payMethod === '小程序' ? '小程序' : '管理员',
    businessDate: item.date,
    businessType: '订场',
    cashDelta: isStored ? 0 : amount,
    clubId: 'default',
    createdAt: base.createdAt,
    deferredRevenueDelta: isStored ? -amount : 0,
    entitlementDelta: '',
    idempotencyKey: base.idempotencyKey,
    ledgerType: isStored ? '储值订场' : '历史订场收入',
    notes: item.note,
    openingDeferredRevenueDelta: 0,
    paymentChannel: item.payMethod,
    paymentStatus: 'success',
    productId: '',
    productSnapshotMeta: base.productSnapshotMeta,
    productSnapshotName: '订场',
    productSnapshotPrice: amount,
    reason: isStored ? '历史储值订场补录' : '历史订场收入补录',
    recognizedRevenueDelta: amount,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: base.sourceId,
    sourceType: base.sourceType,
    status: 'active',
    tenantId: 'default',
    userId: base.userId,
    userName: base.userName,
    userType: 'court_customer'
  };
}

async function finalizeTarget(target) {
  const keepCourt = await getRow(T_COURTS, target.keepCourtId);
  if (!keepCourt) throw new Error(`未找到保留订场用户 ${target.keepCourtId}`);
  const purchaseDate = target.openAt.slice(0, 10).replace(/\//g, '-');
  const createdAt = toIso(target.openAt);
  const validUntil = addMonthsKey(purchaseDate, 12);
  const hardExpireAt = addMonthsKey(purchaseDate, 24);

  const account = {
    id: target.accountId,
    courtId: target.keepCourtId,
    courtName: target.name,
    phone: target.phone,
    studentIds: [],
    status: 'active',
    memberTag: target.plan.tierCode,
    memberLabel: target.plan.name,
    discountRate: target.plan.discountRate,
    cycleStartDate: purchaseDate,
    validUntil,
    hardExpireAt,
    autoExtended: false,
    lastQualifiedRechargeAmount: target.plan.rechargeAmount,
    lastOrderId: target.orderId,
    notes: '',
    createdAt,
    updatedAt: new Date().toISOString()
  };

  const order = {
    id: target.orderId,
    membershipAccountId: target.accountId,
    courtId: target.keepCourtId,
    courtName: target.name,
    phone: target.phone,
    studentIds: [],
    membershipPlanId: target.plan.id,
    membershipPlanName: target.plan.name,
    priceSource: 'membership_plan',
    priceSourceId: target.plan.id,
    priceSourceName: target.plan.name,
    systemAmount: target.plan.rechargeAmount,
    finalAmount: target.plan.rechargeAmount,
    priceOverridden: false,
    overrideReason: '',
    rechargeAmount: target.plan.rechargeAmount,
    bonusAmount: target.plan.bonusAmount,
    discountRate: target.plan.discountRate,
    purchaseDate,
    effectiveDate: purchaseDate,
    cycleStartDate: purchaseDate,
    validUntil,
    hardExpireAt,
    qualifiesRenewalReset: true,
    planBenefitTemplateSnapshot: target.plan.benefits,
    benefitSnapshot: target.plan.benefits,
    benefitSnapshotCustomized: true,
    benefitValidUntil: validUntil,
    courtHistoryRechargeId: `${target.orderId}-history-recharge`,
    operator: '管理员',
    requestKey: '',
    status: 'active',
    notes: target.notes,
    createdAt,
    updatedAt: new Date().toISOString()
  };

  const rechargeHistory = {
    id: `${target.orderId}-history-recharge`,
    date: purchaseDate,
    type: '充值',
    payMethod: '会员充值',
    category: '会员充值',
    amount: target.plan.rechargeAmount,
    bonusAmount: target.plan.bonusAmount,
    membershipOrderId: target.orderId,
    membershipAccountId: target.accountId,
    membershipPlanId: target.plan.id,
    membershipPlanName: target.plan.name,
    systemAmount: target.plan.rechargeAmount,
    finalAmount: target.plan.rechargeAmount,
    priceOverridden: false,
    overrideReason: '',
    discountRate: target.plan.discountRate,
    originalAmount: 0,
    discountedAmount: 0,
    note: `${target.plan.name}开卡/续充`
  };

  const history = [
    ...target.bookingRows.map((row) => bookingHistoryRow(row)),
    rechargeHistory
  ];

  const ledgers = [
    ...target.bookingRows.map((row) => bookingLedgerRow({
      id: `${row.id}-ledger`,
      idempotencyKey: `${row.id}:history-booking`,
      sourceId: row.id,
      sourceType: 'court_history',
      productSnapshotMeta: {
        courtId: target.keepCourtId,
        historyId: row.id,
        rawCustomerName: `${target.name}订场`,
        rawPaymentMethod: row.payMethod
      },
      userId: target.keepCourtId,
      userName: target.name,
      createdAt
    }, row, false))
  ];

  if (target.storedBooking) {
    history.push(bookingHistoryRow(target.storedBooking, {
      membershipOrderId: target.orderId,
      membershipAccountId: target.accountId
    }));
    ledgers.push(bookingLedgerRow({
      id: target.ledgerStoredSpendId,
      idempotencyKey: `${target.storedBooking.id}:stored-booking`,
      sourceId: target.storedBooking.id,
      sourceType: 'court_history',
      productSnapshotMeta: {
        courtId: target.keepCourtId,
        historyId: target.storedBooking.id,
        membershipAccountId: target.accountId,
        rawCustomerName: `${target.name}订场`,
        rawPaymentMethod: '8折储值卡'
      },
      userId: target.keepCourtId,
      userName: target.name,
      createdAt
    }, target.storedBooking, true));
  }

  const court = {
    ...keepCourt,
    id: target.keepCourtId,
    name: target.name,
    phone: target.phone,
    campus: 'mabao',
    joinDate: purchaseDate,
    owner: keepCourt.owner || 'mira',
    notes: '',
    history,
    ...computeCourtFinanceFromHistory(history),
    updatedAt: new Date().toISOString()
  };

  const rechargeLedger = {
    id: target.ledgerRechargeId,
    actionType: '收款',
    actorId: '',
    actorName: '管理员',
    businessDate: purchaseDate,
    businessType: '会员',
    cashDelta: cents(target.plan.rechargeAmount),
    clubId: 'default',
    createdAt,
    deferredRevenueDelta: cents(target.plan.rechargeAmount),
    entitlementDelta: '',
    idempotencyKey: `membership_order:${target.orderId}:会员充值`,
    ledgerType: '会员充值',
    notes: `${target.notes} | 历史补账`,
    openingDeferredRevenueDelta: 0,
    paymentChannel: '会员充值',
    paymentStatus: 'success',
    productId: target.plan.id,
    productSnapshotMeta: {
      membershipOrderId: target.orderId,
      membershipAccountId: target.accountId,
      courtHistoryRechargeId: rechargeHistory.id,
      rechargeAmount: cents(target.plan.rechargeAmount),
      bonusAmount: cents(target.plan.bonusAmount)
    },
    productSnapshotName: target.plan.name,
    productSnapshotPrice: cents(target.plan.rechargeAmount),
    reason: `${target.plan.name}开卡/续充 | 历史补账`,
    recognizedRevenueDelta: 0,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: target.orderId,
    sourceType: 'membership_order',
    status: 'active',
    tenantId: 'default',
    userId: target.keepCourtId,
    userName: target.name,
    userType: 'court_customer'
  };

  const benefitRows = Object.entries(target.plan.benefits).map(([code, meta]) => ({
    id: `${target.orderId}-${code}`,
    action: 'grant',
    benefitCode: code,
    benefitLabel: meta.label,
    courtId: target.keepCourtId,
    createdAt,
    delta: meta.count,
    membershipAccountId: target.accountId,
    membershipOrderId: target.orderId,
    notes: '',
    operator: '管理员',
    reason: '开卡/续充赠送权益',
    relatedDate: purchaseDate,
    unit: meta.unit
  }));

  return { court, account, order, rechargeLedger, bookingLedgers: ledgers, benefitRows };
}

async function main() {
  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    updated: []
  };

  for (const target of TARGETS) {
    const built = await finalizeTarget(target);
    if (WRITE) {
      await putRow(T_COURTS, built.court);
      await putRow(T_MEMBERSHIP_ACCOUNTS, built.account);
      await putRow(T_MEMBERSHIP_ORDERS, built.order);
      await putRow(T_FINANCIAL_LEDGER, built.rechargeLedger);
      for (const row of built.bookingLedgers) await putRow(T_FINANCIAL_LEDGER, row);
      for (const row of built.benefitRows) await putRow(T_MEMBERSHIP_BENEFIT_LEDGER, row);
      await deleteRow(T_COURTS, target.dropCourtId);
    }
    report.updated.push({
      name: target.name,
      keepCourtId: target.keepCourtId,
      dropCourtId: target.dropCourtId,
      balance: built.court.balance,
      totalDeposit: built.court.totalDeposit,
      spentAmount: built.court.spentAmount,
      receivedAmount: built.court.receivedAmount,
      historyCount: built.court.history.length
    });
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'finalize-mabao-zhoutao-viki-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
