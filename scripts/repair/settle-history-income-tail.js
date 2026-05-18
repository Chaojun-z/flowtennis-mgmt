const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'settle-history-income-tail' });

const WRITE = process.argv.includes('--write');
const BATCH_ID = 'income-import-mabao-2026-01-10-2026-04-16';
const T_FINANCIAL_LEDGER = 'ft_financial_ledger';
const T_INCOME_IMPORT_ROWS = 'ft_income_import_rows';
const T_ENTITLEMENTS = 'ft_entitlements';
const T_ENTITLEMENT_LEDGER = 'ft_entitlement_ledger';
const T_PURCHASES = 'ft_purchases';

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

function getRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }] }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  });
}

function putRow(tableName, id, attrs) {
  return new Promise((resolve, reject) => {
    client.putRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function scan(tableName, limit = 5000) {
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

function centsToYuan(cents) {
  return Number(cents || 0) / 100;
}

function parseDuration(rawTimeText) {
  const text = String(rawTimeText || '').trim();
  const matched = text.match(/(\d{1,2})(?:点(?:(\d{1,2})分)?)?\s*[-—]\s*(\d{1,2})(?:点(?:(\d{1,2})分)?)?/);
  if (!matched) return 1;
  const startHour = Number(matched[1]);
  const startMinute = Number(matched[2] || 0);
  const endHour = Number(matched[3]);
  const endMinute = Number(matched[4] || 0);
  const hours = ((endHour * 60 + endMinute) - (startHour * 60 + startMinute)) / 60;
  return hours > 0 ? hours : 1;
}

function roundToHalf(value) {
  return Math.round(value * 2) / 2;
}

function pickLessonCount(amountYuan, purchase, rawTimeText) {
  if (!purchase) return parseDuration(rawTimeText);
  const packageLessons = Number(purchase.packageLessons || 0);
  const amountPaid = Number(purchase.finalAmount || purchase.amountPaid || 0);
  const unitPrice = packageLessons > 0 ? amountPaid / packageLessons : 0;
  if (unitPrice > 0) {
    const guessed = roundToHalf(amountYuan / unitPrice);
    if (Math.abs(guessed * unitPrice - amountYuan) <= 0.1) return guessed;
  }
  return parseDuration(rawTimeText);
}

function baseFinancialLedger(importRow, lineNo, extras = {}) {
  const notes = extras.notes || `历史收入导入第 ${lineNo} 行 / 顺义马坡 / ${importRow.rawDateText || ''} / ${importRow.rawTimeText || ''} / ${importRow.rawCustomerName || ''} / ${importRow.rawIncomeType || ''} / ${importRow.rawPaymentMethod || ''}`;
  return {
    id: `income-import-financial-ledger:${lineNo}`,
    actionType: extras.actionType || '历史导入',
    accountingScope: extras.accountingScope || 'mabao_only',
    actorId: '',
    actorName: importRow.rawCollectorName || '系统导入',
    businessDate: importRow.businessDate,
    businessType: extras.businessType || '其他',
    campusId: 'mabao',
    campusName: '顺义马坡',
    cashDelta: String(extras.cashDelta ?? 0),
    clubId: 'default',
    createdAt: new Date().toISOString(),
    deferredRevenueDelta: String(extras.deferredRevenueDelta ?? 0),
    entitlementDelta: extras.entitlementDelta ?? '',
    idempotencyKey: extras.idempotencyKey || `income_import_row:${importRow.id}:${extras.ledgerType || '历史导入'}`,
    ledgerType: extras.ledgerType || '历史导入',
    notes,
    openingDeferredRevenueDelta: 0,
    paymentChannel: extras.paymentChannel || importRow.rawPaymentMethod || '',
    paymentStatus: 'success',
    productId: extras.productId || '',
    productSnapshotMeta: {
      sourceRowNumber: importRow.sourceRowNumber,
      rawDateText: importRow.rawDateText || '',
      rawTimeText: importRow.rawTimeText || '',
      rawCustomerName: importRow.rawCustomerName || '',
      rawIncomeType: importRow.rawIncomeType || '',
      rawPaymentMethod: importRow.rawPaymentMethod || '',
      rawReceivableAmountText: importRow.rawReceivableAmountText || '',
      rawActualAmountText: importRow.rawActualAmountText || '',
      rawCollectorName: importRow.rawCollectorName || '',
      rawNotes: importRow.rawNotes || '',
      tailSettlement: true,
      ...extras.productSnapshotMeta
    },
    productSnapshotName: extras.productSnapshotName || importRow.rawIncomeType || '',
    productSnapshotPrice: String(extras.productSnapshotPrice ?? 0),
    reason: extras.reason || '历史收入尾差收口',
    recognizedRevenueDelta: String(extras.recognizedRevenueDelta ?? 0),
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId: extras.sourceId || importRow.id,
    sourceType: extras.sourceType || 'income_import_row',
    status: 'active',
    tenantId: 'default',
    userId: extras.userId || `income-import-customer:${lineNo}`,
    userName: extras.userName || importRow.rawCustomerName || `历史客户${lineNo}`,
    userType: extras.userType || 'temporary'
  };
}

function entitlementLedger(importRow, lineNo, entitlement, lessonCount) {
  return {
    id: `income-import-entitlement-ledger:${lineNo}`,
    entitlementId: entitlement.id,
    purchaseId: entitlement.purchaseId || '',
    scheduleId: '',
    studentId: entitlement.studentId,
    lessonDelta: -lessonCount,
    action: 'income_import',
    reason: '历史收入尾差收口',
    notes: `历史收入导入第 ${lineNo} 行 / ${importRow.rawDateText || ''} / ${importRow.rawTimeText || ''} / ${importRow.rawCustomerName || ''}`,
    operator: importRow.rawCollectorName || '系统导入',
    createdAt: new Date().toISOString(),
    relatedDate: importRow.businessDate,
    sourceRowNumber: Number(lineNo)
  };
}

const packageRules = {
  1098: { entitlementId: 'seed-entitlement-002' },
  1132: { entitlementId: 'seed-entitlement-020' },
  1166: { entitlementId: 'seed-renewal-entitlement-006' },
  1191: { entitlementId: 'seed-renewal-entitlement-007' },
  1192: { entitlementId: 'seed-entitlement-027' },
  1193: { entitlementId: 'seed-entitlement-028' },
  1194: { entitlementId: 'seed-entitlement-032' },
  1197: { entitlementId: 'seed-entitlement-003' },
  1214: { entitlementId: 'seed-renewal-entitlement-006' },
  1239: { entitlementId: 'seed-entitlement-020' },
  1287: { entitlementId: 'seed-entitlement-038' },
  1289: { entitlementId: 'seed-entitlement-029' },
  1300: { entitlementId: 'seed-renewal-entitlement-007' },
  1301: { entitlementId: 'seed-entitlement-027' },
  1302: { entitlementId: 'seed-entitlement-028' },
  1303: { entitlementId: 'seed-entitlement-038' },
  1313: { entitlementId: 'seed-renewal-entitlement-006' },
  1330: { entitlementId: 'seed-entitlement-022' },
  1331: { entitlementId: 'seed-entitlement-038' },
  1335: { entitlementId: 'seed-entitlement-040' },
  1345: { entitlementId: 'seed-entitlement-020' },
  1373: { entitlementId: 'seed-entitlement-022' },
  1376: { entitlementId: 'seed-entitlement-038' },
  1377: { entitlementId: 'seed-renewal-entitlement-007' },
  1378: { entitlementId: 'seed-entitlement-040' },
  1390: { entitlementId: 'seed-renewal-entitlement-006' },
  1395: { entitlementId: 'seed-entitlement-038' },
  1396: { entitlementId: 'seed-renewal-entitlement-007' },
  1397: { entitlementId: 'seed-entitlement-027' },
  1398: { entitlementId: 'seed-entitlement-028' },
  1415: { entitlementId: 'seed-renewal-entitlement-006' }
};

const bookingStoredValueRows = new Set([1198, 1237]);
const zeroTraceRows = {
  1238: { ledgerType: '历史免费赠送', actionType: '留痕', businessType: '课程', reason: '取消课程场地未取消', note: '取消课程，场地未取消，按0元留痕' },
  1240: { ledgerType: '历史内部占用', actionType: '留痕', businessType: '课程', reason: '忘记取消场地', note: '撺班未成，场地忘取消，按0元留痕' },
  1266: { ledgerType: '历史免费课', actionType: '留痕', businessType: '课程', reason: '陪打不收费', note: 'siren生病临时取消私教课，小舟陪打不收费' },
  1292: { ledgerType: '历史内部占用', actionType: '留痕', businessType: '课程', reason: '团队训练0元留痕', note: '团队训练，原表0元，按0元留痕' },
  1407: { ledgerType: '历史内部占用', actionType: '留痕', businessType: '订场', reason: '清洗场地', note: '清洗场地，0元内部占用' },
  1424: { ledgerType: '历史内部占用', actionType: '留痕', businessType: '订场', reason: '清洗场地', note: '清洗场地，0元内部占用' }
};

const skipRows = {
  1109: '原表没有收款方式和实收，不入账，先标记跳过',
  1128: '原表没有收款方式和实收，不入账，先标记跳过',
  1425: '空白尾行',
  1426: '空白尾行',
  1427: '空白尾行',
  1428: '空白尾行'
};

async function main() {
  const [entitlements, purchases] = await Promise.all([
    scan(T_ENTITLEMENTS, 5000),
    scan(T_PURCHASES, 5000)
  ]);
  const entitlementMap = new Map(entitlements.map((row) => [String(row.id), row]));
  const purchaseMap = new Map(purchases.map((row) => [String(row.id), row]));
  const rowNos = [
    1098, 1109, 1128, 1132, 1166, 1191, 1192, 1193, 1194, 1197,
    1198, 1214, 1237, 1238, 1239, 1240, 1266, 1287, 1289, 1292,
    1300, 1301, 1302, 1303, 1313, 1330, 1331, 1335, 1345, 1373,
    1376, 1377, 1378, 1390, 1395, 1396, 1397, 1398, 1407, 1415,
    1424, 1425, 1426, 1427, 1428
  ];

  const stats = { dryRun: !WRITE, imported: [], skipped: [], unresolved: [] };

  for (const rowNo of rowNos) {
    const importRow = await getRow(T_INCOME_IMPORT_ROWS, `${BATCH_ID}:${rowNo}`);
    if (!importRow) {
      stats.unresolved.push({ rowNo, reason: '找不到导入行' });
      continue;
    }
    if (importRow.importStatus === 'imported') {
      stats.imported.push({ rowNo, mode: 'already_imported' });
      continue;
    }
    if (skipRows[rowNo]) {
      const nextRow = {
        ...importRow,
        importStatus: 'skipped',
        reviewReason: skipRows[rowNo],
        updatedAt: new Date().toISOString()
      };
      if (WRITE) await putRow(T_INCOME_IMPORT_ROWS, importRow.id, nextRow);
      stats.skipped.push({ rowNo, reason: skipRows[rowNo] });
      continue;
    }

    if (packageRules[rowNo]) {
      const entitlement = entitlementMap.get(packageRules[rowNo].entitlementId);
      if (!entitlement) {
        stats.unresolved.push({ rowNo, reason: '找不到 entitlement', entitlementId: packageRules[rowNo].entitlementId });
        continue;
      }
      const purchase = purchaseMap.get(String(entitlement.purchaseId || ''));
      const amountYuan = centsToYuan(importRow.actualAmountCents || importRow.receivableAmountCents || 0);
      const lessonCount = pickLessonCount(amountYuan, purchase, importRow.rawTimeText);
      const entitlementRow = entitlementLedger(importRow, rowNo, entitlement, lessonCount);
      const financialRow = baseFinancialLedger(importRow, rowNo, {
        actionType: '消耗',
        businessType: '课程',
        ledgerType: '课包消课',
        paymentChannel: '课包划扣',
        cashDelta: 0,
        recognizedRevenueDelta: importRow.actualAmountCents || importRow.receivableAmountCents || 0,
        deferredRevenueDelta: -(importRow.actualAmountCents || importRow.receivableAmountCents || 0),
        entitlementDelta: String(-lessonCount),
        productId: entitlement.packageId || '',
        productSnapshotName: entitlement.packageName || importRow.rawIncomeType || '',
        productSnapshotPrice: importRow.actualAmountCents || importRow.receivableAmountCents || 0,
        reason: '历史收入尾差收口-课包消课',
        sourceId: entitlementRow.id,
        sourceType: 'entitlement_ledger',
        userId: entitlement.studentId,
        userName: entitlement.studentName,
        userType: 'student',
        idempotencyKey: `entitlement_ledger:${entitlementRow.id}:课包消课`,
        productSnapshotMeta: {
          entitlementId: entitlement.id,
          purchaseId: entitlement.purchaseId || '',
          lessonDelta: -lessonCount
        }
      });
      const nextRow = {
        ...importRow,
        importStatus: 'imported',
        importMode: 'history_entitlement_consume',
        importedAt: new Date().toISOString(),
        createdLedgerIds: [financialRow.id, entitlementRow.id],
        createdBusinessIds: [entitlementRow.id],
        updatedAt: new Date().toISOString()
      };
      if (WRITE) {
        const existingEntitlement = await getRow(T_ENTITLEMENT_LEDGER, entitlementRow.id);
        if (!existingEntitlement) await putRow(T_ENTITLEMENT_LEDGER, entitlementRow.id, entitlementRow);
        const existingFinancial = await getRow(T_FINANCIAL_LEDGER, financialRow.id);
        if (!existingFinancial) await putRow(T_FINANCIAL_LEDGER, financialRow.id, financialRow);
        await putRow(T_INCOME_IMPORT_ROWS, importRow.id, nextRow);
      }
      stats.imported.push({ rowNo, mode: 'package', entitlementId: entitlement.id, lessonCount });
      continue;
    }

    if (bookingStoredValueRows.has(rowNo)) {
      const amount = importRow.actualAmountCents || importRow.receivableAmountCents || 0;
      const financialRow = baseFinancialLedger(importRow, rowNo, {
        actionType: '消耗',
        businessType: '订场',
        ledgerType: '历史储值扣款',
        paymentChannel: '储值扣款',
        cashDelta: 0,
        recognizedRevenueDelta: amount,
        deferredRevenueDelta: -amount,
        productSnapshotName: '订场储值扣款',
        productSnapshotPrice: amount,
        reason: '历史收入尾差收口-储值订场'
      });
      const nextRow = {
        ...importRow,
        importStatus: 'imported',
        importMode: 'history_financial_import',
        importedAt: new Date().toISOString(),
        createdLedgerIds: [financialRow.id],
        createdBusinessIds: [],
        updatedAt: new Date().toISOString()
      };
      if (WRITE) {
        const existingFinancial = await getRow(T_FINANCIAL_LEDGER, financialRow.id);
        if (!existingFinancial) await putRow(T_FINANCIAL_LEDGER, financialRow.id, financialRow);
        await putRow(T_INCOME_IMPORT_ROWS, importRow.id, nextRow);
      }
      stats.imported.push({ rowNo, mode: 'stored_value_booking' });
      continue;
    }

    if (zeroTraceRows[rowNo]) {
      const rule = zeroTraceRows[rowNo];
      const financialRow = baseFinancialLedger(importRow, rowNo, {
        actionType: rule.actionType,
        businessType: rule.businessType,
        ledgerType: rule.ledgerType,
        paymentChannel: '',
        cashDelta: 0,
        recognizedRevenueDelta: 0,
        deferredRevenueDelta: 0,
        productSnapshotName: rule.ledgerType,
        productSnapshotPrice: 0,
        reason: rule.reason,
        notes: `${rule.note} / 历史收入导入第 ${rowNo} 行`
      });
      const nextRow = {
        ...importRow,
        importStatus: 'imported',
        importMode: 'history_financial_import',
        importedAt: new Date().toISOString(),
        createdLedgerIds: [financialRow.id],
        createdBusinessIds: [],
        updatedAt: new Date().toISOString()
      };
      if (WRITE) {
        const existingFinancial = await getRow(T_FINANCIAL_LEDGER, financialRow.id);
        if (!existingFinancial) await putRow(T_FINANCIAL_LEDGER, financialRow.id, financialRow);
        await putRow(T_INCOME_IMPORT_ROWS, importRow.id, nextRow);
      }
      stats.imported.push({ rowNo, mode: 'zero_trace' });
      continue;
    }

    stats.unresolved.push({ rowNo, reason: '没有命中收尾规则' });
  }

  console.log(JSON.stringify(stats, null, 2));
  if (stats.unresolved.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
