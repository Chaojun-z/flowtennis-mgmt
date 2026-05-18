const axios = require('axios');
const { MONITOR_TITLE_PREFIX, formatChinaTime, parseIssueBody } = require('./feishu-monitor');

const BUG_WEBHOOK_URL = String(process.env.FEISHU_MONITOR_WEBHOOK_URL || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const GITHUB_API_BASE = 'https://api.github.com';
const MONITOR_WORKFLOW_FILE = 'feishu-monitor.yml';

function windowEnd() {
  const raw = String(process.env.MONITOR_DAILY_END_AT || '').trim();
  if (raw) return raw;
  return formatChinaTime();
}

function windowStart(endAt) {
  const end = new Date(String(endAt).replace(' ', 'T') + '+08:00');
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return formatChinaTime(start);
}

function githubHeaders() {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'flowtennis-monitor-summary-bot'
  };
}

async function githubRequest(url) {
  const response = await axios.get(`${GITHUB_API_BASE}${url}`, {
    headers: githubHeaders(),
    timeout: 10000
  });
  return response.data;
}

function isWithinRange(value, start, end) {
  if (!value) return false;
  return value >= start && value <= end;
}

function detailLabel(category) {
  if (category === 'api') return '接口';
  if (category === 'performance') return '性能';
  return '页面';
}

function friendlyError(text = '') {
  const error = String(text);
  if (/401/.test(error)) return '401 报错';
  if (/500/.test(error)) return '500 报错';
  if (/关键字/.test(error)) return '关键字缺失';
  if (/超时/.test(error)) return '请求超时';
  return error;
}

function buildDailyStats({ issues, runCount, startTime, endTime }) {
  const parsedIssues = issues
    .filter((item) => String(item.title || '').startsWith(MONITOR_TITLE_PREFIX))
    .map((item) => ({ title: item.title, ...parseIssueBody(item.body || '') }));

  const discovered = parsedIssues.filter((item) => isWithinRange(item.firstSeenAt, startTime, endTime));
  const resolved = parsedIssues.filter((item) => item.status === 'resolved' && isWithinRange(item.resolvedAt, startTime, endTime));
  const openItems = parsedIssues.filter((item) => item.status === 'open');
  const detailLines = resolved.map((item) => `[${detailLabel(item.category)}] ${item.target} ${friendlyError(item.lastError)}`);

  return {
    startTime,
    endTime,
    runCount,
    discoveredCount: discovered.length,
    resolvedCount: resolved.length,
    openCount: openItems.length,
    systemStatus: openItems.length > 0 ? '仍有异常待处理' : '稳定运行中',
    detailLines
  };
}

function buildDailySummaryCard(stats) {
  const details = stats.detailLines.length ? stats.detailLines.join('\n') : '今日无新增修复明细';
  return {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'blue',
        title: {
          content: '🛡️ [网球兄弟] 线上巡检日报',
          tag: 'plain_text'
        }
      },
      elements: [
        {
          tag: 'markdown',
          content: `**巡检时间：** ${stats.startTime.slice(5, 16)} ~ ${stats.endTime.slice(5, 16)}\n\n**🔍 巡检概览**\n累计巡检：**${stats.runCount}** 次\n发现异常：**${stats.discoveredCount}** 个\n修复完成：**${stats.resolvedCount}** 个\n待处遗留：**${stats.openCount}** 个\n\n**🛠️ 修复明细**\n${details}\n\n**💡 系统当前状态：${stats.systemStatus}**`
        }
      ]
    }
  };
}

async function fetchMonitorIssues(startTime) {
  const openIssues = await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues?state=open&per_page=100`);
  const closedIssues = await githubRequest(`/repos/${GITHUB_REPOSITORY}/issues?state=closed&since=${encodeURIComponent(startTime.replace(' ', 'T') + '+08:00')}&per_page=100`);
  return [...openIssues, ...closedIssues].filter((item) => !item.pull_request);
}

async function fetchMonitorRunCount(startTime, endTime) {
  const data = await githubRequest(`/repos/${GITHUB_REPOSITORY}/actions/workflows/${MONITOR_WORKFLOW_FILE}/runs?per_page=100&event=schedule`);
  const runs = Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
  return runs.filter((run) => {
    const finishedAt = run.created_at ? formatChinaTime(run.created_at) : '';
    return finishedAt >= startTime && finishedAt <= endTime && run.conclusion === 'success';
  }).length;
}

async function sendDailySummary(card) {
  const response = await axios.post(BUG_WEBHOOK_URL, card);
  if (response.data.code !== 0) {
    throw new Error(`飞书返回异常：${JSON.stringify(response.data)}`);
  }
}

async function runDailySummary() {
  if (!BUG_WEBHOOK_URL) throw new Error('缺少环境变量 FEISHU_MONITOR_WEBHOOK_URL');
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) throw new Error('缺少 GitHub 读取权限配置');

  const endTime = windowEnd();
  const startTime = windowStart(endTime);
  const [issues, runCount] = await Promise.all([
    fetchMonitorIssues(startTime),
    fetchMonitorRunCount(startTime, endTime)
  ]);

  const stats = buildDailyStats({ issues, runCount, startTime, endTime });
  const card = buildDailySummaryCard(stats);
  await sendDailySummary(card);
  console.log(`✅ 巡检日报发送成功，窗口 ${startTime} ~ ${endTime}`);
}

if (require.main === module) {
  runDailySummary().catch((error) => {
    console.error(`❌ 巡检日报发送失败：${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  buildDailyStats,
  buildDailySummaryCard
};
