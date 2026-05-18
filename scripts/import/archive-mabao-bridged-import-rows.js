const fs = require('fs');
const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'archive-mabao-bridged-import-rows' });

const RAW_CSV = process.argv.find((arg) => arg.startsWith('--raw='))?.split('=')[1]
  || path.join(__dirname, '..', '..', 'docs', 'reports', '1-ready.csv');
const BRIDGED_CSV = process.argv.find((arg) => arg.startsWith('--bridged='))?.split('=')[1]
  || path.join(__dirname, '..', '..', 'docs', 'reports', '1-ready-ready.csv');
const WRITE = process.argv.includes('--write');
const DRY_RUN = !WRITE;
const ONLY_LINES = new Set(
  String(process.argv.find((arg) => arg.startsWith('--only-lines='))?.split('=')[1] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
);
const BATCH_ID = 'income-import-mabao-2026-01-10-2026-04-16';
const T_INCOME_IMPORT_ROWS = 'ft_income_import_rows';

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
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

function scan(tableName, limit = 20000) {
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
      condition: new TableStore.Condition(TableStore.RowExistenceExpectation.EXPECT_NOT_EXIST, null),
      primaryKey: [{ id: String(id) }],
      attributeColumns: Object.entries(attrs)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => ({ [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '') }))
    }, (err, data) => (err ? reject(err) : resolve(data)));
  });
}

function cents(value) {
  return Math.round(Number(value || 0) * 100);
}

function normalizePaymentMethod(value) {
  const text = String(value || '').trim();
  if (text.includes('小程序')) return '小程序';
  if (text.includes('微信')) return '微信';
  if (text.includes('支付宝')) return '支付宝';
  if (text.includes('转账')) return '转账';
  if (text.includes('大众点评')) return '大众点评';
  if (text.includes('储值')) return '储值卡';
  return text;
}

function plannedTargetForRow(row) {
  const parseType = String(row.parseType || '').trim();
  if (['booking_income', 'free_gift', 'free_course', 'internal_use'].includes(parseType)) return 'court_history';
  if (parseType === 'package_consume') return 'entitlement_ledger';
  return 'course_income';
}

function ledgerPreviewForRow(row) {
  const parseType = String(row.parseType || '').trim();
  const ledgerTypeMap = {
    booking_income: '历史订场收入',
    course_income: '历史课程收入',
    camp_income: '历史训练营收入',
    dp_coupon: '历史渠道收入',
    free_gift: '历史免费赠送',
    free_course: '历史免费课',
    internal_use: '历史内部占用',
    package_consume: '课包消课',
    cross_campus_consume_trace: '跨校区课包留痕'
  };
  return {
    cashDelta: cents(row.cashDelta || 0),
    recognizedRevenueDelta: cents(row.recognizedRevenueDelta || 0),
    deferredRevenueDelta: cents(row.deferredRevenueDelta || 0),
    ledgerType: ledgerTypeMap[parseType] || '历史导入'
  };
}

function buildImportRow(rawRow, bridgedRow) {
  const lineNo = String(rawRow['原表行号'] || '').trim();
  return {
    id: `${BATCH_ID}:${lineNo}`,
    batchId: BATCH_ID,
    sourceRowNumber: Number(lineNo),
    sourceFileName: '网球兄弟·马坡收入记录 - 底表.csv',
    sourceExcelFileName: '网球兄弟·马坡收入记录 (1).xlsx',
    sourceSheetName: '底表',
    rawDateText: rawRow['日期原文'] || '',
    rawWeekdayText: rawRow['星期原文'] || rawRow['星期'] || '',
    rawTimeText: rawRow['时间原文'] || '',
    rawCustomerName: rawRow['客户'] || '',
    rawIncomeType: rawRow['收入类型'] || '',
    rawPaymentMethod: rawRow['支付方式'] || '',
    rawReceivableAmountText: rawRow['应收收入（元）'] || '0',
    rawActualAmountText: rawRow['实际收入（元）'] || '0',
    rawDifferenceAmountText: rawRow['差价（元）'] || '0',
    rawDifferenceReason: rawRow['差价说明'] || '',
    rawCollectorName: rawRow['收款人'] || '',
    rawNotes: rawRow['备注'] || '',
    businessDate: rawRow['日期'] || '',
    parsedStartTime: rawRow['开始时间'] || '',
    parsedEndTime: rawRow['结束时间'] || '',
    receivableAmountCents: cents(rawRow['应收收入（元）'] || 0),
    actualAmountCents: cents(rawRow['实际收入（元）'] || 0),
    differenceAmountCents: cents(rawRow['差价（元）'] || 0),
    receivableFormulaText: '',
    differenceFormulaText: '',
    classificationStatus: rawRow.classificationStatus || 'auto_ready',
    reviewReason: rawRow.reviewReason || '',
    plannedTarget: plannedTargetForRow(bridgedRow),
    plannedLedgerPreview: ledgerPreviewForRow(bridgedRow),
    normalizedIncomeType: bridgedRow.businessType || rawRow['收入类型'] || '',
    normalizedPaymentMethod: normalizePaymentMethod(rawRow['支付方式'] || ''),
    matchedUserId: '',
    matchedUserType: 'unknown',
    importStatus: 'pending',
    importMode: '',
    createdLedgerIds: [],
    createdBusinessIds: [],
    importedAt: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

async function main() {
  const rawRows = loadCsv(RAW_CSV);
  const bridgedRows = loadCsv(BRIDGED_CSV);
  const rawMap = new Map(rawRows.map((row) => [String(row['原表行号']).trim(), row]));
  const existingBatchRows = ONLY_LINES.size
    ? []
    : (await scan(T_INCOME_IMPORT_ROWS)).filter((row) => String(row.batchId || '') === BATCH_ID);
  const existingIdSet = new Set(existingBatchRows.map((row) => String(row.id)));
  const stats = {
    total: bridgedRows.length,
    existing: existingBatchRows.length,
    missingRaw: [],
    created: [],
    failed: []
  };

  for (const bridgedRow of bridgedRows) {
    const lineNo = String(bridgedRow['原表行号'] || '').trim();
    if (!lineNo) continue;
    if (ONLY_LINES.size && !ONLY_LINES.has(lineNo)) continue;
    const id = `${BATCH_ID}:${lineNo}`;
    if (existingIdSet.has(id)) {
      continue;
    }
    const rawRow = rawMap.get(lineNo);
    if (!rawRow) {
      stats.missingRaw.push(lineNo);
      continue;
    }
    const payload = buildImportRow(rawRow, bridgedRow);
    if (!DRY_RUN) {
      try {
        await putRow(T_INCOME_IMPORT_ROWS, id, payload);
      } catch (error) {
        stats.failed.push({ lineNo, reason: error.message });
        continue;
      }
    }
    stats.created.push(lineNo);
  }

  console.log(JSON.stringify({
    ...stats,
    filteredLineCount: ONLY_LINES.size || null,
    write: !DRY_RUN
  }, null, 2));

  if (stats.failed.length) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
