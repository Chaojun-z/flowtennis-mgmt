const TableStore = require('tablestore');
const { Pool } = require('pg');
const { loadRuntimeEnv } = require('../lib/runtime-env');

const MATCH_SQL_COUNT_TABLES = [
  'match_posts',
  'match_registrations',
  'match_attendance',
  'match_bookings',
  'match_fee_records',
  'match_fee_splits',
  'match_operation_logs',
  'match_replacements',
  'match_users'
];
const MATCH_SQL_DELETE_ORDER = ['match_replacements', 'match_posts', 'match_users'];
const MATCH_COURT_FINANCE_ACCOUNT_ID = 'match-court-finance';
const T_COURTS = 'ft_courts';

function parseArgs(argv = process.argv.slice(2)) {
  return {
    write: argv.includes('--write'),
    confirm: argv.includes('--confirm-production-match-cleanup')
  };
}

function sumRowCounts(counts = {}) {
  return Object.values(counts).reduce((sum, value) => sum + Number(value || 0), 0);
}

function buildCleanupSummary({ before = {}, financeRemovedCount = 0 } = {}) {
  return {
    sqlRows: sumRowCounts(before),
    financeRows: Number(financeRemovedCount || 0)
  };
}

function decodeTableStoreRow(row) {
  if (!row || !row.primaryKey || !row.primaryKey[0]) return null;
  const obj = { id: row.primaryKey[0].value };
  for (const attribute of row.attributes || []) {
    try {
      obj[attribute.columnName] = JSON.parse(attribute.columnValue);
    } catch {
      obj[attribute.columnName] = attribute.columnValue;
    }
  }
  return obj;
}

function createTableStoreClient() {
  return new TableStore.Client({
    accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
    secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
    endpoint: process.env.TS_ENDPOINT,
    instancename: process.env.TS_INSTANCE,
    maxRetries: 3,
    httpOptions: { timeout: 12000, maxSockets: 5 }
  });
}

function getTableStoreRow(client, tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }], maxVersions: 1 }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeTableStoreRow(data.row));
    });
  });
}

function putTableStoreRow(client, tableName, id, attrs) {
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

function filterMatchCourtFinanceHistory(account, { matchIds = [], splitIds = [], userIds = [] } = {}) {
  const history = Array.isArray(account?.history) ? account.history : [];
  const matchIdSet = new Set(matchIds.map(String));
  const splitIdSet = new Set(splitIds.map(String));
  const userIdSet = new Set(userIds.map(String));
  const removeAllMatchRows = matchIdSet.size === 0 && splitIdSet.size === 0 && userIdSet.size === 0;
  const removedRows = [];
  const nextHistory = history.filter((row) => {
    const isMatchFinance = String(row?.sourceCategory || '') === '约球订场';
    if (!isMatchFinance) return true;
    const shouldRemove = removeAllMatchRows
      || matchIdSet.has(String(row?.matchId || ''))
      || splitIdSet.has(String(row?.matchFeeSplitId || ''))
      || userIdSet.has(String(row?.matchUserId || ''));
    if (shouldRemove) removedRows.push(row);
    return !shouldRemove;
  });
  return { nextHistory, removedRows, removedCount: removedRows.length };
}

async function queryCount(pool, tableName) {
  const result = await pool.query(`SELECT COUNT(*)::int AS count FROM ${tableName}`);
  return Number(result.rows[0]?.count || 0);
}

async function listIds(pool, sql) {
  const result = await pool.query(sql);
  return result.rows.map((row) => String(row.id));
}

async function collectSnapshot(pool) {
  const counts = {};
  for (const tableName of MATCH_SQL_COUNT_TABLES) {
    counts[tableName] = await queryCount(pool, tableName);
  }
  const [matchIds, splitIds, userIds, samplePosts, sampleUsers] = await Promise.all([
    listIds(pool, 'SELECT id FROM match_posts ORDER BY createdAt DESC'),
    listIds(pool, 'SELECT id FROM match_fee_splits ORDER BY createdAt DESC'),
    listIds(pool, 'SELECT id FROM match_users ORDER BY createdAt DESC'),
    pool.query('SELECT id,title,status,startTime,creatorUserId FROM match_posts ORDER BY createdAt DESC LIMIT 10'),
    pool.query('SELECT id,nickName,phone FROM match_users ORDER BY createdAt DESC LIMIT 10')
  ]);
  return {
    counts,
    ids: { matchIds, splitIds, userIds },
    samples: {
      posts: samplePosts.rows,
      users: sampleUsers.rows
    }
  };
}

async function executeSqlCleanup(pool) {
  const client = await pool.connect();
  const deleted = {};
  try {
    await client.query('BEGIN');
    for (const tableName of MATCH_SQL_DELETE_ORDER) {
      const result = await client.query(`DELETE FROM ${tableName}`);
      deleted[tableName] = result.rowCount;
    }
    await client.query('COMMIT');
    return deleted;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => null);
    throw error;
  } finally {
    client.release();
  }
}

function assertWriteAllowed({ write, confirm }) {
  if (!write) return;
  if (!confirm) {
    throw new Error('正式清理必须同时带上 --write --confirm-production-match-cleanup');
  }
  if (String(process.env.APP_ENV || '').trim().toLowerCase() !== 'production') {
    throw new Error('正式清理只能在 APP_ENV=production 下执行');
  }
}

async function main() {
  const args = parseArgs();
  loadRuntimeEnv({ appEnv: process.env.APP_ENV || 'production', entry: 'cleanup-match-production-test-data' });
  assertWriteAllowed(args);

  const api = require('../../api/index.js');
  const { normalizeCourtRecord } = api._test;
  const pool = new Pool({
    connectionString: process.env.MATCH_DATABASE_URL || process.env.DATABASE_URL,
    ssl: process.env.MATCH_DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined
  });
  const tableStoreClient = createTableStoreClient();

  try {
    const before = await collectSnapshot(pool);
    const financeAccount = await getTableStoreRow(tableStoreClient, T_COURTS, MATCH_COURT_FINANCE_ACCOUNT_ID).catch(() => null);
    const financeCleanup = filterMatchCourtFinanceHistory(financeAccount, before.ids);

    const result = {
      dryRun: !args.write,
      before: before.counts,
      samples: before.samples,
      cleanupSummary: buildCleanupSummary({
        before: before.counts,
        financeRemovedCount: financeCleanup.removedCount
      }),
      finance: {
        accountFound: Boolean(financeAccount),
        beforeHistoryCount: Array.isArray(financeAccount?.history) ? financeAccount.history.length : 0,
        removedHistoryCount: financeCleanup.removedCount,
        afterHistoryCount: financeCleanup.nextHistory.length
      }
    };

    if (args.write) {
      result.deleted = await executeSqlCleanup(pool);
      if (financeAccount && financeCleanup.removedCount > 0) {
        const nextAccount = normalizeCourtRecord({
          ...financeAccount,
          history: financeCleanup.nextHistory,
          updatedAt: new Date().toISOString()
        });
        await putTableStoreRow(tableStoreClient, T_COURTS, MATCH_COURT_FINANCE_ACCOUNT_ID, nextAccount);
      }
      const after = await collectSnapshot(pool);
      const financeAfter = await getTableStoreRow(tableStoreClient, T_COURTS, MATCH_COURT_FINANCE_ACCOUNT_ID).catch(() => null);
      result.after = after.counts;
      result.verification = {
        matchPostsCleared: after.counts.match_posts === 0,
        dependentTablesCleared: [
          'match_registrations',
          'match_attendance',
          'match_bookings',
          'match_fee_records',
          'match_fee_splits',
          'match_operation_logs',
          'match_replacements',
          'match_users'
        ].every((tableName) => after.counts[tableName] === 0),
        financeRowsCleared: !financeAfter || !Array.isArray(financeAfter.history)
          || financeAfter.history.every((row) => String(row?.sourceCategory || '') !== '约球订场')
      };
    }

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await pool.end().catch(() => null);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  MATCH_SQL_COUNT_TABLES,
  MATCH_SQL_DELETE_ORDER,
  filterMatchCourtFinanceHistory,
  buildCleanupSummary,
  sumRowCounts
};
