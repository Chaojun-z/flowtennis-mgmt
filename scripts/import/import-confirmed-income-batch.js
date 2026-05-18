const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'import-confirmed-income-batch' });

const READY_CSV = process.argv.find((arg) => arg.startsWith('--input='))?.split('=')[1]
  || path.join(__dirname, '..', '..', 'docs', 'reports', 'confirmed-income-batch-2026-04-24T09-29-00-ready.csv');
const WRITE = process.argv.includes('--write');
const DRY_RUN = !WRITE;
const IMPORT_BATCH_ID = 'income-import-mabao-2026-01-10-2026-04-16';
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || 0);
const RETRY_COUNT = Number(process.env.INCOME_IMPORT_RETRY_COUNT || 4);
const REQUEST_TIMEOUT_MS = Number(process.env.INCOME_IMPORT_REQUEST_TIMEOUT_MS || 12000);

const T_FINANCIAL_LEDGER = 'ft_financial_ledger';
const T_INCOME_IMPORT_ROWS = 'ft_income_import_rows';
const T_ENTITLEMENTS = 'ft_entitlements';
const T_ENTITLEMENT_LEDGER = 'ft_entitlement_ledger';

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  httpOptions: {
    timeout: REQUEST_TIMEOUT_MS,
    maxSockets: 5
  },
  maxRetries: 3
});

function loadCsv(filePath) {
  const text = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (ch === '"') {
      if (quoted && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (ch === ',' && !quoted) {
      row.push(field);
      field = '';
      continue;
    }
    if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      field = '';
      if (row.some((item) => item !== '')) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    if (row.some((item) => item !== '')) rows.push(row);
  }
  const headers = rows[0] || [];
  return rows.slice(1).map((values) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = values[index] || '';
    });
    return obj;
  }).filter((item) => item['原表行号']);
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(taskName, fn, retries = RETRY_COUNT) {
  let lastError = null;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await sleep(250 * attempt);
    }
  }
  lastError.message = `${taskName} failed after ${retries} attempts: ${lastError.message}`;
  throw lastError;
}

function scan(tableName, limit = 10000) {
  return new Promise((resolve, reject) => {
    const rows = [];
    function next(startKey) {
      client.getRange({
        tableName,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: startKey || [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500
      }, (err, data) => {
        if (err) return reject(err);
        (data.rows || []).forEach((row) => {
          const decoded = decodeRow(row);
          if (decoded) rows.push(decoded);
        });
        if (data.nextStartPrimaryKey && rows.length < limit) return next(data.nextStartPrimaryKey);
        resolve(rows);
      });
    }
    next();
  });
}

async function getRowsByIds(tableName, ids, chunkSize = 20, fetchRow = getRow) {
  const rows = [];
  for (let index = 0; index < ids.length; index += chunkSize) {
    const chunk = ids.slice(index, index + chunkSize);
    const result = [];
    for (const id of chunk) {
      result.push(await fetchRow(tableName, id));
    }
    result.forEach((row) => {
      if (row) rows.push(row);
    });
  }
  return rows;
}

function getRow(tableName, id) {
  return withRetry(`getRow ${tableName}:${id}`, () => new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }] }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  }));
}

function putRow(tableName, id, attrs) {
  return withRetry(`putRow ${tableName}:${id}`, () => new Promise((resolve, reject) => {
    client.putRow({
      tableName,
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  }));
}

function normalizeName(value) {
  const raw = String(value || '').trim();
  const aliases = {
    '于晓溪': '余晓溪',
    '赵新阳': '赵新阳 田秀楠',
    '锤锤': '是锤锤呀',
    '高老师': '高老师（暖暖爸爸）',
    'w.jing': 'W.Jing',
    '纪宁': '纪宁（vii）',
    'J': '·J ·',
    'oliver': 'Oliver',
    '魏平涛': '魏平涛 18600803917',
    'Halena,Willian': 'Halena、Willian',
    'Lam,Loon': 'Lam、Loon'
  };
  return aliases[raw] || raw;
}

function cleanText(value) {
  return String(value || '').toLowerCase().replace(/[\s,，、\\/（）()·]/g, '');
}

function lessonsHint(value) {
  const matched = String(value || '').match(/(10|15|20|50|60)/);
  return matched ? matched[1] : '';
}

function lessonCount(row) {
  const direct = Number(row.lessonCount || 0);
  if (direct > 0) return direct;
  const matched = String(row.packageName || '').match(/扣(\d+(?:\.\d+)?)/);
  if (matched) return Number(matched[1]);
  return 1;
}

function ledgerRowKey(row) {
  const lineNo = String(row['原表行号']);
  const suffix = String(row.splitSuffix || '').trim();
  return suffix ? `${lineNo}-${suffix}` : lineNo;
}

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function inferBusinessType(row) {
  if (row.parseType === 'booking_income') return '订场';
  if (row.parseType === 'dp_coupon') return String(row['收入类型'] || '').includes('定场') ? '订场' : '课程';
  if (
    row.parseType === 'course_income'
    || row.parseType === 'cash_course_income'
    || row.parseType === 'free_course'
    || row.parseType === 'camp_income'
    || row.parseType === 'cross_campus_consume_trace'
  ) return '课程';
  if (row.parseType === 'free_gift' || row.parseType === 'internal_use') return '订场';
  if (row.parseType === 'package_consume') return '课程';
  return '其他';
}

function inferLedgerType(row) {
  const mapping = {
    booking_income: '历史订场收入',
    course_income: '历史课程收入',
    cash_course_income: '历史课程收入',
    dp_coupon: '历史渠道收入',
    free_gift: '历史免费赠送',
    free_course: '历史免费课',
    internal_use: '历史内部占用',
    package_consume: '课包消课',
    camp_income: '历史训练营收入',
    cross_campus_consume_trace: '跨校区课包留痕'
  };
  return mapping[row.parseType] || '历史导入';
}

function inferActionType(row) {
  if (row.parseType === 'package_consume') return '消耗';
  if (
    row.parseType === 'internal_use'
    || row.parseType === 'free_gift'
    || row.parseType === 'free_course'
    || row.parseType === 'cross_campus_consume_trace'
  ) return '留痕';
  return '历史导入';
}

function matchEntitlement(row, entitlements) {
  const targetName = normalizeName(row.studentName);
  const key = cleanText(targetName);
  const byStudent = entitlements.filter((item) => {
    const itemKey = cleanText(item.studentName);
    return itemKey === key || itemKey.includes(key) || key.includes(itemKey);
  });
  let candidates = byStudent;
  const lessonHint = lessonsHint(row.packageName);
  const filtered = byStudent.filter((item) => !lessonHint
    || String(item.totalLessons || '') === lessonHint
    || String(item.packageName || '').includes(lessonHint));
  if (filtered.length) candidates = filtered;
  candidates = candidates.sort((a, b) => {
    const aScore = a.status === 'active' ? 2 : (a.status === 'depleted' ? 1 : 0);
    const bScore = b.status === 'active' ? 2 : (b.status === 'depleted' ? 1 : 0);
    if (aScore !== bScore) return bScore - aScore;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });
  if (candidates.length > 1) {
    const top = candidates[0];
    const samePackage = candidates.slice(1).every((item) => String(item.packageName || '') === String(top.packageName || ''));
    if (samePackage) candidates = [top];
  }
  if (!candidates.length && byStudent.length === 1) candidates = byStudent;
  return candidates.length === 1 ? candidates[0] : null;
}

function buildFinancialLedger(row, importRow, entitlement) {
  const lineNo = ledgerRowKey(row);
  const amount = cents(row.recognizedRevenueDelta || row.cashDelta || 0);
  const cash = cents(row.cashDelta || 0);
  const deferred = cents(row.deferredRevenueDelta || 0);
  const paymentChannel = row.paymentChannel || row['支付方式'] || '';
  const rawCustomerName = row['客户'] || '';
  const userName = row.studentName || rawCustomerName || `历史客户${lineNo}`;
  const userId = entitlement ? entitlement.studentId : `income-import-customer:${lineNo}`;
  const sourceId = entitlement ? `income-import-entitlement-ledger:${lineNo}` : importRow.id;
  const sourceType = entitlement ? 'entitlement_ledger' : 'income_import_row';
  const campusId = row.campusId || 'mabao';
  const campusName = row.campusName || '顺义马坡';
  const accountingScope = row.accountingScope || 'mabao_only';
  return {
    id: `income-import-financial-ledger:${lineNo}`,
    actionType: inferActionType(row),
    accountingScope,
    actorId: '',
    actorName: importRow.rawCollectorName || '系统导入',
    businessDate: importRow.businessDate,
    businessType: inferBusinessType(row),
    campusId,
    campusName,
    cashDelta: cash,
    clubId: 'default',
    createdAt: new Date().toISOString(),
    deferredRevenueDelta: deferred,
    entitlementDelta: entitlement ? String(-lessonCount(row)) : '',
    idempotencyKey: entitlement
      ? `entitlement_ledger:income-import-entitlement-ledger:${lineNo}:课包消课`
      : `income_import_row:${importRow.id}:${inferLedgerType(row)}`,
    ledgerType: inferLedgerType(row),
    notes: `历史收入导入第 ${lineNo} 行 / ${campusName} / ${importRow.rawDateText || ''} / ${importRow.rawTimeText || ''} / ${rawCustomerName} / ${importRow.rawIncomeType || ''} / ${importRow.rawPaymentMethod || ''}${accountingScope !== 'mabao_only' ? ` / ${accountingScope}` : ''}`,
    openingDeferredRevenueDelta: 0,
    paymentChannel,
    paymentStatus: 'success',
    productId: entitlement ? entitlement.packageId || '' : '',
    productSnapshotMeta: {
      sourceRowNumber: Number(lineNo),
      rawDateText: importRow.rawDateText || '',
      rawTimeText: importRow.rawTimeText || '',
      rawCustomerName,
      rawIncomeType: importRow.rawIncomeType || '',
      rawPaymentMethod: importRow.rawPaymentMethod || '',
      rawReceivableAmountText: importRow.rawReceivableAmountText || '',
      rawActualAmountText: importRow.rawActualAmountText || '',
      rawDifferenceReason: importRow.rawDifferenceReason || '',
      rawCollectorName: importRow.rawCollectorName || '',
      rawNotes: importRow.rawNotes || '',
      campusId,
      campusName,
      accountingScope,
      match: entitlement ? {
        entitlementId: entitlement.id,
        purchaseId: entitlement.purchaseId || '',
        lessonDelta: -lessonCount(row)
      } : null
    },
    productSnapshotName: entitlement ? entitlement.packageName || '' : (importRow.rawIncomeType || ''),
    productSnapshotPrice: amount,
    reason: entitlement ? '历史收入导入课包划扣' : (cash > 0 ? '历史收入导入' : '历史收入导入留痕'),
    recognizedRevenueDelta: amount,
    reversalOfLedgerId: '',
    reversedByLedgerId: '',
    salesChannel: '',
    sourceId,
    sourceType,
    status: 'active',
    tenantId: 'default',
    userId,
    userName,
    userType: entitlement ? 'student' : 'temporary'
  };
}

function buildEntitlementLedger(row, importRow, entitlement) {
  const lineNo = ledgerRowKey(row);
  return {
    id: `income-import-entitlement-ledger:${lineNo}`,
    entitlementId: entitlement.id,
    purchaseId: entitlement.purchaseId || '',
    scheduleId: '',
    studentId: entitlement.studentId,
    lessonDelta: -lessonCount(row),
    action: 'income_import',
    reason: '历史收入导入课包划扣',
    notes: `历史收入导入第 ${lineNo} 行 / ${importRow.rawDateText || ''} / ${importRow.rawTimeText || ''} / ${importRow.rawCustomerName || ''} / ${importRow.rawIncomeType || ''} / ${importRow.rawPaymentMethod || ''}`,
    operator: importRow.rawCollectorName || '系统导入',
    createdAt: new Date().toISOString(),
    relatedDate: importRow.businessDate,
    sourceRowNumber: Number(lineNo)
  };
}

function parseSplitLessonCount(text) {
  const matched = String(text || '').match(/扣\s*(\d+(?:\.\d+)?)/);
  return matched ? Number(matched[1]) : 1;
}

function parseMultiPackageSplitRows(row) {
  const answer = String(row['你的回答'] || '').trim();
  if (!answer) return [];
  const lines = answer
    .split(/\r?\n/)
    .map((item) => String(item || '').trim())
    .filter(Boolean);
  if (!lines.length) return [];
  const totalRecognized = Number(row.recognizedRevenueDelta || row.cashDelta || 0);
  const perAmount = lines.length ? totalRecognized / lines.length : totalRecognized;
  return lines.map((line, index) => {
    const parts = line.includes('/') ? line.split('/') : line.split(/[，,]/);
    const studentName = String(parts[0] || '').trim();
    const packageName = String(parts[1] || '').trim();
    const lessonDelta = parseSplitLessonCount(line);
    return {
      ...row,
      parseType: 'package_consume',
      splitSuffix: String(index + 1),
      studentName,
      packageName,
      lessonCount: lessonDelta,
      cashDelta: 0,
      recognizedRevenueDelta: perAmount,
      deferredRevenueDelta: -perAmount,
      note: `拆分导入：${line}`
    };
  });
}

function buildImportRowUpdate(importRow, row, createdLedgerIds, createdBusinessIds) {
  return {
    ...importRow,
    importStatus: 'imported',
    importedAt: new Date().toISOString(),
    importMode: row.parseType === 'package_consume' ? 'history_entitlement_consume' : 'history_financial_import',
    createdLedgerIds,
    createdBusinessIds,
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const batchRows = loadCsv(READY_CSV);
  const entitlements = await scan(T_ENTITLEMENTS, 3000);

  const stats = {
    total: batchRows.length,
    skippedAlreadyImported: 0,
    packageRows: 0,
    financialOnlyRows: 0,
    unresolved: [],
    writes: {
      financialLedger: 0,
      entitlementLedger: 0,
      importRows: 0
    },
    processedThisRun: 0
  };

  for (const row of batchRows) {
    if (LIMIT > 0 && stats.processedThisRun >= LIMIT) break;
    const lineNo = String(row['原表行号']);
    const importRow = await getRow(T_INCOME_IMPORT_ROWS, `${IMPORT_BATCH_ID}:${lineNo}`);
    if (!importRow) {
      stats.unresolved.push({ lineNo, reason: '找不到对应 ft_income_import_rows' });
      continue;
    }
    if (importRow.importStatus === 'imported') {
      stats.skippedAlreadyImported += 1;
      continue;
    }

    const splitRows = row.parseType === 'multi_package_split' ? parseMultiPackageSplitRows(row) : [row];
    if (row.parseType === 'multi_package_split' && !splitRows.length) {
      stats.unresolved.push({ lineNo, reason: '拆分行未识别出有效子项' });
      continue;
    }

    const preparedRows = [];
    let hasPackage = false;
    for (const currentRow of splitRows) {
      let entitlement = null;
      let entitlementLedger = null;
      if (currentRow.parseType === 'package_consume') {
        hasPackage = true;
        entitlement = matchEntitlement(currentRow, entitlements);
        if (!entitlement) {
          stats.unresolved.push({
            lineNo,
            reason: '课包划扣找不到唯一 entitlement',
            studentName: currentRow.studentName,
            packageName: currentRow.packageName
          });
          preparedRows.length = 0;
          break;
        }
        entitlementLedger = buildEntitlementLedger(currentRow, importRow, entitlement);
      }
      preparedRows.push({
        currentRow,
        entitlement,
        entitlementLedger,
        financialLedger: buildFinancialLedger(currentRow, importRow, entitlement)
      });
    }
    if (!preparedRows.length) continue;
    if (hasPackage) stats.packageRows += preparedRows.length;
    else stats.financialOnlyRows += preparedRows.length;

    const nextImportRow = buildImportRowUpdate(
      importRow,
      row,
      preparedRows.flatMap((item) => item.entitlementLedger ? [item.financialLedger.id, item.entitlementLedger.id] : [item.financialLedger.id]),
      preparedRows.flatMap((item) => item.entitlementLedger ? [item.entitlementLedger.id] : [])
    );

    if (!DRY_RUN) {
      for (const item of preparedRows) {
        if (item.entitlementLedger) {
          const existingEntitlementLedger = await getRow(T_ENTITLEMENT_LEDGER, item.entitlementLedger.id);
          if (!existingEntitlementLedger) {
            await putRow(T_ENTITLEMENT_LEDGER, item.entitlementLedger.id, item.entitlementLedger);
            stats.writes.entitlementLedger += 1;
          }
        }
        const existingFinancialLedger = await getRow(T_FINANCIAL_LEDGER, item.financialLedger.id);
        if (!existingFinancialLedger) {
          await putRow(T_FINANCIAL_LEDGER, item.financialLedger.id, item.financialLedger);
          stats.writes.financialLedger += 1;
        }
      }

      await putRow(T_INCOME_IMPORT_ROWS, importRow.id, nextImportRow);
      stats.writes.importRows += 1;
      stats.processedThisRun += 1;
    } else {
      for (const item of preparedRows) {
        if (item.entitlementLedger) stats.writes.entitlementLedger += 1;
        stats.writes.financialLedger += 1;
      }
      stats.writes.importRows += 1;
      stats.processedThisRun += 1;
    }
  }

  console.log(JSON.stringify({ dryRun: DRY_RUN, ...stats }, null, 2));
  if (stats.unresolved.length) process.exitCode = 2;
}

if (require.main === module) {
  main()
    .then(() => {
      process.exit(process.exitCode || 0);
    })
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = {
  _test: {
    withRetry,
    getRowsByIds,
    inferBusinessType,
    buildFinancialLedger,
    parseMultiPackageSplitRows
  }
};
