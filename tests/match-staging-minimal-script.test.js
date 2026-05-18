const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const scriptPath = path.join(root, 'scripts', 'staging', 'ensure-staging-match-minimal.js');
const docPath = path.join(root, 'docs', '2026-05-12-约球staging专项最小验收规则.md');

assert.strictEqual(
  packageJson.scripts['staging:ensure-match-minimal:check'],
  'APP_ENV=staging node scripts/staging/ensure-staging-match-minimal.js --check',
  'package.json should expose the match staging minimal check command'
);

assert.ok(fs.existsSync(scriptPath), 'repo should provide the match staging minimal script');

const source = fs.readFileSync(scriptPath, 'utf8');
assert.match(source, /loadRuntimeEnv/, 'match staging minimal script should load env through the shared runtime loader');
assert.match(source, /match_posts/, 'match staging minimal script should check match SQL tables');
assert.match(source, /ft_users/, 'match staging minimal script should check staging admin user prerequisites');
assert.match(source, /--write/, 'match staging minimal script should explicitly reject write mode');

const script = require(scriptPath);
assert.deepStrictEqual(
  script.REQUIRED_MATCH_SQL_TABLES,
  [
    'match_users',
    'match_posts',
    'match_registrations',
    'match_bookings',
    'match_fee_records',
    'match_fee_splits',
    'match_operation_logs'
  ],
  'match staging minimal script should lock the required admin match read-chain tables'
);
assert.ok(
  script.OPTIONAL_MATCH_SQL_TABLES.includes('match_attendance') && script.OPTIONAL_MATCH_SQL_TABLES.includes('match_replacements'),
  'attendance and replacements should stay optional for the minimal staging check'
);
assert.doesNotThrow(
  () => script.assertCheckOnlyMode({ checkMode: true, writeMode: false }),
  'check mode should stay read-only'
);
assert.throws(
  () => script.assertCheckOnlyMode({ checkMode: true, writeMode: true }),
  /只提供只读检查/,
  'match staging minimal script must reject write mode'
);
assert.deepStrictEqual(
  script.resolveUserMatchPermissions({ role: 'editor', permissions: 'match_ops match_finance' }).sort(),
  ['match_finance', 'match_ops'],
  'permission resolver should normalize string permissions'
);
assert.deepStrictEqual(
  script.resolveUserMatchPermissions({ role: 'admin' }).sort(),
  ['match_finance', 'match_ops'],
  'admin should count as both match ops and match finance'
);
assert.deepStrictEqual(
  script.buildRuntimeFailureResult({
    targetInstance: 'flow-staging',
    args: { checkMode: true, writeMode: false },
    stage: 'match_sql',
    error: new Error('getaddrinfo ENOTFOUND staging-db.example.com')
  }),
  {
    targetInstance: 'flow-staging',
    checkMode: true,
    writeMode: false,
    checks: {},
    summary: {
      pass: false,
      failures: ['match_sql_unreachable'],
      manualOnlyItems: [
        '小程序 staging 真接线',
        'tests/match-real-link.test.js 真链路写入联调',
        'match-court-finance 财务桥真实写回验证'
      ]
    },
    runtimeFailure: {
      stage: 'match_sql',
      message: 'getaddrinfo ENOTFOUND staging-db.example.com'
    }
  },
  'runtime failures should still be normalized into a structured report'
);

assert.ok(fs.existsSync(docPath), 'repo should provide a match staging minimal acceptance rule doc');
const docText = fs.readFileSync(docPath, 'utf8');
assert.match(docText, /staging:ensure-match-minimal:check/, 'doc should publish the command entry');
assert.match(docText, /不接入 gate:staging/, 'doc should clarify this entry is not yet wired into the default staging gate');
assert.match(docText, /tests\/match-real-link\.test\.js/, 'doc should keep match-real-link as a dedicated special check');

console.log('match staging minimal script tests passed');
