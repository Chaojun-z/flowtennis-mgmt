const assert = require('assert');
const path = require('path');

const monitor = require(path.join(__dirname, '..', 'standalone-services', 'feishu-monitor.js'));
const source = require('fs').readFileSync(path.join(__dirname, '..', 'standalone-services', 'feishu-monitor.js'), 'utf8');

assert.doesNotMatch(source, /https:\/\/www\.flowtennis\.cn\/api\/campuses/, '巡检不应裸请求需要后台登录态的校区接口');
assert.match(source, /name: '公开接口探活'[\s\S]*url: 'https:\/\/www\.flowtennis\.cn\/api\/health'/, '巡检应使用无需登录的公开健康接口做 API 探活');

const failed = {
  success: false,
  name: '公开接口探活',
  url: 'https://www.flowtennis.cn/api/health',
  duration: 3210,
  error: '请求超时 (设定上限: 3000ms)'
};

const fingerprint = monitor.buildFingerprint(failed);
assert.strictEqual(fingerprint, 'performance:https://www.flowtennis.cn/api/health:timeout', '同类接口异常应生成稳定指纹');

const issue = monitor.buildIssueDraft(failed, '2026-05-15 12:03:00');
assert.match(issue.title, /^\[monitor\] 公开接口探活 /, 'issue 标题应带 monitor 前缀');
assert.match(issue.body, /fingerprint: performance:https:\/\/www\.flowtennis\.cn\/api\/health:timeout/, 'issue body 应写入指纹');
assert.match(issue.body, /status: open/, '新问题默认应为 open');
assert.match(issue.body, /run_count: 1/, '新问题 run_count 应为 1');

const parsed = monitor.parseIssueBody(issue.body);
assert.strictEqual(parsed.fingerprint, fingerprint, '应能从 issue body 还原指纹');
assert.strictEqual(parsed.status, 'open', '应能还原 open 状态');

const updatedOpen = monitor.buildUpdatedIssueBody(parsed, {
  status: 'open',
  lastSeenAt: '2026-05-15 16:03:00',
  lastError: '请求超时 (设定上限: 3000ms)',
  runCount: 2
});
assert.match(updatedOpen, /last_seen_at: 2026-05-15 16:03:00/, '重复异常应刷新最近发现时间');
assert.match(updatedOpen, /run_count: 2/, '重复异常不应新建 issue，而应累计 run_count');

const updatedResolved = monitor.buildUpdatedIssueBody(parsed, {
  status: 'resolved',
  resolvedAt: '2026-05-15 20:03:00'
});
assert.match(updatedResolved, /status: resolved/, '恢复后应标记 resolved');
assert.match(updatedResolved, /resolved_at: 2026-05-15 20:03:00/, '恢复后应记录 resolved_at');

console.log('feishu monitor rules tests passed');
