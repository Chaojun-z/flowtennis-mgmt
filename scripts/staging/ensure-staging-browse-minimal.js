const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'ensure-staging-browse-minimal' });

const endpoint = process.env.TS_ENDPOINT;
const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const secretAccessKey = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const targetInstance = process.env.TARGET_TS_INSTANCE || 'flow-staging';
const probeId = '__codex_probe__';
const writeMode = process.argv.includes('--write');

const TABLES = [
  {
    name: 'ft_students',
    scope: 'required',
    reason: '/students 首屏必经 GET /students，后端直接 getCachedScan(ft_students)，缺表会直接 500'
  },
  {
    name: 'ft_classes',
    scope: 'required',
    reason: '/students 后台补载 classes 走 GET /classes，后端直接 getCachedScan(ft_classes)'
  },
  {
    name: 'ft_schedule',
    scope: 'required',
    reason: '/students 后台补载 schedule 走 GET /schedule，后端直接 getCachedScan(ft_schedule)'
  },
  {
    name: 'ft_courts',
    scope: 'required',
    reason: '/students 后台补载 courts 走 GET /courts，后端直接 getCachedScan(ft_courts)'
  },
  {
    name: 'ft_coaches',
    scope: 'required',
    reason: '学员页恢复后，排课页与订场聚合页都会直接读 ft_coaches；提前补空表避免下一跳再炸'
  },
  {
    name: 'ft_campuses',
    scope: 'safe-fallback',
    reason: 'GET /campuses 已有 DEFAULT_CAMPUSES 兜底，不是必须建表'
  },
  {
    name: 'ft_entitlements',
    scope: 'safe-fallback',
    reason: '学员页后台补载 entitlements 已 catch(()=>[])'
  },
  {
    name: 'ft_entitlement_ledger',
    scope: 'safe-fallback',
    reason: '学员页后台补载 entitlement-ledger 已 catch(()=>[])'
  },
  {
    name: 'ft_feedbacks',
    scope: 'safe-fallback',
    reason: '学员页后台补载 feedbacks 已 catch(()=>[])'
  },
  {
    name: 'ft_products',
    scope: 'safe-fallback',
    reason: '学员页后台补载 products 已 catch(()=>[])'
  }
];

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error('缺少 TableStore 连接环境变量');
}

function createClient(instancename) {
  return new TableStore.Client({
    accessKeyId,
    secretAccessKey,
    endpoint,
    instancename,
    maxRetries: 3
  });
}

function getRow(client, tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow(
      { tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 },
      (err, data) => {
        if (err) return reject(err);
        resolve(data.row || null);
      }
    );
  });
}

function createTableIfMissing(client, tableName) {
  return new Promise((resolve, reject) => {
    client.createTable(
      {
        tableMeta: {
          tableName,
          primaryKey: [{ name: 'id', type: TableStore.PrimaryKeyType.STRING }]
        },
        reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
        tableOptions: { timeToLive: -1, maxVersions: 1 }
      },
      (err) => {
        if (!err) return resolve('created');
        const text = String(err.message || err || '');
        if (/exist/i.test(text)) return resolve('exists');
        reject(err);
      }
    );
  });
}

async function probeTable(client, tableName) {
  try {
    await getRow(client, tableName, probeId);
    return { status: 'exists' };
  } catch (err) {
    const message = String(err?.message || err || '');
    if (/table not exist/i.test(message) || err?.code === 'OTSObjectNotExist') {
      return { status: 'missing', code: err?.code || '', message };
    }
    return { status: 'error', code: err?.code || '', message };
  }
}

async function main() {
  const client = createClient(targetInstance);
  const report = [];
  for (const table of TABLES) {
    const probe = await probeTable(client, table.name);
    let action = 'skip';
    if (writeMode && table.scope === 'required' && probe.status === 'missing') {
      action = await createTableIfMissing(client, table.name);
    }
    report.push({
      table: table.name,
      scope: table.scope,
      reason: table.reason,
      before: probe.status,
      action
    });
  }
  console.log(
    JSON.stringify(
      {
        targetInstance,
        writeMode,
        requiredTables: TABLES.filter((item) => item.scope === 'required').map((item) => item.name),
        report
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
