const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const guardSource = fs.readFileSync(path.join(__dirname, '../api/runtime/bootstrap-guards.js'), 'utf8');
const initRuntimeSource = fs.readFileSync(path.join(__dirname, '../api/bootstrap/init-runtime.js'), 'utf8');
const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(apiSource, /const ENABLE_RUNTIME_TABLE_ENSURE = BOOTSTRAP_SAFETY_FLAGS\.enableRuntimeTableEnsure;/, 'api should expose runtime table ensure through the centralized safety flags');
assert.match(guardSource, /function buildBootstrapSafetyFlags\(env = process\.env\)/, 'bootstrap safety flags should move into the dedicated runtime guard module');
assert.match(apiSource, /const ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS\.enableMabaoFinanceSeedBootstrap;/, 'finance seed bootstrap should be filtered by runtime safety flags');
assert.match(apiSource, /const ENABLE_IMPORTED_LEDGER_AUTO_REPAIR = BOOTSTRAP_SAFETY_FLAGS\.enableImportedLedgerAutoRepair;/, 'imported ledger auto repair should be filtered by runtime safety flags');
assert.match(apiSource, /const \{ createInitRuntime \} = require\('\.\/bootstrap\/init-runtime\.js'\);/, 'api should delegate init orchestration to the dedicated init runtime module');
assert.match(apiSource, /const \{ createStartupSideEffectsRunner \} = require\('\.\/bootstrap\/startup-side-effects\.js'\);/, 'api should inject a dedicated startup side-effect runner');
assert.match(initRuntimeSource, /if \(enabledFlags\.enableRuntimeTableEnsure \|\| enabledFlags\.enableTableBootstrap\) \{[\s\S]*?await startupSideEffects\.ensureTables\(runtimeEnsuredTables\);/s, 'init runtime should only run runtime table ensure when explicit switch is enabled');
assert.doesNotMatch(initRuntimeSource, /for \(const tableName of runtimeEnsuredTables\) await mkTable\(tableName\);\s*if \(enabledFlags\.enableTableBootstrap\)/, 'init runtime should not unconditionally ensure runtime tables before bootstrap flag check');
assert.match(apiSource, /const ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP = BOOTSTRAP_SAFETY_FLAGS\.enableDefaultPricePlanBootstrap;/, 'default price plan bootstrap should be filtered by runtime safety flags');
assert.match(initRuntimeSource, /if \(enabledFlags\.enableDefaultPricePlanBootstrap\) \{[\s\S]*?await startupSideEffects\.runDefaultPricePlanSync\(\)\.catch\(\(err\) => logger\.error\('\[api-bootstrap\] sync default price plans failed', err\)\);/s, 'init runtime should only block on default price plan sync when explicit switch is enabled');
assert.doesNotMatch(initRuntimeSource, /if \(enabledFlags\.enableTableBootstrap\) \{[\s\S]*?\}\s*await syncDefaultPricePlans\(\)\.catch/, 'init runtime should not always block cold start on default price plan sync');
assert.doesNotMatch(initRuntimeSource, /else if \(!defaultPricePlanSyncStarted\) \{[\s\S]*syncDefaultPricePlans\(\)/, 'init runtime should not auto-dispatch default price plan writes when bootstrap flag is off');
assert.doesNotMatch(apiSource, /if\(path==='\/auth\/login'&&method==='POST'\)\{await init\(\);/, 'login should not block on init');
assert.doesNotMatch(initRuntimeSource, /\} else \{\s*const stepStartedAt = Date\.now\(\);\s*await ensureDefaultCampuses\(\);/s, 'normal runtime cold start should not write default campuses');
assert.match(initRuntimeSource, /function scheduleInitInBackground\(\)/, 'init runtime module should expose a background init scheduler');
assert.match(initRuntimeSource, /function dispatchMaintenance\(startedAt\)/, 'init runtime should split background maintenance into a dedicated dispatcher');
assert.match(initRuntimeSource, /logger\.log\(`\[api-init\] bootstrapDefaultUsers \/ ensureDefaultCampuses \/ ensureCoachBindings done \$\{Date\.now\(\) - stepStartedAt\}ms \(total \$\{Date\.now\(\) - startedAt\}ms\)`\);/, 'init runtime should log the bootstrap write-chain step duration');
assert.match(initRuntimeSource, /logger\.log\(`\[api-init\] bootstrapMabaoFinanceSeed done \$\{Date\.now\(\) - stepStartedAt\}ms \(total \$\{Date\.now\(\) - startedAt\}ms\)`\);/, 'init runtime should log the finance seed step duration');
assert.match(initRuntimeSource, /dispatchMaintenance\(startedAt\);\s*logger\.log\(`\[api-timing\] init request ready \$\{Date\.now\(\) - startedAt\}ms`\);/s, 'init runtime should mark request-ready before background maintenance finishes');
assert.doesNotMatch(initRuntimeSource, /initPromise = \(async \(\) => \{[\s\S]*await startupSideEffects\.runBootstrapBase\(\)[\s\S]*logger\.log\(`\[api-timing\] init request ready/s, 'init should not await bootstrap write chain before request-ready is reached');
assert.doesNotMatch(initRuntimeSource, /initPromise = \(async \(\) => \{[\s\S]*await startupSideEffects\.runImportedLedgerRepair\(\)[\s\S]*logger\.log\(`\[api-timing\] init request ready/s, 'init should not await imported ledger repair before request-ready is reached');
assert.doesNotMatch(initRuntimeSource, /initPromise = \(async \(\) => \{[\s\S]*await startupSideEffects\.runDefaultPricePlanSync\(\)[\s\S]*logger\.log\(`\[api-timing\] init request ready/s, 'init should not await default price plan sync before request-ready is reached');
assert.match(apiSource, /if\(path==='\/load-all'&&method==='GET'\)\{[\s\S]*if\(ENABLE_IMPORTED_LEDGER_AUTO_REPAIR\)await maybeRepairImportedLedgerDuplicates\(\);[\s\S]*timed\('load-all scan entitlement ledger'/s, 'load-all should only auto-repair imported ledger when the explicit repair switch is on');
assert.match(initRuntimeSource, /logger\.log\(`\[api-init\] prewarmHotScanCache dispatched \$\{Date\.now\(\) - stepStartedAt\}ms \(total \$\{Date\.now\(\) - startedAt\}ms\)`\);/, 'init runtime should log when cache prewarm is dispatched');
assert.doesNotMatch(stateSource, /load-all/, 'front-end page loading should not fall back to the heavy load-all endpoint');
assert.match(stateSource, /const PERFORMANCE_PAGE_DATA_GUARD=\{[\s\S]*students:\['entitlements','entitlementLedger','classes','schedule','feedbacks','courts'\][\s\S]*workbench:\['workbenchPage'\][\s\S]*\};/, 'page data performance guard should lock the current lazy-loading strategy');
assert.match(stateSource, /function assertPageDataPerformanceGuard\(\)/, 'state should expose a local guard against page-loading regressions');
assert.match(stateSource, /assertPageDataPerformanceGuard\(\);[\s\S]*const DATASET_LOADERS=/, 'page-loading guard should run before dataset loaders are used');

console.log('init performance guard tests passed');
