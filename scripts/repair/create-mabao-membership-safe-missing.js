const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'create-mabao-membership-safe-missing' });

const WRITE = process.argv.includes('--write');
const reportDir = path.join(__dirname, '..', '..', 'docs', 'reports');

const T_COURTS = 'ft_courts';
const T_MEMBERSHIP_ACCOUNTS = 'ft_membership_accounts';
const T_MEMBERSHIP_ORDERS = 'ft_membership_orders';
const T_MEMBERSHIP_BENEFIT_LEDGER = 'ft_membership_benefit_ledger';
const T_FINANCIAL_LEDGER = 'ft_financial_ledger';

const PLAN_ID_GOLD = 'f6996b4e-524f-4d58-8e84-764746bde79a';
const PLAN_NAME_GOLD = '马坡订场会员';

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
    name: '曹',
    phone: '13401030401',
    firstOpenAt: '2026-04-20 22:11',
    courtId: 'db914eee-2036-4018-afd0-6458e5caae86',
    accountId: 'repair-mabao-account-cao',
    orderId: 'repair-mabao-order-cao-2026-04-20',
    ledgerId: 'repair-mabao-ledger-cao-2026-04-20',
    historyId: 'repair-mabao-history-cao-2026-04-20',
    notes: '一开始就已经告知'
  },
  {
    name: '雨辰',
    phone: '13910789024',
    firstOpenAt: '2026-04-21 18:49',
    courtId: 'repair-mabao-court-yuchen',
    accountId: 'repair-mabao-account-yuchen',
    orderId: 'repair-mabao-order-yuchen-2026-04-21',
    ledgerId: 'repair-mabao-ledger-yuchen-2026-04-21',
    historyId: 'repair-mabao-history-yuchen-2026-04-21',
    notes: '一开始就已经告知'
  },
  {
    name: '水映山影',
    phone: '13621226438',
    firstOpenAt: '2026-04-25 13:33',
    courtId: 'repair-mabao-court-shuiyingshanying',
    accountId: 'repair-mabao-account-shuiyingshanying',
    orderId: 'repair-mabao-order-shuiyingshanying-2026-04-25',
    ledgerId: 'repair-mabao-ledger-shuiyingshanying-2026-04-25',
    historyId: 'repair-mabao-history-shuiyingshanying-2026-04-25',
    notes: '一开始就已经告知'
  }
];

function cents(value) {
  return Math.round((Number(value) || 0) * 100);
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

async function main() {
  const report = {
    executedAt: new Date().toISOString(),
    write: WRITE,
    created: []
  };

  for (const item of TARGETS) {
    const purchaseDate = item.firstOpenAt.slice(0, 10).replace(/\//g, '-');
    const createdAt = toIso(item.firstOpenAt);
    const validUntil = addMonthsKey(purchaseDate, 12);
    const hardExpireAt = addMonthsKey(purchaseDate, 24);
    const existingCourt = await getRow(T_COURTS, item.courtId).catch(() => null);
    const court = {
      ...(existingCourt || {}),
      id: item.courtId,
      name: item.name,
      phone: item.phone,
      campus: 'mabao',
      joinDate: purchaseDate,
      recentFollowUpDate: '',
      nextFollowUpDate: '',
      owner: '',
      depositAttitude: '',
      familiarity: '',
      notes: existingCourt?.notes || '',
      status: 'active',
      history: [
        {
          id: item.historyId,
          date: purchaseDate,
          type: '充值',
          payMethod: '会员充值',
          category: '会员充值',
          amount: 5000,
          bonusAmount: 498,
          membershipOrderId: item.orderId,
          membershipAccountId: item.accountId,
          membershipPlanId: PLAN_ID_GOLD,
          membershipPlanName: PLAN_NAME_GOLD,
          systemAmount: 5000,
          finalAmount: 5000,
          priceOverridden: false,
          overrideReason: '',
          discountRate: 0.8,
          originalAmount: 0,
          discountedAmount: 0,
          note: `${PLAN_NAME_GOLD}开卡/续充`
        }
      ],
      balance: 5498,
      totalDeposit: 5000,
      spentAmount: 0,
      receivedAmount: 5000,
      storedValueSpent: 0,
      directPaidSpent: 0,
      updatedAt: new Date().toISOString()
    };
    const account = {
      id: item.accountId,
      courtId: item.courtId,
      courtName: item.name,
      phone: item.phone,
      studentIds: [],
      status: 'active',
      memberTag: '黄金卡',
      memberLabel: PLAN_NAME_GOLD,
      discountRate: 0.8,
      cycleStartDate: purchaseDate,
      validUntil,
      hardExpireAt,
      autoExtended: false,
      lastQualifiedRechargeAmount: 5000,
      lastOrderId: item.orderId,
      notes: '',
      createdAt,
      updatedAt: new Date().toISOString()
    };
    const order = {
      id: item.orderId,
      membershipAccountId: item.accountId,
      courtId: item.courtId,
      courtName: item.name,
      phone: item.phone,
      studentIds: [],
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
      bonusAmount: 498,
      discountRate: 0.8,
      purchaseDate,
      effectiveDate: purchaseDate,
      cycleStartDate: purchaseDate,
      validUntil,
      hardExpireAt,
      qualifiesRenewalReset: true,
      planBenefitTemplateSnapshot: {
        publicLesson: { label: '大师公开课', unit: '次', count: 6 },
        stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
        ballMachine: { label: '发球机免费', unit: '次', count: 6 },
        level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
      },
      benefitSnapshot: {
        publicLesson: { label: '大师公开课', unit: '次', count: 6 },
        stringingLabor: { label: '穿线免手工费', unit: '次', count: 5 },
        ballMachine: { label: '发球机免费', unit: '次', count: 6 },
        level2Partner: { label: '国家二级运动员陪打', unit: '次', count: 2 }
      },
      benefitSnapshotCustomized: true,
      benefitValidUntil: validUntil,
      courtHistoryRechargeId: item.historyId,
      operator: '管理员',
      requestKey: '',
      status: 'active',
      notes: item.notes,
      createdAt,
      updatedAt: new Date().toISOString()
    };
    const ledger = {
      id: item.ledgerId,
      actionType: '收款',
      actorId: '',
      actorName: '管理员',
      businessDate: purchaseDate,
      businessType: '会员',
      cashDelta: cents(5000),
      clubId: 'default',
      createdAt,
      deferredRevenueDelta: cents(5000),
      entitlementDelta: '',
      idempotencyKey: `membership_order:${item.orderId}:会员充值`,
      ledgerType: '会员充值',
      notes: `${item.notes} | 历史补账`,
      openingDeferredRevenueDelta: 0,
      paymentChannel: '会员充值',
      paymentStatus: 'success',
      productId: PLAN_ID_GOLD,
      productSnapshotMeta: {
        membershipOrderId: item.orderId,
        membershipAccountId: item.accountId,
        courtHistoryRechargeId: item.historyId,
        rechargeAmount: cents(5000),
        bonusAmount: cents(498)
      },
      productSnapshotName: PLAN_NAME_GOLD,
      productSnapshotPrice: cents(5000),
      reason: `${PLAN_NAME_GOLD}开卡/续充 | 历史补账`,
      recognizedRevenueDelta: 0,
      reversalOfLedgerId: '',
      reversedByLedgerId: '',
      salesChannel: '',
      sourceId: item.orderId,
      sourceType: 'membership_order',
      status: 'active',
      tenantId: 'default',
      userId: item.courtId,
      userName: item.name,
      userType: 'court_customer'
    };
    const benefitRows = [
      ['publicLesson', '大师公开课', 6],
      ['stringingLabor', '穿线免手工费', 5],
      ['ballMachine', '发球机免费', 6],
      ['level2Partner', '国家二级运动员陪打', 2]
    ].map(([code, label, delta]) => ({
      id: `${item.orderId}-${code}`,
      action: 'grant',
      benefitCode: code,
      benefitLabel: label,
      courtId: item.courtId,
      createdAt,
      delta,
      membershipAccountId: item.accountId,
      membershipOrderId: item.orderId,
      notes: '',
      operator: '管理员',
      reason: '开卡/续充赠送权益',
      relatedDate: purchaseDate,
      unit: '次'
    }));
    if (WRITE) {
      await putRow(T_COURTS, court);
      await putRow(T_MEMBERSHIP_ACCOUNTS, account);
      await putRow(T_MEMBERSHIP_ORDERS, order);
      await putRow(T_FINANCIAL_LEDGER, ledger);
      for (const row of benefitRows) await putRow(T_MEMBERSHIP_BENEFIT_LEDGER, row);
    }
    report.created.push({ name: item.name, courtId: item.courtId, orderId: item.orderId, balance: court.balance });
  }

  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(path.join(reportDir, 'create-mabao-membership-safe-missing-result.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
