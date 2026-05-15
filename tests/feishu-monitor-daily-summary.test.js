const assert = require('assert');
const path = require('path');

const summary = require(path.join(__dirname, '..', 'standalone-services', 'feishu-monitor-daily-summary.js'));

const issues = [
  {
    title: '[monitor] 校区列表接口 401',
    body: [
      'fingerprint: api:https://www.flowtennis.cn/api/campuses:http-401',
      'status: resolved',
      'category: api',
      'target: 校区列表接口',
      'first_seen_at: 2026-05-14 12:03:00',
      'last_seen_at: 2026-05-14 16:03:00',
      'resolved_at: 2026-05-14 20:03:00',
      'last_error: HTTP 状态码错误: 401',
      'run_count: 2'
    ].join('\n')
  },
  {
    title: '[monitor] 管理后台首页关键字缺失',
    body: [
      'fingerprint: page:https://www.flowtennis.cn/:keyword-missing',
      'status: open',
      'category: page',
      'target: 管理后台首页',
      'first_seen_at: 2026-05-15 00:03:00',
      'last_seen_at: 2026-05-15 04:03:00',
      'resolved_at:',
      'last_error: 页面正文缺失关键字',
      'run_count: 2'
    ].join('\n')
  }
];

const stats = summary.buildDailyStats({
  issues,
  runCount: 6,
  startTime: '2026-05-14 08:23:00',
  endTime: '2026-05-15 08:23:00'
});

assert.strictEqual(stats.runCount, 6, '日报应汇总当天巡检次数');
assert.strictEqual(stats.discoveredCount, 2, '日报应统计时间窗口内首次发现的问题数');
assert.strictEqual(stats.resolvedCount, 1, '日报应统计时间窗口内已恢复的问题数');
assert.strictEqual(stats.openCount, 1, '日报应统计发送时仍遗留的问题数');
assert.strictEqual(stats.systemStatus, '仍有异常待处理', '存在 open 问题时状态应提示待处理');
assert.match(stats.detailLines.join('\n'), /\[接口\] 校区列表接口 401 报错/, '修复明细应输出接口异常人话');

const card = summary.buildDailySummaryCard(stats);
assert.match(card.card.header.title.content, /线上巡检日报/, '卡片标题应为线上巡检日报');
assert.match(card.card.elements[0].content, /累计巡检：\*\*6\*\* 次/, '卡片应展示累计巡检次数');
assert.match(card.card.elements[0].content, /待处遗留：\*\*1\*\* 个/, '卡片应展示遗留数');

console.log('feishu monitor daily summary tests passed');
