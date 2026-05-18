function createInitRuntime(options) {
  const {
    env = process.env,
    logger = console,
    requiredEnvVars = [],
    rawFlags = {},
    flags = {},
    enabledFlags = {},
    startupSideEffects,
    runtimeEnsuredTables = [],
    seedEnsureTables = [],
    bootstrapTables = [],
    assertTableStoreTarget,
    logBlockedAutoWrite,
    prewarmHotScanCache
  } = options;

  let inited = false;
  let initPromise = null;
  let maintenancePromise = null;
  let maintenanceCompleted = false;

  function hasEnvValue(name) {
    return Boolean(env?.[name]);
  }

  function scheduleInitInBackground() {
    if (requiredEnvVars.some((name) => !hasEnvValue(name))) return;
    if (inited) {
      dispatchMaintenance(Date.now());
      return;
    }
    if (initPromise) return;
    init().catch((err) => logger.error('[api-init] background init failed', err));
  }

  function dispatchMaintenance(startedAt) {
    if (maintenanceCompleted || maintenancePromise) return maintenancePromise;
    maintenancePromise = (async () => {
      if (enabledFlags.enableTableBootstrap) {
        let stepStartedAt = Date.now();
        await startupSideEffects.ensureTables(bootstrapTables);
        logger.log(`[api-init] ensure bootstrap tables done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);

        stepStartedAt = Date.now();
        await startupSideEffects.runBootstrapBase();
        logger.log(`[api-init] bootstrapDefaultUsers / ensureDefaultCampuses / ensureCoachBindings done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      if (enabledFlags.enableMabaoFinanceSeedBootstrap) {
        const stepStartedAt = Date.now();
        await startupSideEffects.runFinanceSeedBootstrap();
        logger.log(`[api-init] bootstrapMabaoFinanceSeed done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      if (enabledFlags.enableImportedLedgerAutoRepair) {
        const stepStartedAt = Date.now();
        const repairedCount = await startupSideEffects.runImportedLedgerRepair();
        logger.log(
          `[api-init] repairImportedLedgerDuplicates done ${Date.now() - stepStartedAt}ms, removed ${repairedCount} rows (total ${Date.now() - startedAt}ms)`
        );
      }

      if (enabledFlags.enableDefaultPricePlanBootstrap) {
        const stepStartedAt = Date.now();
        await startupSideEffects.runDefaultPricePlanSync().catch((err) => logger.error('[api-bootstrap] sync default price plans failed', err));
        logger.log(`[api-init] syncDefaultPricePlans done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      maintenanceCompleted = true;
      logger.log(`[api-timing] init maintenance finished ${Date.now() - startedAt}ms`);
    })().catch((err) => {
      maintenancePromise = null;
      throw err;
    });

    maintenancePromise.catch((err) => logger.error('[api-init] background maintenance failed', err));
    return maintenancePromise;
  }

  async function init() {
    if (inited) {
      dispatchMaintenance(Date.now());
      return;
    }
    if (initPromise) return initPromise;
    initPromise = (async () => {
      const startedAt = Date.now();
      const missing = requiredEnvVars.filter((name) => !hasEnvValue(name));
      if (missing.length) throw new Error(`缺少环境变量：${missing.join(', ')}`);

      assertTableStoreTarget(env);

      if (rawFlags.enableDefaultUserBootstrap && !enabledFlags.enableDefaultUserBootstrap && flags.isProduction) logBlockedAutoWrite('bootstrapDefaultUsers', logger);
      if (rawFlags.enableTableBootstrap && !enabledFlags.enableTableBootstrap && flags.isProduction) logBlockedAutoWrite('ENABLE_TABLE_BOOTSTRAP', logger);
      if (rawFlags.enableDefaultPricePlanBootstrap && !enabledFlags.enableDefaultPricePlanBootstrap && flags.isProduction) logBlockedAutoWrite('syncDefaultPricePlans', logger);
      if (rawFlags.enableMabaoFinanceSeedBootstrap && !enabledFlags.enableMabaoFinanceSeedBootstrap && flags.isProduction) logBlockedAutoWrite('bootstrapMabaoFinanceSeed', logger);
      if (rawFlags.enableImportedLedgerAutoRepair && !enabledFlags.enableImportedLedgerAutoRepair && flags.isProduction) logBlockedAutoWrite('repairImportedLedgerDuplicates', logger);

      if (enabledFlags.enableRuntimeTableEnsure || enabledFlags.enableTableBootstrap) {
        const stepStartedAt = Date.now();
        await startupSideEffects.ensureTables(runtimeEnsuredTables);
        logger.log(`[api-init] ensure runtime tables done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      if (enabledFlags.enableMabaoFinanceSeedBootstrap) {
        const stepStartedAt = Date.now();
        await startupSideEffects.ensureTables(seedEnsureTables);
        logger.log(`[api-init] ensure mabao seed tables done ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      inited = true;

      {
        const stepStartedAt = Date.now();
        prewarmHotScanCache().catch((err) => logger.error('[api-timing] prewarm hot tables failed', err));
        logger.log(`[api-init] prewarmHotScanCache dispatched ${Date.now() - stepStartedAt}ms (total ${Date.now() - startedAt}ms)`);
      }

      dispatchMaintenance(startedAt);
      logger.log(`[api-timing] init request ready ${Date.now() - startedAt}ms`);
    })().catch((err) => {
      initPromise = null;
      inited = false;
      throw err;
    });

    return initPromise;
  }

  return {
    init,
    scheduleInitInBackground,
    isInited: () => inited,
    hasInitPromise: () => Boolean(initPromise)
  };
}

module.exports = {
  createInitRuntime
};
