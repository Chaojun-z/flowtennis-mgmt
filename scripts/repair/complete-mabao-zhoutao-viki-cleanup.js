const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'complete-mabao-zhoutao-viki-cleanup' });

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

const ZHOUTAO = {
  duplicateCourtId: 'f7bcf070-82fb-4eb4-8a83-8abefc49354d'
};

const VIKI = {
  name: 'viki',
  keepCourtId: '2f383d54-73f1-443a-b171-f0104edaf330',
  duplicateCourtId: 'd2ba0669-a0af-4642-a2aa-fa00a4285fb0',
  phone: '16601175725',
  plan: PLAN_SILVER,
  accountId: 'repair-mabao-account-viki',
  orderId: 'repair-mabao-order-viki-2026-04-25',
  rechargeLedgerId: 'repair-mabao-ledger-viki-recharge',
  openAt: '2026-04-25 20:08',
  notes: '一开始就已经告知',
  bookingRows: [
    { id: 'repair-viki-booking-2026-02-01', date: '2026-02-01', timeRange: '17-18点30分', payMethod: '小程序', amount: 330, note: 'viki定场 / 散客纯定场（小程序） / 小程序' },
    { id: 'repair-viki-booking-2026-02-07', date: '2026-02-07', timeRange: '11-12点', payMethod: '小程序', amount: 220, note: 'viki定场 / 散客纯定场（小程序） / 小程序' },
    { id: 'repair-viki-booking-2026-02-23', date: '2026-02-23', timeRange: '7-8点', payMethod: '小程序', amount: 100, note: 'viki订场 / 散客纯定场（小程序） / 小程序' },
    { id: 'repair-viki-booking-2026-03-22', date: '2026-03-22', timeRange: '7点30分-8点30分', payMethod: '支付宝转账支付', amount: 160, note: 'viki订场 / 散客纯定场（小程序） / 支付宝转账支付' },
    { id: 'repair-viki-booking-2026-03-29', date: '2026-03-29', timeRange: '18-19点', payMethod: '小程序', amount: 220, note: 'viki订场 / 散客纯定场（小程序） / 小程序' }
  ]
};

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

function bookingHistoryRow(item) {
  return {
    id: item.id,
    date: item.date,
    type: '消费',
    category: '订场',
    payMethod: item.payMethod,
    amount: item.amount,
    bonusAmount: 0,
    note: item.note,
    timeRange: item.timeRange
  };
}

function bookingLedgerRow(base, item) {
  const amount = cents(item.amount);
  return {
    id: base.id,
    actionType: '收款',
    actorId: '',
    actorName: item.payMethod === '小程序' ? '小程序' : '管理员',
    businessDate: item.date,
    businessType: '订场',
    cashDelta: amount,
    clubId: 'default',
    createdAt: base.createdAt,
    deferredRevenueDelta: 0,
    entitlementDelta: '',
    idempotencyKey: base.idempotencyKey,
    ledgerType: '历史订场收入',
    notes: item.note,
    openingDeferredRevenueDelta: 0,
    paymentChannel: item.payMethod,
    paymentStatus: 'success',
    productId: '',
    productSnapshotMeta: base.productSnapshotMeta,
    productSnapshotName: '订场',
    productSnapshotPrice: amount,
    reason: '历史订场收入补录',
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

async function buildViki() {
  const keepCourt = await getRow(T_COURTS, VIKI.keepCourtId);
  if (!keepCourt) throw new Error(`未找到 viki 主记录 ${VIKI.keepCourtId}`);
  const purchaseDate = VIKI.openAt.slice(0, 10).replace(/\//g, '-');
  const createdAt = toIso(VIKI.openAt);
  const validUntil = addMonthsKey(purchaseDate, 12);
  const hardExpireAt = addMonthsKey(purchaseDate, 24);

  const history = [
    ...VIKI.bookingRows.map((row) => bookingHistoryRow(row)),
    {
      id: `${VIKI.orderId}-history-recharge`,
      date: purchaseDate,
      type: '充值',
      payMethod: '会员充值',
      category: '会员充值',
      amount: VIKI.plan.rechargeAmount,
      bonusAmount: VIKI.plan.bonusAmount,
      membershipOrderId: VIKI.orderId,
      membershipAccountId: VIKI.accountId,
      membershipPlanId: VIKI.plan.id,
      membershipPlanName: VIKI.plan.name,
      systemAmount: VIKI.plan.rechargeAmount,
      finalAmount: VIKI.plan.rechargeAmount,
      priceOverridden: false,
      overrideReason: '',
      discountRate: VIKI.plan.discountRate,
      originalAmount: 0,
      discountedAmount: 0,
      note: `${VIKI.plan.name}开卡/续充`
    }
  ];

  const court = {
    ...keepCourt,
    id: VIKI.keepCourtId,
    name: VIKI.name,
    phone: VIKI.phone,
    campus: 'mabao',
    joinDate: purchaseDate,
    owner: keepCourt.owner || 'mira',
    notes: '',
    history,
    ...computeCourtFinanceFromHistory(history),
    updatedAt: new Date().toISOString()
  };

  const account = {
    id: VIKI.accountId,
    courtId: VIKI.keepCourtId,
    courtName: VIKI.name,
    phone: VIKI.phone,
    studentIds: [],
    status: 'active',
    memberTag: VIKI.plan.tierCode,
    memberLabel: VIKI.plan.name,
    discountRate: VIKI.plan.discountRate,
    cycleStartDate: purchaseDate,
    validUntil,
    hardExpireAt,
    autoExtended: false,
    lastQualifiedRechargeAmount: VIKI.plan.rechargeAmount,
    lastOrderId: VIKI.orderId,
    notes: '',
    createdAt,
    updatedAt: new Date().toISOString()
  };

  const order = {
    id: VIKI.orderId,
    membershipAccountId: VIKI.accountId,
    courtId: VIKI.keepCourtId,
    courtName: VIKI.name,
    phone: VIKI.phone,
    studentIds: [],
    membershipPlanId: VIKI.plan.id,
    membershipPlanName: VIKI.plan.name,
    priceSource: 'membership_plan',
    priceSourceId: VIKI.plan.id,
    priceSourceName: VIKI.plan.name,
    systemAmount: VIKI.plan.rechargeAmount,
    finalAmount: VIKI.plan.rechargeAmount,
    priceOverridden: false,
    overrideReason: '',
    rechargeAmount: VIKI.plan.rechargeAmount,
    bonusAmount: VIKI.plan.bonusAmount,
    discountRate: VIKI.plan.discountRate,
    purchaseDate,
    effectiveDate: purchaseDate,
    cycleStartDate: purchaseDate,
    validUntil,
    hardExpireAt,
    qualifiesRenewalReset: true,
    planBenefitTemplateSnapshot: VIKI.plan.benefits,
    benefitSnapshot: VIKI.plan.benefits,
    benefitSnapshotCustomized: true,
    benefitValidUntil: validUntil,
    courtHistoryRechargeId: `${VIKI.orderId}-history-recharge`,
    operator: '管理员',
    requestKey: '',
    status: 'active',
    notes: VIKI.notes,
    createdAt,
    updatedAt: new Date().toISOString()
  };

  const rechargeLedger = {
    id: VIKI.rechargeLedgerId,
    actionType: '收款',
    actorId: '',
    actorName: '管理员',
    businessDate: purchaseDate,
    businessType: '会员',
    cashDelta: cents(VIKI.plan.rechargeAmount),
    clubId: 'default',
    createdAt,
    deferredRevenueDelta: cents(VIKI.plan.rechargeAmount),
    entitlementDelta: '',
    idempotencyKey: `membership_order:${VIKI.orderId}:会员充值`,
    ledgerType: '会员充值',
    notes: `${VIKI.notes} | 历史补账`,
    openingDeferredRevenueDelta: 0,
    paymentChannel: '会员充值',
    paymentStatus: 'success',
    productId: VIKI.plan.id,
    productSnapshotMeta: {
      membershipOrderId: VIKI.orderId,
      membershipAccountId: VIKI.accountId,
      courtHistoryRechargeId: `${VIKI.orderId}-history-recharge`,
      rechargeAmount: cents(VIKI.plan.rechargeAmount),
      bonusAmount: cents(VIKI.plan.bonusAmount)
    },
    productSnapshotName: VIKI.plan.name,
    productSnapshotPrice: cents(VIKI.plan.rechargeAmount),
    reason: `${VIKI.plan.name}开卡/续充 | 历史补账`,
    recognizedRevenueDelta: 0,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: VIKI.orderId,
    sourceType: 'membership_order',
    status: 'active',
    tenantId: 'default',
    userId: VIKI.keepCourtId,
    userName: VIKI.name,
    userType: 'court_customer'
  };

  const bookingLedgers = VIKI.bookingRows.map((row) => bookingLedgerRow({
    id: `${row.id}-ledger`,
    idempotencyKey: `${row.id}:history-booking`,
    sourceId: row.id,
    sourceType: 'court_history',
    productSnapshotMeta: {
      courtId: VIKI.keepCourtId,
      historyId: row.id,
      rawCustomerName: `${VIKI.name}订场`,
      rawPaymentMethod: row.payMethod
    },
    userId: VIKI.keepCourtId,
    userName: VIKI.name,
    createdAt
  }, row));

  const benefitRows = Object.entries(VIKI.plan.benefits).map(([code, meta]) => ({
    id: `${VIKI.orderId}-${code}`,
    action: 'grant',
    benefitCode: code,
    benefitLabel: meta.label,
    courtId: VIKI.keepCourtId,
    createdAt,
    delta: meta.count,
    membershipAccountId: VIKI.accountId,
    membershipOrderId: VIKI.orderId,
    notes: '',
    operator: '管理员',
    reason: '开卡/续充赠送权益',
    relatedDate: purchaseDate,
    unit: meta.unit
  }));

  return { court, account, order, rechargeLedger, bookingLedgers, benefitRows };
}

async function main() {
  const viki = await buildViki();
  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    zhoutaoCleanup: {
      duplicateCourtId: ZHOUTAO.duplicateCourtId
    },
    viki: {
      keepCourtId: VIKI.keepCourtId,
      duplicateCourtId: VIKI.duplicateCourtId,
      balance: viki.court.balance,
      totalDeposit: viki.court.totalDeposit,
      spentAmount: viki.court.spentAmount,
      receivedAmount: viki.court.receivedAmount,
      historyCount: viki.court.history.length
    }
  };

  if (WRITE) {
    await deleteRow(T_COURTS, ZHOUTAO.duplicateCourtId);
    await putRow(T_COURTS, viki.court);
    await putRow(T_MEMBERSHIP_ACCOUNTS, viki.account);
    await putRow(T_MEMBERSHIP_ORDERS, viki.order);
    await putRow(T_FINANCIAL_LEDGER, viki.rechargeLedger);
    for (const row of viki.bookingLedgers) await putRow(T_FINANCIAL_LEDGER, row);
    for (const row of viki.benefitRows) await putRow(T_MEMBERSHIP_BENEFIT_LEDGER, row);
    await deleteRow(T_COURTS, VIKI.duplicateCourtId);
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'complete-mabao-zhoutao-viki-cleanup-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
