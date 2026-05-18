const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'standalone-services', 'feishu-monitor.js'),
  'utf8'
);

assert.match(
  source,
  /process\.env\.FEISHU_MONITOR_WEBHOOK_URL/,
  '巡检告警脚本应从环境变量读取 webhook'
);

assert.doesNotMatch(
  source,
  /open-apis\/bot\/v2\/hook\//,
  '巡检告警脚本不应写死 webhook'
);

console.log('feishu monitor env tests passed');
