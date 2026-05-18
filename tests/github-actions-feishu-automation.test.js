const assert = require('assert');
const fs = require('fs');
const path = require('path');

const reportWorkflowPath = path.join(__dirname, '..', '.github', 'workflows', 'feishu-daily-report.yml');
const monitorWorkflowPath = path.join(__dirname, '..', '.github', 'workflows', 'feishu-monitor.yml');

const reportSource = fs.readFileSync(reportWorkflowPath, 'utf8');
const monitorSource = fs.readFileSync(monitorWorkflowPath, 'utf8');

assert.match(
  reportSource,
  /cron:\s*'0 12 \* \* \*'/,
  '日报 workflow 应在北京时间 20:00 对应的 UTC 12:00 触发'
);

assert.match(
  monitorSource,
  /cron:\s*'0 \*\/4 \* \* \*'/,
  '巡检 workflow 应每 4 小时触发一次'
);

assert.match(reportSource, /workflow_dispatch:/, '日报 workflow 应支持手动触发');
assert.match(monitorSource, /workflow_dispatch:/, '巡检 workflow 应支持手动触发');

assert.match(reportSource, /permissions:\s*\n\s*contents:\s*read/, '日报 workflow 应只保留 contents: read 权限');
assert.match(monitorSource, /permissions:\s*\n\s*contents:\s*read/, '巡检 workflow 应只保留 contents: read 权限');

assert.match(reportSource, /ALLOW_PRODUCTION_BOOTSTRAP_WRITES:\s*'false'/, '日报 workflow 应显式关闭生产 bootstrap 写开关');
assert.doesNotMatch(reportSource, /\bputRow\b|\bcreateTableIfMissing\b/, '日报 workflow 不应调用写表逻辑');
assert.doesNotMatch(monitorSource, /\bputRow\b|\bcreateTableIfMissing\b/, '巡检 workflow 不应调用写表逻辑');

assert.match(reportSource, /ALIBABA_CLOUD_ACCESS_KEY_ID:\s*\$\{\{\s*secrets\.TABLESTORE_READONLY_ACCESS_KEY_ID\s*\}\}/, '日报 workflow 应使用只读 TableStore AK');
assert.match(reportSource, /ALIBABA_CLOUD_ACCESS_KEY_SECRET:\s*\$\{\{\s*secrets\.TABLESTORE_READONLY_ACCESS_KEY_SECRET\s*\}\}/, '日报 workflow 应使用只读 TableStore SK');
assert.match(reportSource, /TS_ENDPOINT:\s*\$\{\{\s*secrets\.TABLESTORE_READONLY_ENDPOINT\s*\}\}/, '日报 workflow 应使用 TableStore 只读 endpoint');
assert.match(reportSource, /TS_INSTANCE:\s*\$\{\{\s*secrets\.TABLESTORE_READONLY_INSTANCE\s*\}\}/, '日报 workflow 应使用 TableStore 只读实例名');
assert.match(reportSource, /FEISHU_WEBHOOK_URL:\s*\$\{\{\s*secrets\.FEISHU_DAILY_REPORT_WEBHOOK\s*\}\}/, '日报 workflow 应使用飞书日报 webhook secret');

assert.match(monitorSource, /FEISHU_MONITOR_WEBHOOK_URL:\s*\$\{\{\s*secrets\.FEISHU_MONITOR_ALERT_WEBHOOK\s*\}\}/, '巡检 workflow 应使用飞书告警 webhook secret');

console.log('github actions feishu automation tests passed');
