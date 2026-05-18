const assert = require('assert');
const api = require('../api');

const rules = api._test;

assert.equal(typeof rules.resolveMatchClientContext, 'function', 'match guard should expose client context resolver');
assert.equal(typeof rules.assertMatchWriteAllowed, 'function', 'match guard should expose write guard');

const safeProdReq = {
  headers: {
    'x-flowtennis-client': 'mini-match',
    'x-flowtennis-client-env': 'production',
    'x-flowtennis-wechat-env-version': 'release'
  }
};
assert.doesNotThrow(
  () => rules.assertMatchWriteAllowed(safeProdReq, { runtimeStage: 'production' }),
  'production release traffic should keep write access'
);

assert.throws(
  () =>
    rules.assertMatchWriteAllowed(
      {
        headers: {
          'x-flowtennis-client': 'mini-match',
          'x-flowtennis-client-env': 'staging',
          'x-flowtennis-wechat-env-version': 'trial'
        }
      },
      { runtimeStage: 'production' }
    ),
  /测试版约球小程序禁止写入正式环境/,
  'production should reject staging client writes'
);

assert.throws(
  () =>
    rules.assertMatchWriteAllowed(
      {
        headers: {
          'x-flowtennis-client': 'mini-match',
          'x-flowtennis-client-env': 'production',
          'x-flowtennis-wechat-env-version': 'develop'
        }
      },
      { runtimeStage: 'production' }
    ),
  /测试版约球小程序禁止写入正式环境/,
  'production should reject non-release wechat env writes even when api base is production'
);

assert.doesNotThrow(
  () =>
    rules.assertMatchWriteAllowed(
      {
        headers: {
          'x-flowtennis-client': 'mini-match',
          'x-flowtennis-client-env': 'staging',
          'x-flowtennis-wechat-env-version': 'trial'
        }
      },
      { runtimeStage: 'preview' }
    ),
  'staging runtime should still accept staging writes'
);

console.log('match production guard tests passed');
