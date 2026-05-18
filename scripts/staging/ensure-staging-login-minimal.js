const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'ensure-staging-login-minimal' });

const endpoint = process.env.TS_ENDPOINT;
const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const secretAccessKey = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const sourceInstance = String(process.env.SOURCE_TS_INSTANCE || '').trim();
const targetInstance = process.env.TARGET_TS_INSTANCE || 'flow-staging';
const tableName = 'ft_users';
const adminId = 'admin';
const writeMode = process.argv.includes('--write');

if (!endpoint || !accessKeyId || !secretAccessKey) {
  throw new Error('缺少 TableStore 连接环境变量');
}

if (!sourceInstance) {
  throw new Error('缺少 SOURCE_TS_INSTANCE。默认不再回落到生产实例，请显式指定来源实例。');
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

function decodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const record = { id: row.primaryKey[0].value };
  for (const attr of row.attributes || []) {
    try {
      record[attr.columnName] = JSON.parse(attr.columnValue);
    } catch {
      record[attr.columnName] = attr.columnValue;
    }
  }
  return record;
}

function getRow(client, id) {
  return new Promise((resolve, reject) => {
    client.getRow(
      { tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 },
      (err, data) => {
        if (err) return reject(err);
        resolve(decodeRow(data.row));
      }
    );
  });
}

function createTableIfMissing(client) {
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

function putRow(client, id, attrs) {
  return new Promise((resolve, reject) => {
    client.putRow(
      {
        tableName,
        condition: new TableStore.Condition(TableStore.RowExistenceExpectation.IGNORE, null),
        primaryKey: [{ id: String(id) }],
        attributeColumns: Object.entries(attrs)
          .filter(([key]) => key !== 'id')
          .map(([key, value]) => ({
            [key]: typeof value === 'object' ? JSON.stringify(value) : String(value ?? '')
          }))
      },
      (err, data) => (err ? reject(err) : resolve(data))
    );
  });
}

async function main() {
  const sourceClient = createClient(sourceInstance);
  const targetClient = createClient(targetInstance);
  const sourceAdmin = await getRow(sourceClient, adminId);
  if (!sourceAdmin) {
    throw new Error(`源实例 ${sourceInstance} 不存在 admin 账号`);
  }
  if (!String(sourceAdmin.password || '').trim()) {
    throw new Error(`源实例 ${sourceInstance} 的 admin 缺少 password hash`);
  }

  const now = new Date().toISOString();
  const targetAdmin = {
    id: adminId,
    username: 'admin',
    name: '管理员',
    role: 'admin',
    status: 'active',
    password: sourceAdmin.password,
    createdAt: sourceAdmin.createdAt || now,
    updatedAt: now
  };

  const existingTargetAdmin = await getRow(targetClient, adminId);
  const summary = {
    sourceInstance,
    targetInstance,
    tableName,
    writeMode,
    sourceAdmin: {
      id: sourceAdmin.id || adminId,
      username: sourceAdmin.username || '',
      hasPasswordHash: Boolean(String(sourceAdmin.password || '').trim())
    },
    targetAdminBefore: existingTargetAdmin
      ? {
          id: existingTargetAdmin.id || adminId,
          username: existingTargetAdmin.username || '',
          hasPasswordHash: Boolean(String(existingTargetAdmin.password || '').trim())
        }
      : null
  };

  if (!writeMode) {
    console.log(JSON.stringify({ ...summary, action: 'check_only' }, null, 2));
    return;
  }

  const tableStatus = await createTableIfMissing(targetClient);
  await putRow(targetClient, adminId, targetAdmin);
  const verifiedAdmin = await getRow(targetClient, adminId);

  console.log(JSON.stringify(
    {
      ...summary,
      action: 'write',
      tableStatus,
      adminWritten: {
        id: verifiedAdmin?.id || '',
        username: verifiedAdmin?.username || '',
        name: verifiedAdmin?.name || '',
        role: verifiedAdmin?.role || '',
        status: verifiedAdmin?.status || '',
        hasPasswordHash: Boolean(String(verifiedAdmin?.password || '').trim())
      }
    },
    null,
    2
  ));
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
