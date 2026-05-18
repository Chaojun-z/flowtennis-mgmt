const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const APP_ENVS = new Set(['local', 'staging', 'production']);
const DEFAULT_APP_ENV = 'local';
const PRODUCTION_VALUE_PATTERN = /(flowtennis\.cn|prod(uction)?)/i;
const PRODUCTION_OVERRIDE_FLAG = 'ALLOW_PRODUCTION_DATA_FOR_NON_PROD';

function resolveRootDir(rootDir) {
  return rootDir || path.join(__dirname, '..', '..');
}

function resolveAppEnv(env = process.env) {
  const raw = String(env.APP_ENV || '').trim().toLowerCase();
  if (!raw) return DEFAULT_APP_ENV;
  if (APP_ENVS.has(raw)) return raw;
  throw new Error(`不支持的 APP_ENV: ${raw}。仅允许 local / staging / production`);
}

function resolveEnvCandidates(appEnv) {
  if (appEnv === 'staging') return ['.env.staging'];
  if (appEnv === 'production') return ['.env.production', '.env'];
  return ['.env.local'];
}

function resolveEnvFilePath({ appEnv, rootDir } = {}) {
  const resolvedRootDir = resolveRootDir(rootDir);
  const stage = appEnv || DEFAULT_APP_ENV;
  const [preferred] = resolveEnvCandidates(stage);
  return path.join(resolvedRootDir, preferred);
}

function findExistingEnvFile({ appEnv, rootDir } = {}) {
  const resolvedRootDir = resolveRootDir(rootDir);
  const stage = appEnv || DEFAULT_APP_ENV;
  const candidates = resolveEnvCandidates(stage).map((name) => path.join(resolvedRootDir, name));
  const existing = candidates.find((filePath) => fs.existsSync(filePath));
  return { existing, candidates };
}

function isProductionLikeValue(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  return PRODUCTION_VALUE_PATTERN.test(text);
}

function buildUnsafeFields(loadedEnv = {}) {
  return ['DATA_ENV', 'TS_ENDPOINT', 'MATCH_DATABASE_URL', 'DATABASE_URL', 'API_BASE_URL']
    .filter((key) => key in loadedEnv)
    .filter((key) => {
      const value = loadedEnv[key];
      if (key === 'DATA_ENV') return String(value || '').trim().toLowerCase() === 'production';
      return isProductionLikeValue(value);
    });
}

function assertSafeRuntimeEnv({ appEnv, envFilePath, loadedEnv } = {}) {
  const stage = appEnv || DEFAULT_APP_ENV;
  if (stage === 'production') return;
  if (String(loadedEnv?.[PRODUCTION_OVERRIDE_FLAG] || '').trim().toLowerCase() === 'true') return;
  const unsafeFields = buildUnsafeFields(loadedEnv);
  if (unsafeFields.length) {
    throw new Error(
      `${stage} 环境禁止连接生产。请改用 dev/staging 数据，或仅在获批场景下显式设置 ${PRODUCTION_OVERRIDE_FLAG}=true。触发字段: ${unsafeFields.join(', ')}。来源文件: ${envFilePath}`
    );
  }
}

function loadRuntimeEnv({ appEnv, rootDir, allowMissing = false, entry = 'script' } = {}) {
  const resolvedAppEnv = appEnv || resolveAppEnv(process.env);
  const resolvedRootDir = resolveRootDir(rootDir);
  const { existing, candidates } = findExistingEnvFile({ appEnv: resolvedAppEnv, rootDir: resolvedRootDir });
  if (!existing) {
    if (allowMissing) {
      return {
        appEnv: resolvedAppEnv,
        envFilePath: '',
        loadedEnv: process.env,
        loaded: false
      };
    }
    throw new Error(
      `[${entry}] 缺少 ${candidates.map((filePath) => path.basename(filePath)).join(' / ')}。本地默认不得再直接贴生产跑，请先从对应 .example 复制配置。`
    );
  }
  dotenv.config({ path: existing, override: false });
  process.env.APP_ENV = resolvedAppEnv;
  assertSafeRuntimeEnv({ appEnv: resolvedAppEnv, envFilePath: existing, loadedEnv: process.env });
  return {
    appEnv: resolvedAppEnv,
    envFilePath: existing,
    loadedEnv: process.env,
    loaded: true
  };
}

module.exports = {
  APP_ENVS,
  DEFAULT_APP_ENV,
  PRODUCTION_OVERRIDE_FLAG,
  resolveAppEnv,
  resolveEnvFilePath,
  assertSafeRuntimeEnv,
  loadRuntimeEnv
};
