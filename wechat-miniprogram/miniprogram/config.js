const local = require('./env.local');
const staging = require('./env.staging');
const production = require('./env.production');

const ENV_MAP = { local, staging, production };
const DEFAULT_ENV = 'production';
// 热修默认值：线上版和测试版先统一走 production。
// 只有 staging 真正接好后，才把这里临时改成 'staging' 再上传测试版。
const MANUAL_ENV = '';

function normalizeEnvName(value) {
  const envName = String(value || '').trim();
  return ENV_MAP[envName] ? envName : '';
}

function readMiniProgramEnvVersion() {
  try {
    if (!wx || typeof wx.getAccountInfoSync !== 'function') return '';
    return String(wx.getAccountInfoSync()?.miniProgram?.envVersion || '').trim();
  } catch (error) {
    return '';
  }
}

function resolveActiveEnv() {
  const manualEnv = normalizeEnvName(MANUAL_ENV);
  if (manualEnv) return manualEnv;

  const envVersion = readMiniProgramEnvVersion();
  if (envVersion === 'release') return 'production';

  return DEFAULT_ENV;
}

const ACTIVE_ENV = resolveActiveEnv();
const activeConfig = ENV_MAP[ACTIVE_ENV] || production;

module.exports = {
  DEFAULT_ENV,
  MANUAL_ENV,
  ACTIVE_ENV,
  ...activeConfig
};
