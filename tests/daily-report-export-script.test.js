const assert = require('assert');
const fs = require('fs');
const path = require('path');

const scriptPath = path.join(__dirname, '..', 'scripts', 'export-schedule-report-json.js');
const scriptSource = fs.readFileSync(scriptPath, 'utf8');

assert.match(
  scriptSource,
  /daily-report-data\.json/,
  '导出脚本默认输出文件应固定为 standalone-services/daily-report-data.json'
);

assert.match(
  scriptSource,
  /chmodSync\(outPath,\s*0o444\)/,
  '导出脚本写完后应将 JSON 文件设置为只读'
);

const { buildNotificationCenterSnapshot } = require('../scripts/lib/notification-center-export');

const snapshot = buildNotificationCenterSnapshot({
  targetDate: '2026-05-14',
  now: '2026-05-14T18:00:00+08:00',
  generatedAt: '2026-05-14T18:05:00+08:00',
  scheduleRows: [
    {
      id: 's1',
      startTime: '2026-05-14T09:00:00+08:00',
      endTime: '2026-05-14T10:00:00+08:00',
      coachId: 'coach-1',
      coach: '张教练',
      coachPhone: '13800000000',
      campus: 'campus-a',
      venue: '1号场',
      className: '晨训班',
      courseType: '团课',
      status: '已下课',
      studentName: '王小明',
      studentPhone: '13900000000',
      openid: 'openid-1',
      balance: 500,
      price: 300
    }
  ],
  campuses: [
    { id: 'campus-a', code: 'campus-a', name: '高新校区' }
  ]
});

assert.deepStrictEqual(
  Object.keys(snapshot.todayLessonDetails[0]),
  [
    'id',
    'startTime',
    'endTime',
    'coachId',
    'coachName',
    'campusCode',
    'campusName',
    'venue',
    'className',
    'courseType',
    'status',
    'studentCount',
    'studentLabels'
  ],
  '日报明细应只保留约定的最小安全字段'
);

console.log('daily report export script tests passed');
