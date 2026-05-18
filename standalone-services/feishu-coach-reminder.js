const fs = require('fs');
const axios = require('axios');
const dayjs = require('dayjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

// ==========================================
// 1. 配置信息
// ==========================================
const DATA_PATH = path.join(__dirname, 'daily-report-data.json');
const COACH_PHONES_PATH = path.join(__dirname, 'config', 'coach-phones.json');

// 飞书接口配置
const FEISHU_APP_ID = process.env.FEISHU_APP_ID;
const FEISHU_APP_SECRET = process.env.FEISHU_APP_SECRET;

// ==========================================
// 2. 按教练分组数据
// ==========================================
function groupLessonsByCoach(data) {
  const { tomorrow, tomorrowLessonDetails } = data;
  
  // 如果没有明细数据，直接返回空
  if (!tomorrowLessonDetails || tomorrowLessonDetails.length === 0) {
    return { tomorrowDate: tomorrow, coachMap: {} };
  }
  
  // 过滤出明天有效的排课
  const validLessons = tomorrowLessonDetails.filter(l => l.status !== '已取消');
  
  // 按时间早晚排序
  validLessons.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());

  // 按教练名分组
  const coachMap = {};
  for (const lesson of validLessons) {
    if (!coachMap[lesson.coachName]) {
      coachMap[lesson.coachName] = [];
    }
    coachMap[lesson.coachName].push(lesson);
  }

  return { tomorrowDate: tomorrow, coachMap };
}

// ==========================================
// 3. 组装发给单人的卡片字符串 (飞书IM接口要求)
// ==========================================
function buildCoachCardString(coachName, lessons, tomorrowDate) {
  let scheduleStr = lessons.map((l, index) => {
    const start = dayjs(l.startTime).format('HH:mm');
    const end = dayjs(l.endTime).format('HH:mm');
    return `**${index + 1}. ${l.className || l.courseType}**\n🕒 时间：${start} - ${end}\n📍 场地：${l.campusName} ${l.venue}\n👥 学员：${l.studentCount}人`;
  }).join('\n\n');

  // 注意：飞书自建应用发送消息，Interactive 类型的 content 必须是 JSON 字符串
  return JSON.stringify({
    config: { wide_screen_mode: true },
    header: {
      template: "orange",
      title: {
        content: `🎾 [网球兄弟] 明日排课提醒`,
        tag: "plain_text"
      }
    },
    elements: [
      {
        tag: "markdown",
        content: `您好，**${coachName}** 教练！\n明天 (${tomorrowDate}) 您共有 **${lessons.length}** 节课安排，请提前做好准备：`
      },
      { tag: "hr" },
      {
        tag: "markdown",
        content: scheduleStr
      },
      { tag: "hr" },
      {
        tag: "note",
        elements: [{ tag: "plain_text", content: "祝您上课顺利！如需调课请提前联系排课老师。" }]
      }
    ]
  });
}

// ==========================================
// 4. 飞书 API 封装
// ==========================================
// 获取企业自建应用 access_token
async function getTenantAccessToken() {
  const res = await axios.post('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    app_id: FEISHU_APP_ID,
    app_secret: FEISHU_APP_SECRET
  });
  if (res.data.code !== 0) {
    throw new Error(`获取 tenant_access_token 失败: ${res.data.msg}`);
  }
  return res.data.tenant_access_token;
}

// 根据手机号获取 open_id
async function getOpenIdByPhone(token, phone) {
  const res = await axios.post('https://open.feishu.cn/open-apis/contact/v3/users/batch_get_id?user_id_type=open_id', {
    mobiles: [phone]
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.data.code !== 0) {
    console.error(`[Warn] 获取手机号 ${phone} 的 open_id 失败: ${res.data.msg}`);
    return null;
  }
  
  const userList = res.data.data.user_list;
  if (!userList || userList.length === 0 || !userList[0].user_id) {
    console.error(`[Warn] 飞书企业内未找到手机号为 ${phone} 的用户`);
    return null;
  }
  
  return userList[0].user_id; // 这里返回的就是 open_id
}

// 发送私聊消息
async function sendPrivateMessage(token, openId, contentStr) {
  const res = await axios.post('https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id', {
    receive_id: openId,
    msg_type: "interactive",
    content: contentStr
  }, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.data.code !== 0) {
    throw new Error(res.data.msg || res.data.error.message);
  }
  return res.data;
}

// ==========================================
// 5. 执行发送逻辑
// ==========================================
const delay = ms => new Promise(res => setTimeout(res, ms));

async function run() {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      throw new Error(`找不到数据文件：${DATA_PATH}`);
    }
    
    // 1. 获取教练手机号配置
    let coachPhones = {};
    if (fs.existsSync(COACH_PHONES_PATH)) {
      coachPhones = JSON.parse(fs.readFileSync(COACH_PHONES_PATH, 'utf-8'));
    } else {
      console.warn(`[Warn] 未找到教练手机号映射文件: ${COACH_PHONES_PATH}`);
    }

    // 2. 读取真实排课数据
    const rawData = fs.readFileSync(DATA_PATH, 'utf-8');
    const data = JSON.parse(rawData);

    const { tomorrowDate, coachMap } = groupLessonsByCoach(data);
    const coaches = Object.keys(coachMap);

    if (coaches.length === 0) {
      console.log(`[Info] 明天 (${tomorrowDate}) 没有任何教练排课，结束推送。`);
      return;
    }

    console.log(`[Info] 共有 ${coaches.length} 位教练明天有课，准备发送真实飞书私聊...`);

    // 3. 统一获取飞书 token
    const token = await getTenantAccessToken();
    console.log(`✅ 成功获取飞书 Access Token`);

    // 4. 逐个发送
    for (const coachName of coaches) {
      const lessons = coachMap[coachName];
      
      const phone = coachPhones[coachName];
      if (!phone) {
        console.log(`⚠️ 跳过 [${coachName}]：未在 config/coach-phones.json 中配置手机号`);
        continue;
      }
      
      // 根据手机号获取 open_id
      const openId = await getOpenIdByPhone(token, phone);
      if (!openId) {
        console.log(`⚠️ 跳过 [${coachName}]：在飞书企业架构中未查找到该手机号 (${phone})`);
        continue;
      }

      // 构建卡片字符串
      const cardStr = buildCoachCardString(coachName, lessons, tomorrowDate);
      
      try {
        await sendPrivateMessage(token, openId, cardStr);
        console.log(`✅ 已成功向 [${coachName} (${phone})] 私发提醒！`);
      } catch (err) {
        console.error(`❌ 向 [${coachName}] 私发失败：`, err.message);
      }

      // 飞书接口有频率限制，稍作延迟防止被封禁
      await delay(500); 
    }

    console.log('🎉 真实数据排课推送流程执行完毕！');

  } catch (error) {
    console.error('❌ 致命异常：', error.message);
  }
}

// 立即触发
run();
