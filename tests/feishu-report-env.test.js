const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'standalone-services', 'feishu-report.js'),
  'utf8'
);

assert.match(
  source,
  /process\.env\.FEISHU_WEBHOOK_URL/,
  '飞书发送脚本应从环境变量读取 webhook'
);

assert.doesNotMatch(
  source,
  /open-apis\/bot\/v2\/hook\//,
  '飞书发送脚本不应写死 webhook'
);

console.log('feishu report env tests passed');
