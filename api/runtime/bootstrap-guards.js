const PREVIEW_TS_INSTANCE = 'flow-staging';

function readBooleanEnv(env, name) {
  return String(env?.[name] || '').trim().toLowerCase() === 'true';
}

function resolveRuntimeStage(env = process.env) {
  const vercelEnv = String(env?.VERCEL_ENV || '').trim().toLowerCase();
  if (vercelEnv) return vercelEnv;
  const nodeEnv = String(env?.NODE_ENV || '').trim().toLowerCase();
  return nodeEnv || 'development';
}

function resolveDataStage(env = process.env) {
  const appEnv = String(env?.APP_ENV || '').trim().toLowerCase();
  if (appEnv) return appEnv;
  const dataEnv = String(env?.DATA_ENV || '').trim().toLowerCase();
  if (dataEnv) return dataEnv;
  return '';
}

function runtimeDebugEnvValue(env, name) {
  return String(env?.[name] || '').trim();
}

function assertRuntimeDebugReadable(env = process.env) {
  if (resolveRuntimeStage(env) === 'production') {
    throw new Error('production 环境已禁用该调试接口');
  }
}

function assertTableStoreTarget(env = process.env) {
  const runtimeStage = resolveRuntimeStage(env);
  const dataStage = resolveDataStage(env);
  const tsInstance = String(env?.TS_INSTANCE || '').trim();
  if (!tsInstance) return;
  const shouldUsePreviewInstance = runtimeStage === 'preview' || dataStage === 'staging';
  if (shouldUsePreviewInstance && tsInstance !== PREVIEW_TS_INSTANCE) {
    throw new Error(`Preview/staging 环境只允许连接 ${PREVIEW_TS_INSTANCE}，当前 TS_INSTANCE=${tsInstance}`);
  }
}

function buildBootstrapSafetyFlags(env = process.env) {
  const runtimeStage = resolveRuntimeStage(env);
  const isProduction = runtimeStage === 'production';
  const allowProductionBootstrapWrites = readBooleanEnv(env, 'ALLOW_PRODUCTION_BOOTSTRAP_WRITES');
  const allowHighRiskBootstrapWrites = !isProduction || allowProductionBootstrapWrites;
  return {
    runtimeStage,
    isProduction,
    allowProductionBootstrapWrites,
    enableDefaultUserBootstrap: readBooleanEnv(env, 'ENABLE_DEFAULT_USER_BOOTSTRAP') && allowHighRiskBootstrapWrites,
    enableTableBootstrap: readBooleanEnv(env, 'ENABLE_TABLE_BOOTSTRAP') && allowHighRiskBootstrapWrites,
    enableRuntimeTableEnsure: readBooleanEnv(env, 'ENABLE_RUNTIME_TABLE_ENSURE'),
    enableDefaultPricePlanBootstrap: readBooleanEnv(env, 'ENABLE_DEFAULT_PRICE_PLAN_BOOTSTRAP') && allowHighRiskBootstrapWrites,
    enableMabaoFinanceSeedBootstrap: readBooleanEnv(env, 'ENABLE_MABAO_FINANCE_SEED_BOOTSTRAP') && allowHighRiskBootstrapWrites,
    enableImportedLedgerAutoRepair: readBooleanEnv(env, 'ENABLE_IMPORTED_LEDGER_AUTO_REPAIR') && allowHighRiskBootstrapWrites
  };
}

function logBlockedAutoWrite(action, logger = console) {
  logger.warn(
    `[api-guard] ${action} skipped in production. 如需执行，请仅在获批运维修复场景下显式设置 ALLOW_PRODUCTION_BOOTSTRAP_WRITES=true。`
  );
}

module.exports = {
  PREVIEW_TS_INSTANCE,
  readBooleanEnv,
  resolveRuntimeStage,
  resolveDataStage,
  runtimeDebugEnvValue,
  assertRuntimeDebugReadable,
  assertTableStoreTarget,
  buildBootstrapSafetyFlags,
  logBlockedAutoWrite
};
