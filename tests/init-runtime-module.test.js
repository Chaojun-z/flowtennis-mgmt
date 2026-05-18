const assert = require('assert');
const { createInitRuntime } = require('../api/bootstrap/init-runtime.js');

async function main(){
  const steps = [];
  const logs = [];
  const runtime = createInitRuntime({
    env: { JWT_SECRET: 'x', TS_ENDPOINT: 'y', TS_INSTANCE: 'flow-staging', ALIBABA_CLOUD_ACCESS_KEY_ID: 'a', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'b' },
    requiredEnvVars: ['JWT_SECRET', 'TS_ENDPOINT', 'TS_INSTANCE', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'],
    rawFlags: {
      enableDefaultUserBootstrap: false,
      enableTableBootstrap: false,
      enableDefaultPricePlanBootstrap: false,
      enableMabaoFinanceSeedBootstrap: false,
      enableImportedLedgerAutoRepair: false
    },
    flags: {
      isProduction: false,
      allowProductionBootstrapWrites: false
    },
    enabledFlags: {
      enableRuntimeTableEnsure: true,
      enableTableBootstrap: false,
      enableDefaultUserBootstrap: false,
      enableDefaultPricePlanBootstrap: false,
      enableMabaoFinanceSeedBootstrap: false,
      enableImportedLedgerAutoRepair: false
    },
    startupSideEffects: {
      ensureTables: async (tableNames = []) => {
        for (const tableName of tableNames) steps.push(`mk:${tableName}`);
      },
      runBootstrapBase: async () => steps.push('runBootstrapBase'),
      runFinanceSeedBootstrap: async () => steps.push('runFinanceSeedBootstrap'),
      runImportedLedgerRepair: async () => {
        steps.push('runImportedLedgerRepair');
        return 0;
      },
      runDefaultPricePlanSync: async () => steps.push('runDefaultPricePlanSync')
    },
    runtimeEnsuredTables: ['t_runtime_a', 't_runtime_b'],
    assertTableStoreTarget: () => steps.push('guard'),
    prewarmHotScanCache: async () => steps.push('prewarmHotScanCache'),
    logger: {
      log: (message) => logs.push(message),
      warn: (message) => logs.push(message),
      error: (message) => logs.push(message)
    }
  });

  await runtime.init();
  await runtime.init();

  assert.deepStrictEqual(
    steps,
    ['guard', 'mk:t_runtime_a', 'mk:t_runtime_b', 'prewarmHotScanCache'],
    'init runtime should isolate guard, ensure tables once, and dispatch cache prewarm once'
  );
  assert.ok(logs.some((message) => String(message).includes('ensure runtime tables done')), 'runtime init should keep progress logging');

  let releaseRepair;
  const backgroundSteps = [];
  const backgroundRuntime = createInitRuntime({
    env: { JWT_SECRET: 'x', TS_ENDPOINT: 'y', TS_INSTANCE: 'flow-staging', ALIBABA_CLOUD_ACCESS_KEY_ID: 'a', ALIBABA_CLOUD_ACCESS_KEY_SECRET: 'b' },
    requiredEnvVars: ['JWT_SECRET', 'TS_ENDPOINT', 'TS_INSTANCE', 'ALIBABA_CLOUD_ACCESS_KEY_ID', 'ALIBABA_CLOUD_ACCESS_KEY_SECRET'],
    rawFlags: {
      enableDefaultUserBootstrap: false,
      enableTableBootstrap: false,
      enableDefaultPricePlanBootstrap: true,
      enableMabaoFinanceSeedBootstrap: true,
      enableImportedLedgerAutoRepair: true
    },
    flags: {
      isProduction: false,
      allowProductionBootstrapWrites: false
    },
    enabledFlags: {
      enableRuntimeTableEnsure: true,
      enableTableBootstrap: false,
      enableDefaultUserBootstrap: false,
      enableDefaultPricePlanBootstrap: true,
      enableMabaoFinanceSeedBootstrap: true,
      enableImportedLedgerAutoRepair: true
    },
    startupSideEffects: {
      ensureTables: async (tableNames = []) => {
        for (const tableName of tableNames) backgroundSteps.push(`mk:${tableName}`);
      },
      runBootstrapBase: async () => backgroundSteps.push('runBootstrapBase'),
      runFinanceSeedBootstrap: async () => backgroundSteps.push('runFinanceSeedBootstrap'),
      runImportedLedgerRepair: async () => {
        backgroundSteps.push('runImportedLedgerRepair:start');
        await new Promise((resolve) => {
          releaseRepair = resolve;
        });
        backgroundSteps.push('runImportedLedgerRepair:done');
        return 2;
      },
      runDefaultPricePlanSync: async () => backgroundSteps.push('runDefaultPricePlanSync')
    },
    runtimeEnsuredTables: ['t_runtime_c'],
    seedEnsureTables: ['t_seed_a'],
    assertTableStoreTarget: () => backgroundSteps.push('guard'),
    prewarmHotScanCache: async () => backgroundSteps.push('prewarmHotScanCache'),
    logger: {
      log: () => {},
      warn: () => {},
      error: () => {}
    }
  });

  const readyResult = await Promise.race([
    backgroundRuntime.init().then(() => 'init-resolved'),
    new Promise((resolve) => setTimeout(() => resolve('timed-out'), 20))
  ]);
  assert.equal(
    readyResult,
    'init-resolved',
    'init should not stay blocked behind background ledger repair'
  );
  assert.deepStrictEqual(
    backgroundSteps,
    ['guard', 'mk:t_runtime_c', 'mk:t_seed_a', 'prewarmHotScanCache', 'runFinanceSeedBootstrap', 'runImportedLedgerRepair:start'],
    'init should resolve after request-ready steps and dispatch maintenance chain without waiting for ledger repair completion'
  );

  releaseRepair();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepStrictEqual(
    backgroundSteps,
    [
      'guard',
      'mk:t_runtime_c',
      'mk:t_seed_a',
      'prewarmHotScanCache',
      'runFinanceSeedBootstrap',
      'runImportedLedgerRepair:start',
      'runImportedLedgerRepair:done',
      'runDefaultPricePlanSync'
    ],
    'background maintenance steps should continue after init resolves'
  );
}

main()
  .then(() => console.log('init runtime module tests passed'))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
