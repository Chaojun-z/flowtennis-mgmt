const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv, resolveAppEnv } = require('../lib/runtime-env');
const { createClientFromEnv, putRow, createTableIfMissing } = require('../lib/staging-data-store');
const { resolveImportPlan, runWithRetry } = require('../lib/staging-data-import-plan');

const root = path.join(__dirname, '..', '..');

function readArg(name, fallback = '') {
  const token = process.argv.find((item) => item.startsWith(`${name}=`));
  return token ? token.slice(name.length + 1) : fallback;
}

function readTableArg(name) {
  return String(readArg(name, ''))
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function summarizeSnapshot(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );
}

function resolvePlaceholderBlocker() {
  const endpoint = String(process.env.TS_ENDPOINT || '').trim();
  if (/example\.com/i.test(endpoint)) {
    return 'staging TS_ENDPOINT 仍是占位域名，远端 staging TableStore 不可写。';
  }
  return '';
}

async function main() {
  const appEnv = resolveAppEnv(process.env);
  if (appEnv === 'production') {
    throw new Error('staging-data-import 只允许在 staging 环境执行，禁止写入 production');
  }
  loadRuntimeEnv({ appEnv, entry: 'staging-data-import' });
  const inputPath = path.resolve(readArg('--input'));
  if (!inputPath) throw new Error('缺少 --input=<sanitized-json>');
  const writeMode = process.argv.includes('--write');
  const tableNames = readTableArg('--tables');
  const startAtTable = readArg('--start-at-table');
  const maxAttempts = Number(readArg('--max-attempts', '4')) || 4;
  const snapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const importPlan = resolveImportPlan(snapshot, { tableNames, startAtTable });
  const placeholderBlocker = resolvePlaceholderBlocker();
  const importSummary = {
    generatedAt: new Date().toISOString(),
    appEnv,
    inputPath,
    writeMode,
    tables: summarizeSnapshot(snapshot),
    selectedTables: importPlan.map((item) => item.tableName),
    startAtTable,
    maxAttempts,
    blocker: placeholderBlocker || ''
  };
  const outDir = path.join(root, 'staging-data', 'imports');
  const reportDir = path.join(root, 'staging-data', 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  fs.mkdirSync(reportDir, { recursive: true });
  const normalizedPath = path.join(outDir, `${path.basename(inputPath, '.json')}.import-ready.json`);
  const reportPath = path.join(reportDir, `${path.basename(inputPath, '.json')}.import-report.json`);
  fs.writeFileSync(normalizedPath, JSON.stringify(snapshot, null, 2));
  const finalize = () => {
    fs.writeFileSync(reportPath, JSON.stringify(importSummary, null, 2));
    console.log(JSON.stringify({ normalizedPath, reportPath, importSummary }, null, 2));
  };
  if (!writeMode) {
    importSummary.blocker = importSummary.blocker || '未加 --write，本次只生成导入包与校验报告。';
    finalize();
    return;
  }
  if (placeholderBlocker) {
    finalize();
    throw new Error(placeholderBlocker);
  }
  const client = createClientFromEnv(process.env);
  const tableResults = [];
  try {
    for (const { tableName, rows: normalizedRows } of importPlan) {
      const startedAt = Date.now();
      await runWithRetry(
        async () => createTableIfMissing(client, tableName),
        { maxAttempts, baseDelayMs: 1000 }
      );
      for (let index = 0; index < normalizedRows.length; index += 1) {
        const row = normalizedRows[index];
        await runWithRetry(
          async () => putRow(client, tableName, row),
          { maxAttempts, baseDelayMs: 1000 }
        );
      }
      tableResults.push({ tableName, imported: normalizedRows.length, ms: Date.now() - startedAt });
      console.log(`[staging-data:import] ${tableName} rows=${normalizedRows.length} ms=${Date.now() - startedAt}`);
    }
    importSummary.tableResults = tableResults.sort((a, b) => a.tableName.localeCompare(b.tableName));
    importSummary.blocker = '';
    finalize();
  } catch (err) {
    importSummary.blocker = String(err?.message || err);
    finalize();
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();
