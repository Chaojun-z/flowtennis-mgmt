const axios = require('axios');
const dayjs = require('dayjs');

// ==========================================
// 1. 飞书 Bug 报警 Webhook
// ==========================================
const BUG_WEBHOOK_URL = String(process.env.FEISHU_MONITOR_WEBHOOK_URL || '').trim();

// ==========================================
// 2. 严格遵循 Codex 给定的 3 个巡检目标
// ==========================================
const TARGETS = [
  {
    name: '健康检查接口',
    url: 'https://www.flowtennis.cn/api/health',
    timeout: 3000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (!res.data || res.data.status !== 'ok') return `返回结构不符合预期 (需 status === "ok")`;
      return null; // null 表示没有错误
    }
  },
  {
    name: '管理后台首页',
    url: 'https://www.flowtennis.cn/',
    timeout: 5000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (typeof res.data !== 'string' || !res.data.includes('FlowTennis 网球兄弟工作台')) {
        return `页面正文缺失关键字 "FlowTennis 网球兄弟工作台"`;
      }
      return null;
    }
  },
  {
    name: '校区列表接口',
    url: 'https://www.flowtennis.cn/api/campuses',
    timeout: 3000,
    validate: (res) => {
      if (res.status !== 200) return `HTTP 状态码错误: ${res.status}`;
      if (!Array.isArray(res.data)) return `返回数据不是一个 JSON 数组`;
      return null;
    }
  }
];

// ==========================================
// 3. 执行巡检
// ==========================================
async function checkTarget(target) {
  const startTime = Date.now();
  try {
    const res = await axios.get(target.url, { timeout: target.timeout });
    const duration = Date.now() - startTime;
    
    // 自定义验证逻辑
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

// ==========================================
// 4. 发送飞书报警卡片
// ==========================================
async function sendAlert(errors) {
  if (errors.length === 0) return;
  if (!BUG_WEBHOOK_URL) {
    console.error('❌ 缺少环境变量 FEISHU_MONITOR_WEBHOOK_URL');
    return;
  }

  const errorBlocks = errors.map(err => {
    return `**🔴 [异常] ${err.name}**\n- 耗时: ${err.duration}ms\n- 报错: ${err.error}\n- 链接: ${err.url}`;
  }).join('\n\n');

  const payload = {
    msg_type: "interactive",
    card: {
      config: { wide_screen_mode: true },
      header: {
        template: "red",
        title: {
          content: "🚨 [网球兄弟] 线上系统巡检告警",
          tag: "plain_text"
        }
      },
      elements: [
        {
          tag: "markdown",
          content: `**触发时间：** ${dayjs().format('YYYY-MM-DD HH:mm:ss')}\n\n${errorBlocks}`
        },
        {
          tag: "hr"
        },
        {
          tag: "note",
          elements: [{ tag: "plain_text", content: "请相关开发人员尽快排查线上环境状况！" }]
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

// ==========================================
// 主流程
// ==========================================
async function runMonitors() {
  console.log(`[Info] ${dayjs().format('HH:mm:ss')} 开始执行线上巡检...`);
  
  const results = await Promise.all(TARGETS.map(t => checkTarget(t)));
  const errors = results.filter(r => !r.success);
  
  if (errors.length > 0) {
    console.log(`[Warn] 发现 ${errors.length} 个异常，准备发送报警...`);
    await sendAlert(errors);
  } else {
    console.log(`[Info] 所有接口巡检通过，无异常。`);
  }
}

runMonitors();
