const assert = require('assert');
const fs = require('fs');
const path = require('path');

const plan = require('../scripts/lib/staging-data-import-plan');
const importScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'staging', 'staging-data-import.js'),
  'utf8'
);

const snapshot = {
  ft_campuses: [{ id: 'c-1' }],
  ft_coaches: [{ id: 'coach-1' }],
  ft_students: [{ id: 'stu-1' }],
  ft_courts: [{ id: 'court-1' }]
};

assert.deepStrictEqual(
  plan.resolveImportPlan(snapshot, { startAtTable: 'ft_students' }).map((item) => item.tableName),
  ['ft_students', 'ft_courts'],
  'startAtTable should skip already-finished tables and keep original order'
);

assert.deepStrictEqual(
  plan.resolveImportPlan(snapshot, { tableNames: ['ft_courts', 'ft_students'] }).map((item) => item.tableName),
  ['ft_students', 'ft_courts'],
  'table filter should keep snapshot order instead of caller order'
);

assert.equal(
  plan.isRetryableImportError(new Error('Client network socket disconnected before secure TLS connection was established')),
  true,
  'TLS disconnect should be treated as retryable'
);

assert.equal(
  plan.isRetryableImportError(new Error('socket hang up')),
  true,
  'socket hang up should be treated as retryable'
);

assert.equal(
  plan.isRetryableImportError(new Error('OTSPartitionUnavailable The partition is splitting for improving performance, please retry for a while')),
  true,
  'partition split should be treated as retryable'
);

assert.equal(
  plan.isRetryableImportError(new Error('OTSAuthFailed The AccessKeyID does not exist')),
  false,
  'credential failures should not be retried'
);

assert.match(
  importScript,
  /const client = createClientFromEnv\(process\.env\);[\s\S]*createTableIfMissing\(client, tableName\)[\s\S]*putRow\(client, tableName, row\)/,
  'staging import should reuse one shared TableStore client for the whole import run'
);

console.log('staging data import tests passed');
