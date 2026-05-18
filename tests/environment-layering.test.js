const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fileExists(relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

const packageJson = readJson('package.json');
assert.match(
  String(packageJson.scripts.dev || ''),
  /APP_ENV=local/,
  'npm run dev should explicitly pin local environment'
);
assert.match(
  String(packageJson.scripts['dev:staging'] || ''),
  /APP_ENV=staging/,
  'package.json should expose a staging dev command'
);
assert.ok(packageJson.scripts['staging-data:sanitize'], 'package.json should expose staging sanitize command');
assert.ok(packageJson.scripts['staging-data:import'], 'package.json should expose staging import command');
assert.ok(packageJson.scripts['guard:finance'], 'package.json should expose finance guard command');
assert.match(
  String(packageJson.scripts['guard:finance'] || ''),
  /scripts\/dev\/finance-regression\.js/,
  'finance guard should point to scripts/dev/finance-regression.js'
);
assert.ok(packageJson.scripts['staging:ensure-login-minimal:check'], 'package.json should expose staging login check command');
assert.ok(packageJson.scripts['staging:ensure-login-minimal:write'], 'package.json should expose staging login write command');
assert.ok(packageJson.scripts['staging:ensure-browse-minimal:check'], 'package.json should expose staging browse check command');
assert.ok(packageJson.scripts['staging:ensure-browse-minimal:write'], 'package.json should expose staging browse write command');

const devServerText = readText('scripts/dev/dev-server.js');
assert.doesNotMatch(devServerText, /dotenv\.config/, 'dev-server should stop reading root .env directly');
assert.match(devServerText, /loadRuntimeEnv/, 'dev-server should load env through the shared runtime loader');

const financeGuardText = readText('scripts/dev/finance-regression.js');
assert.match(financeGuardText, /\.\.\', '\.\.\', 'config'/, 'finance guard should resolve config from scripts/dev');

const stagingLoginText = readText('scripts/staging/ensure-staging-login-minimal.js');
assert.doesNotMatch(stagingLoginText, /dotenv\.config/, 'staging login script should stop reading root .env directly');
assert.match(stagingLoginText, /loadRuntimeEnv/, 'staging login script should load env through the shared runtime loader');
assert.match(stagingLoginText, /SOURCE_TS_INSTANCE/, 'staging login script should require explicit source instance');
assert.match(stagingLoginText, /--write/, 'staging login script should require explicit write mode');

const stagingBrowseText = readText('scripts/staging/ensure-staging-browse-minimal.js');
assert.doesNotMatch(stagingBrowseText, /dotenv\.config/, 'staging browse script should stop reading root .env directly');
assert.match(stagingBrowseText, /loadRuntimeEnv/, 'staging browse script should load env through the shared runtime loader');
assert.match(stagingBrowseText, /--write/, 'staging browse script should require explicit write mode');

const runtimeEnv = require('../scripts/lib/runtime-env');
assert.strictEqual(runtimeEnv.resolveAppEnv({ APP_ENV: 'local' }), 'local', 'runtime env should resolve local stage');
assert.strictEqual(runtimeEnv.resolveAppEnv({ APP_ENV: 'staging' }), 'staging', 'runtime env should resolve staging stage');
assert.strictEqual(runtimeEnv.resolveAppEnv({ APP_ENV: 'production' }), 'production', 'runtime env should resolve production stage');
assert.strictEqual(
  path.basename(runtimeEnv.resolveEnvFilePath({ appEnv: 'local' })),
  '.env.local',
  'local stage should map to .env.local'
);
assert.strictEqual(
  path.basename(runtimeEnv.resolveEnvFilePath({ appEnv: 'staging' })),
  '.env.staging',
  'staging stage should map to .env.staging'
);
assert.strictEqual(
  path.basename(runtimeEnv.resolveEnvFilePath({ appEnv: 'production' })),
  '.env.production',
  'production stage should prefer .env.production'
);
assert.throws(
  () =>
    runtimeEnv.assertSafeRuntimeEnv({
      appEnv: 'local',
      envFilePath: path.join(root, '.env.local'),
      loadedEnv: {
        TS_ENDPOINT: 'https://prod.example.com',
        MATCH_DATABASE_URL: 'postgres://prod-db.internal/flowtennis'
      }
    }),
  /local 环境禁止连接生产/,
  'local env should reject production-like targets'
);

assert.ok(fileExists('.env.example'), 'repo should provide .env.example');
assert.ok(fileExists('.env.local.example'), 'repo should provide .env.local.example');
assert.ok(fileExists('.env.staging.example'), 'repo should provide .env.staging.example');
assert.ok(fileExists('.env.production.example'), 'repo should provide .env.production.example');

const gitignoreText = readText('.gitignore');
assert.match(gitignoreText, /^\.env\.local$/m, '.gitignore should ignore .env.local');
assert.match(gitignoreText, /^\.env\.staging$/m, '.gitignore should ignore .env.staging');
assert.match(gitignoreText, /^\.env\.production$/m, '.gitignore should ignore .env.production');

const miniConfigText = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(miniConfigText, /ACTIVE_ENV/, 'mini program config should expose ACTIVE_ENV');
assert.match(miniConfigText, /env\.staging/, 'mini program config should route through env.staging');
assert.match(miniConfigText, /env\.production/, 'mini program config should route through env.production');
assert.match(miniConfigText, /MANUAL_ENV/, 'mini program config should expose a manual env override for hotfix uploads');
assert.doesNotMatch(
  miniConfigText,
  /API_BASE_URL:\s*'https:\/\/www\.flowtennis\.cn\/api'/,
  'mini program config should no longer hardcode production API as the default export'
);

const miniConfigPath = path.join(root, 'wechat-miniprogram/miniprogram/config.js');
const miniConfigResolvedPath = require.resolve(miniConfigPath);
const originalWx = global.wx;

function loadMiniConfigWithWx(wxMock) {
  delete require.cache[miniConfigResolvedPath];
  if (wxMock) {
    global.wx = wxMock;
  } else {
    delete global.wx;
  }
  return require(miniConfigPath);
}

let miniConfig = loadMiniConfigWithWx();
assert.strictEqual(
  miniConfig.ACTIVE_ENV,
  'production',
  'mini program config should default to production when no explicit override is provided'
);
assert.strictEqual(
  miniConfig.API_BASE_URL,
  'https://www.flowtennis.cn/api',
  'mini program config should send requests to production by default'
);

miniConfig = loadMiniConfigWithWx({
  getAccountInfoSync() {
    return { miniProgram: { envVersion: 'release' } };
  }
});
assert.strictEqual(
  miniConfig.ACTIVE_ENV,
  'production',
  'release builds should stay on production'
);

miniConfig = loadMiniConfigWithWx({
  getAccountInfoSync() {
    return { miniProgram: { envVersion: 'trial' } };
  }
});
assert.strictEqual(
  miniConfig.ACTIVE_ENV,
  'production',
  'trial builds should also stay on production until staging is explicitly wired'
);

delete require.cache[miniConfigResolvedPath];
if (originalWx) {
  global.wx = originalWx;
} else {
  delete global.wx;
}

assert.ok(fileExists('wechat-miniprogram/miniprogram/env.local.js'), 'mini program should provide local env config');
assert.ok(fileExists('wechat-miniprogram/miniprogram/env.staging.js'), 'mini program should provide staging env config');
assert.ok(fileExists('wechat-miniprogram/miniprogram/env.production.js'), 'mini program should provide production env config');

assert.ok(fileExists('staging-data/README.md'), 'repo should provide staging-data README');
assert.ok(fileExists('staging-data/manifests/staging-refresh.template.json'), 'repo should provide staging manifest template');
assert.ok(
  fileExists('staging-data/checklists/first-staging-refresh-checklist.md'),
  'repo should provide first staging refresh checklist'
);
assert.ok(fileExists('scripts/staging/staging-data-sanitize.js'), 'repo should provide staging sanitize script');
assert.ok(fileExists('scripts/staging/staging-data-import.js'), 'repo should provide staging import script');
assert.ok(fileExists('scripts/staging/staging-data-export.js'), 'repo should provide staging export script');
assert.ok(fileExists('scripts/staging/ensure-staging-login-minimal.js'), 'repo should provide staging login minimal script');
assert.ok(fileExists('scripts/staging/ensure-staging-browse-minimal.js'), 'repo should provide staging browse minimal script');
assert.ok(fileExists('scripts/dev/dev-server.js'), 'repo should provide dev server script under scripts/dev');
assert.ok(fileExists('scripts/dev/migrate-match-db.js'), 'repo should provide match db migration script under scripts/dev');
assert.ok(fileExists('scripts/dev/finance-regression.js'), 'repo should provide finance regression script under scripts/dev');

console.log('environment layering tests passed');
