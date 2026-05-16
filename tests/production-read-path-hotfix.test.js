const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(
  apiSource,
  /const LEAD_LIST_PROJECTION_FIELDS=\[/,
  '线索池应定义首屏轻投影字段，避免继续全量扫描 leads 大对象'
);

assert.match(
  apiSource,
  /const LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS=\[/,
  '线索跟进列表应定义轻投影字段，避免继续全量扫描 followups'
);

assert.match(
  apiSource,
  /const ADMIN_USER_LIST_PROJECTION_FIELDS=\[/,
  '账号管理应定义首屏轻投影字段，避免继续全量扫描 users 大对象'
);

assert.match(
  apiSource,
  /const SCHEDULE_LIST_PROJECTION_FIELDS=\[/,
  '排课表应定义首屏轻投影字段，避免继续全量扫描 schedule 大对象'
);

assert.match(
  apiSource,
  /if\(method==='GET'\)\{if\(user\.role==='admin'\)return sendJson\(res,await getCachedScan\(T_SCHEDULE,\{columns:SCHEDULE_LIST_PROJECTION_FIELDS\}\)\);/,
  '管理员排课表首屏应改成轻投影读取'
);

assert.match(
  apiSource,
  /const all=await getCachedScan\(T_USERS,\{columns:ADMIN_USER_LIST_PROJECTION_FIELDS\}\);return sendJson\(res,all\.map\(buildAdminUserView\)\);/,
  '账号管理首屏应改成轻投影读取'
);

assert.match(
  apiSource,
  /const rows=await getCachedScan\(T_LEAD_FOLLOWUPS,\{columns:LEAD_FOLLOWUP_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\);/,
  '线索跟进列表应改成轻投影读取'
);

assert.match(
  apiSource,
  /const rows=await getCachedScan\(T_LEADS,\{columns:LEAD_LIST_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\);/,
  '线索池列表应改成轻投影读取'
);

assert.match(
  apiSource,
  /const FINANCE_PAGE_COURT_PROJECTION_FIELDS=\[/,
  '财务总览应定义订场账户轻投影字段'
);

assert.match(
  apiSource,
  /getCachedScan\(T_COURTS,\{columns:FINANCE_PAGE_COURT_PROJECTION_FIELDS\}\)\.catch\(\(\)=>\[\]\)/,
  '财务快照应对 courts 使用轻投影，避免 history 导致超时'
);

console.log('production read path hotfix tests passed');
