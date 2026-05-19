const axios = require('axios');

const BUG_WEBHOOK_URL = String(process.env.FEISHU_MONITOR_WEBHOOK_URL || '').trim();
const GITHUB_TOKEN = String(process.env.GITHUB_TOKEN || '').trim();
const GITHUB_REPOSITORY = String(process.env.GITHUB_REPOSITORY || '').trim();
const GITHUB_API_BASE = 'https://api.github.com';
const MONITOR_TITLE_PREFIX = '[monitor]';

function formatChinaTime(input = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(input instanceof Date ? input : new Date(input))
      .filter((item) => item.type !== 'literal')
      .map((item) => [item.type, item.value])
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

const TARGETS = [
  {
    name: '健康检查接口',
    url: 'https://www.flowtennis.cn/api/health',
    timeout: 3000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (!res.data || res.data.status !== 'ok') return `返回结构不符合预期 (需 status === "ok")`;
      return null;
    }
  },
  {
    name: '管理后台首页',
    url: 'https://www.flowtennis.cn/',
    timeout: 5000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (typeof res.data !== 'string' || !res.data.includes('FlowTennis 网球兄弟工作台')) {
        return '页面正文缺失关键字 "FlowTennis 网球兄弟工作台"';
      }
      return null;
    }
  },
  {
    name: '公开接口探活',
    url: 'https://www.flowtennis.cn/api/health',
    timeout: 3000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (!res.data || res.data.status !== 'ok') return `返回结构不符合预期 (需 status === "ok")`;
      return null;
    }
  }
];

function detectCategory(result) {
  if (/超时|耗时/i.test(result.error || '')) return 'performance';
  if (/接口/.test(result.name) || /\/api\//.test(result.url)) return 'api';
  return 'page';
}

function normalizeErrorForFingerprint(error = '') {
  const text = String(error).trim();
  const httpMatch = text.match(/HTTP\s*(?:状态码错误:|)(\s*\d{3})/i) || text.match(/HTTP\s+(\d{3})/i);
  if (httpMatch) return `http-${String(httpMatch[1]).trim()}`;
  if (/关键字/.test(text)) return 'keyword-missing';
  if (/超时/.test(text)) return 'timeout';
  return text.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '');
}

function buildFingerprint(result) {
  return `${detectCategory(result)}:${result.url}:${normalizeErrorForFingerprint(result.error)}`;
}

function issueTitleSuffix(result) {
  if (/HTTP 状态码错误:\s*401/i.test(result.error || '')) return '401 报错';
  if (/HTTP 状态码错误:\s*500/i.test(result.error || '')) return '500 报错';
  if (/关键字/.test(result.error || '')) return '关键字缺失';
  if (/超时/.test(result.error || '')) return '请求超时';
  return String(result.error || '异常').replace(/\s+/g, ' ').trim();
}

function buildIssueTitle(result) {
  return `${MONITOR_TITLE_PREFIX} ${result.name} ${issueTitleSuffix(result)}`.trim();
}

function buildIssueDraft(result, detectedAt) {
  return {
    title: buildIssueTitle(result),
    body: [
      `fingerprint: ${buildFingerprint(result)}`,
      'status: open',
      `category: ${detectCategory(result)}`,
      `target: ${result.name}`,
      `first_seen_at: ${detectedAt}`,
      `last_seen_at: ${detectedAt}`,
      'resolved_at:',
      `last_error: ${String(result.error || '').trim()}`,
      'run_count: 1'
    ].join('\n')
  };
}

function parseIssueBody(body = '') {
  const lines = String(body).split('\n');
  const parsed = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    parsed[key] = value;
  }
  return {
    fingerprint: parsed.fingerprint || '',
    status: parsed.status || 'open',
    category: parsed.category || '',
    target: parsed.target || '',
    firstSeenAt: parsed.first_seen_at || '',
    lastSeenAt: parsed.last_seen_at || '',
    resolvedAt: parsed.resolved_at || '',
    lastError: parsed.last_error || '',
    runCount: Number(parsed.run_count || 0) || 0
  };
}

function buildUpdatedIssueBody(existing, updates = {}) {
  const merged = {
    fingerprint: updates.fingerprint || existing.fingerprint || '',
    status: updates.status || existing.status || 'open',
    category: updates.category || existing.category || '',
    target: updates.target || existing.target || '',
    firstSeenAt: updates.firstSeenAt || existing.firstSeenAt || '',
    lastSeenAt: updates.lastSeenAt || existing.lastSeenAt || '',
    resolvedAt: Object.prototype.hasOwnProperty.call(updates, 'resolvedAt') ? (updates.resolvedAt || '') : (existing.resolvedAt || ''),
    lastError: Object.prototype.hasOwnProperty.call(updates, 'lastError') ? (updates.lastError || '') : (existing.lastError || ''),
    runCount: Object.prototype.hasOwnProperty.call(updates, 'runCount') ? updates.runCount : existing.runCount
  };

  return [
    `fingerprint: ${merged.fingerprint}`,
    `status: ${merged.status}`,
    `category: ${merged.category}`,
    `target: ${merged.target}`,
    `first_seen_at: ${merged.firstSeenAt}`,
    `last_seen_at: ${merged.lastSeenAt}`,
    `resolved_at: ${merged.resolvedAt}`,
    `last_error: ${merged.lastError}`,
    `run_count: ${merged.runCount || 0}`
  ].join('\n');
}

function githubHeaders() {
  if (!GITHUB_TOKEN || !GITHUB_REPOSITORY) return null;
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    'User-Agent': 'flowtennis-monitor-bot'
  };
}

async function githubRequest(method, url, data) {
  const headers = githubHeaders();
  if (!headers) return null;
  const response = await axios({
    method,
    url: `${GITHUB_API_BASE}${url}`,
    headers,
    data,
    timeout: 10000
  });
  return response.data;
}

async function listOpenMonitorIssues() {
  const data = await githubRequest('get', `/repos/${GITHUB_REPOSITORY}/issues?state=open&per_page=100`);
  if (!Array.isArray(data)) return [];
  return data.filter((issue) => !issue.pull_request && String(issue.title || '').startsWith(MONITOR_TITLE_PREFIX));
}

async function createMonitorIssue(result, detectedAt) {
  const draft = buildIssueDraft(result, detectedAt);
  return githubRequest('post', `/repos/${GITHUB_REPOSITORY}/issues`, draft);
}

async function updateMonitorIssue(issueNumber, body) {
  return githubRequest('patch', `/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}`, { body });
}

async function closeMonitorIssue(issueNumber, body) {
  return githubRequest('patch', `/repos/${GITHUB_REPOSITORY}/issues/${issueNumber}`, { body, state: 'closed' });
}

async function syncMonitorIssues(results, detectedAt) {
  const openIssues = await listOpenMonitorIssues();
  if (!openIssues) return;

  const issueMap = new Map();
  for (const issue of openIssues) {
    const parsed = parseIssueBody(issue.body || '');
    if (parsed.fingerprint) issueMap.set(parsed.fingerprint, { issue, parsed });
  }

  const failures = results.filter((item) => !item.success);
  const activeFingerprints = new Set();

  for (const failed of failures) {
    const fingerprint = buildFingerprint(failed);
    activeFingerprints.add(fingerprint);
    const existing = issueMap.get(fingerprint);
    if (existing) {
      const body = buildUpdatedIssueBody(existing.parsed, {
        status: 'open',
        category: detectCategory(failed),
        target: failed.name,
        lastSeenAt: detectedAt,
        lastError: failed.error,
        resolvedAt: '',
        runCount: (existing.parsed.runCount || 0) + 1
      });
      await updateMonitorIssue(existing.issue.number, body);
    } else {
      await createMonitorIssue(failed, detectedAt);
    }
  }

  for (const { issue, parsed } of issueMap.values()) {
    if (activeFingerprints.has(parsed.fingerprint)) continue;
    const body = buildUpdatedIssueBody(parsed, {
      status: 'resolved',
      resolvedAt: detectedAt
    });
    await closeMonitorIssue(issue.number, body);
  }
}

async function checkTarget(target) {
  const startTime = Date.now();
  try {
    const res = await axios.get(target.url, { timeout: target.timeout });
    const duration = Date.now() - startTime;
    const errorMsg = target.validate(res);
    if (errorMsg) {
      return { success: false, name: target.name, url: target.url, duration, error: errorMsg };
    }
    return { success: true, name: target.name, url: target.url, duration };
  } catch (error) {
    const duration = Date.now() - startTime;
    let errorMsg = error.message;
    if (error.code === 'ECONNABORTED') {
      errorMsg = `请求超时 (设定上限: ${target.timeout}ms)`;
    } else if (error.response) {
      errorMsg = `服务器报错 HTTP ${error.response.status}`;
    }
    return { success: false, name: target.name, url: target.url, duration, error: errorMsg };
  }
}

async function sendAlert(errors) {
  if (errors.length === 0) return;
  if (!BUG_WEBHOOK_URL) {
    console.error('❌ 缺少环境变量 FEISHU_MONITOR_WEBHOOK_URL');
    return;
  }

  const errorBlocks = errors.map((err) => `**🔴 [异常] ${err.name}**\n- 耗时: ${err.duration}ms\n- 报错: ${err.error}\n- 链接: ${err.url}`).join('\n\n');
  const payload = {
    msg_type: 'interactive',
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: 'red',
        title: {
          content: '🚨 [网球兄弟] 线上系统巡检告警',
          tag: 'plain_text'
        }
      },
      elements: [
        {
          tag: 'markdown',
          content: `**触发时间：** ${formatChinaTime()}\n\n${errorBlocks}`
        },
        { tag: 'hr' },
        {
          tag: 'note',
          elements: [{ tag: 'plain_text', content: '请相关开发人员尽快排查线上环境状况！' }]
        }
      ]
    }
  };

  try {
    const response = await axios.post(BUG_WEBHOOK_URL, payload);
    if (response.data.code === 0) {
      console.log('✅ 报警已发送至飞书！');
    } else {
      console.error('❌ 发送报警失败：', response.data);
    }
  } catch (e) {
    console.error('❌ 发送报警遇到网络异常：', e.message);
  }
}

async function runMonitors() {
  const detectedAt = formatChinaTime();
  console.log(`[Info] ${detectedAt} 开始执行线上巡检...`);

  const results = await Promise.all(TARGETS.map((t) => checkTarget(t)));
  const errors = results.filter((r) => !r.success);

  try {
    await syncMonitorIssues(results, detectedAt);
  } catch (error) {
    console.error(`❌ 巡检台账更新失败：${error.message}`);
  }

  if (errors.length > 0) {
    console.log(`[Warn] 发现 ${errors.length} 个异常，准备发送报警...`);
    await sendAlert(errors);
  } else {
    console.log('[Info] 所有接口巡检通过，无异常。');
  }
}

if (require.main === module) {
  runMonitors().catch((error) => {
    console.error(`❌ 巡检执行失败：${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  MONITOR_TITLE_PREFIX,
  buildFingerprint,
  buildIssueDraft,
  buildUpdatedIssueBody,
  detectCategory,
  formatChinaTime,
  parseIssueBody
};
