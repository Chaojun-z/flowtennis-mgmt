const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv, resolveAppEnv } = require('../lib/runtime-env');
const { createClientFromEnv, scanTable } = require('../lib/staging-data-store');

const root = path.join(__dirname, '..', '..');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

function readArg(name, fallback = '') {
  const token = process.argv.find((item) => item.startsWith(`${name}=`));
  return token ? token.slice(name.length + 1) : fallback;
}

async function main() {
  const appEnv = resolveAppEnv(process.env);
  loadRuntimeEnv({ appEnv, entry: 'staging-data-export' });
  const manifestPath = path.resolve(
    readArg('--manifest', path.join(root, 'staging-data', 'manifests', 'staging-refresh.template.json'))
  );
  const outDir = path.resolve(
    readArg('--out-dir', path.join(root, 'staging-data', 'exports', `export-batch-${timestamp}`))
  );
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.mkdirSync(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, 'raw-snapshot.json');
  const reportPath = path.join(outDir, 'export-report.json');
  const existingSnapshot = fs.existsSync(snapshotPath) ? JSON.parse(fs.readFileSync(snapshotPath, 'utf8')) : {};
  const existingReport = fs.existsSync(reportPath) ? JSON.parse(fs.readFileSync(reportPath, 'utf8')) : {};
  const exportPlan = {
    generatedAt: new Date().toISOString(),
    appEnv,
    manifestPath,
    outDir,
    snapshotPath,
    reportPath,
    sourceEnv: manifest.sourceEnv,
    targetEnv: manifest.targetEnv,
    tables: manifest.tables || [],
    note: '该脚本会按 manifest 从源 TableStore 拉取首轮最小可信数据快照。'
  };
  fs.writeFileSync(path.join(outDir, 'export-plan.json'), JSON.stringify(exportPlan, null, 2));
  const client = createClientFromEnv(process.env);
  const snapshot = existingSnapshot;
  const tableCounts = existingReport.tableCounts || {};
  const persistProgress = () => {
    fs.writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
    fs.writeFileSync(
      reportPath,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          manifestPath,
          snapshotPath,
          sourceEnv: manifest.sourceEnv,
          targetEnv: manifest.targetEnv,
          tableCounts
        },
        null,
        2
      )
    );
  };
  try {
    for (const tableName of exportPlan.tables) {
      if (Array.isArray(snapshot[tableName]) && typeof tableCounts[tableName] === 'number') {
        console.log(`[staging-data:export] ${tableName} skip rows=${tableCounts[tableName]}`);
        continue;
      }
      const startedAt = Date.now();
      const rows = await scanTable(client, tableName);
      snapshot[tableName] = rows;
      tableCounts[tableName] = rows.length;
      persistProgress();
      console.log(`[staging-data:export] ${tableName} rows=${rows.length} ms=${Date.now() - startedAt}`);
    }
    persistProgress();
    console.log(JSON.stringify({ ...exportPlan, tableCounts }, null, 2));
  } catch (err) {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  }
}

main();
