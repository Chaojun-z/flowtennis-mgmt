const TableStore = require('tablestore');
const { Pool } = require('pg');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'ensure-staging-match-minimal' });

const endpoint = process.env.TS_ENDPOINT;
const accessKeyId = process.env.ALIBABA_CLOUD_ACCESS_KEY_ID;
const secretAccessKey = process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET;
const targetInstance = process.env.TARGET_TS_INSTANCE || 'flow-staging';
const matchDatabaseUrl = process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL || '';
const probeId = '__codex_probe__';

const USER_TABLE = 'ft_users';
const REQUIRED_MATCH_SQL_TABLES = [
  'match_users',
  'match_posts',
  'match_registrations',
  'match_bookings',
  'match_fee_records',
  'match_fee_splits',
  'match_operation_logs'
];
const OPTIONAL_MATCH_SQL_TABLES = ['match_attendance', 'match_replacements'];

function parseArgs(argv = process.argv.slice(2)) {
  return {
    checkMode: argv.includes('--check') || argv.length === 0,
    writeMode: argv.includes('--write')
  };
}

function assertCheckOnlyMode({ checkMode, writeMode }) {
  if (writeMode) {
    throw new Error('约球 staging 最小入口当前只提供只读检查，不支持 --write。');
  }
  if (!checkMode) {
    throw new Error('请显式使用 --check 运行约球 staging 最小检查。');
  }
}

function parsePermissionList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '').split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
}

function resolveUserMatchPermissions(user = {}) {
  const permissions = new Set(parsePermissionList(user.permissions || user.matchPermissions));
  if (user.role === 'admin') {
    permissions.add('match_ops');
    permissions.add('match_finance');
  }
  if (user.matchOps) permissions.add('match_ops');
  if (user.matchFinance) permissions.add('match_finance');
  return [...permissions].filter((item) => item === 'match_ops' || item === 'match_finance');
}

function decodeRow(row) {
  if (!row || !row.primaryKey || !row.primaryKey[0]) return null;
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

function createTableStoreClient(instancename) {
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
        resolve(decodeRow(data.row));
      }
    );
  });
}

function probeTable(client, tableName) {
  return new Promise((resolve) => {
    client.getRow(
      { tableName, primaryKey: [{ id: probeId }], maxVersions: 1 },
      (err) => {
        if (!err) {
          resolve({ table: tableName, status: 'exists' });
          return;
        }
        const message = String(err?.message || err || '');
        if (/table not exist/i.test(message) || err?.code === 'OTSObjectNotExist') {
          resolve({ table: tableName, status: 'missing', code: err?.code || '', message });
          return;
        }
        resolve({ table: tableName, status: 'error', code: err?.code || '', message });
      }
    );
  });
}

async function listTableNames(pool) {
  const tableNames = [...REQUIRED_MATCH_SQL_TABLES, ...OPTIONAL_MATCH_SQL_TABLES];
  const result = await pool.query(
    `SELECT table_name
       FROM information_schema.tables
      WHERE table_schema='public'
        AND table_name = ANY($1::text[])
      ORDER BY table_name ASC`,
    [tableNames]
  );
  return new Set(result.rows.map((row) => String(row.table_name || row.table_name || '')));
}

function summarizeSqlChecks(existingTables) {
  return {
    required: REQUIRED_MATCH_SQL_TABLES.map((table) => ({
      table,
      status: existingTables.has(table) ? 'exists' : 'missing'
    })),
    optional: OPTIONAL_MATCH_SQL_TABLES.map((table) => ({
      table,
      status: existingTables.has(table) ? 'exists' : 'missing'
    }))
  };
}

async function buildUserCheck(client) {
  const tableProbe = await probeTable(client, USER_TABLE);
  if (tableProbe.status !== 'exists') {
    return {
      table: tableProbe,
      adminUser: null,
      activeAdminReady: false,
      permissions: []
    };
  }
  const adminUser = await getRow(client, USER_TABLE, 'admin').catch(() => null);
  const permissions = resolveUserMatchPermissions(adminUser || {});
  const activeAdminReady = Boolean(
    adminUser &&
    String(adminUser.status || 'active') === 'active' &&
    String(adminUser.role || '') === 'admin'
  );
  return {
    table: tableProbe,
    adminUser: adminUser
      ? {
          id: adminUser.id || '',
          username: adminUser.username || '',
          role: adminUser.role || '',
          status: adminUser.status || '',
          matchPermissions: permissions
        }
      : null,
    activeAdminReady,
    permissions
  };
}

function summarizeReport({ userCheck, sqlChecks }) {
  const missingRequiredSql = sqlChecks.required.filter((item) => item.status !== 'exists').map((item) => item.table);
  const failures = [];
  if (userCheck.table.status !== 'exists') failures.push('ft_users_missing');
  if (!userCheck.adminUser) failures.push('admin_user_missing');
  if (!userCheck.activeAdminReady) failures.push('admin_user_not_ready');
  if (missingRequiredSql.length) failures.push(`missing_match_tables:${missingRequiredSql.join(',')}`);
  return {
    pass: failures.length === 0,
    failures,
    manualOnlyItems: [
      '小程序 staging 真接线',
      'tests/match-real-link.test.js 真链路写入联调',
      'match-court-finance 财务桥真实写回验证'
    ]
  };
}

function buildRuntimeFailureResult({ targetInstance, args, stage, error }) {
  return {
    targetInstance,
    checkMode: Boolean(args?.checkMode),
    writeMode: Boolean(args?.writeMode),
    checks: {},
    summary: {
      pass: false,
      failures: [`${stage}_unreachable`],
      manualOnlyItems: [
        '小程序 staging 真接线',
        'tests/match-real-link.test.js 真链路写入联调',
        'match-court-finance 财务桥真实写回验证'
      ]
    },
    runtimeFailure: {
      stage,
      message: String(error?.message || error || '')
    }
  };
}

async function main() {
  const args = parseArgs();
  assertCheckOnlyMode(args);

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error('缺少 TableStore 连接环境变量');
  }
  if (!matchDatabaseUrl) {
    throw new Error('缺少 MATCH_DATABASE_URL 或 DATABASE_URL');
  }

  const tableStoreClient = createTableStoreClient(targetInstance);
  const pool = new Pool({
    connectionString: matchDatabaseUrl,
    ssl: process.env.MATCH_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });

  try {
    const userCheck = await buildUserCheck(tableStoreClient).catch((error) => {
      console.log(JSON.stringify(buildRuntimeFailureResult({
        targetInstance,
        args,
        stage: 'table_store',
        error
      }), null, 2));
      process.exitCode = 1;
      return null;
    });
    if (!userCheck) return;
    const existingTables = await listTableNames(pool).catch((error) => {
      console.log(JSON.stringify(buildRuntimeFailureResult({
        targetInstance,
        args,
        stage: 'match_sql',
        error
      }), null, 2));
      process.exitCode = 1;
      return null;
    });
    if (!existingTables) return;
    const sqlChecks = summarizeSqlChecks(existingTables);
    const summary = summarizeReport({ userCheck, sqlChecks });

    console.log(JSON.stringify({
      targetInstance,
      checkMode: args.checkMode,
      writeMode: args.writeMode,
      checks: {
        stagingAdminReadiness: userCheck,
        adminMatchesSqlReadiness: sqlChecks
      },
      summary
    }, null, 2));

    if (!summary.pass) process.exitCode = 1;
  } finally {
    await pool.end().catch(() => null);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err && err.stack ? err.stack : String(err));
    process.exit(1);
  });
}

module.exports = {
  REQUIRED_MATCH_SQL_TABLES,
  OPTIONAL_MATCH_SQL_TABLES,
  parseArgs,
  assertCheckOnlyMode,
  resolveUserMatchPermissions,
  summarizeReport,
  buildRuntimeFailureResult
};
