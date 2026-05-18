const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'standalone-services', 'feishu-changelog.js'),
  'utf8'
);

assert.match(
  source,
  /process\.env\.FEISHU_CHANGELOG_WEBHOOK/,
  '更新日志脚本应从环境变量读取 webhook'
);

assert.doesNotMatch(
  source,
  /open-apis\/bot\/v2\/hook\//,
  '更新日志脚本不应写死 webhook'
);

console.log('feishu changelog env tests passed');
