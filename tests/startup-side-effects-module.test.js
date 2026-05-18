const assert = require('assert');
const fs = require('fs');
const path = require('path');

const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const initRuntimeSource = fs.readFileSync(path.join(__dirname, '../api/bootstrap/init-runtime.js'), 'utf8');
const modulePath = path.join(__dirname, '../api/bootstrap/startup-side-effects.js');

assert.ok(fs.existsSync(modulePath), '启动副作用执行链应拆到独立模块');

const { createStartupSideEffectsRunner } = require(modulePath);
assert.strictEqual(typeof createStartupSideEffectsRunner, 'function', '启动副作用模块应导出 createStartupSideEffectsRunner');

assert.match(
  indexSource,
  /createStartupSideEffectsRunner/,
  'api/index.js 应注入统一启动副作用执行器'
);

assert.match(
  initRuntimeSource,
  /startupSideEffects/,
  'init runtime 应通过统一 startupSideEffects 执行高危启动写链'
);

async function main() {
  const steps = [];
  const runner = createStartupSideEffectsRunner({
    mkTable: async (tableName) => steps.push(`mk:${tableName}`),
    bootstrapDefaultUsers: async () => steps.push('bootstrapDefaultUsers'),
    ensureDefaultCampuses: async () => steps.push('ensureDefaultCampuses'),
    ensureCoachBindings: async () => steps.push('ensureCoachBindings'),
    bootstrapMabaoFinanceSeed: async () => steps.push('bootstrapMabaoFinanceSeed'),
    repairImportedLedgerDuplicates: async () => {
      steps.push('repairImportedLedgerDuplicates');
      return 3;
    },
    syncDefaultPricePlans: async () => steps.push('syncDefaultPricePlans')
  });

  await runner.ensureTables(['t_runtime_a', 't_runtime_b']);
  await runner.runBootstrapBase();
  await runner.runFinanceSeedBootstrap();
  const repairedCount = await runner.runImportedLedgerRepair();
  await runner.runDefaultPricePlanSync();

  assert.equal(repairedCount, 3, '启动副作用执行器应透传修复结果');
  assert.deepStrictEqual(steps, [
    'mk:t_runtime_a',
    'mk:t_runtime_b',
    'bootstrapDefaultUsers',
    'ensureDefaultCampuses',
    'ensureCoachBindings',
    'bootstrapMabaoFinanceSeed',
    'repairImportedLedgerDuplicates',
    'syncDefaultPricePlans'
  ], '启动副作用执行器应保持现有高危写链顺序');
}

main()
  .then(() => console.log('startup side effects module tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
