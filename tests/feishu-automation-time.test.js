const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dailyWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-daily-report.yml'),
  'utf8'
);
const monitorWorkflow = fs.readFileSync(
  path.join(__dirname, '..', '.github', 'workflows', 'feishu-monitor.yml'),
  'utf8'
);
const monitorSource = fs.readFileSync(
  path.join(__dirname, '..', 'standalone-services', 'feishu-monitor.js'),
  'utf8'
);

assert.match(
  dailyWorkflow,
  /cron:\s*'3 12 \* \* \*'/,
  '日报 workflow 应避开整点触发，改为北京时间 20:03'
);

assert.match(
  monitorWorkflow,
  /cron:\s*'7 \*\/4 \* \* \*'/,
  '巡检 workflow 应避开整点触发，改为每 4 小时的第 7 分钟'
);

assert.match(
  monitorSource,
  /Asia\/Shanghai/,
  '巡检告警时间应显式按 Asia/Shanghai 格式化'
);

console.log('feishu automation time tests passed');
