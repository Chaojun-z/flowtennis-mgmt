const assert = require('assert');

const {
  buildNotificationCenterSnapshot,
  maskStudentLabel
} = require('../scripts/lib/notification-center-export');

assert.strictEqual(maskStudentLabel('王小明'), '王*明', '中文名应脱敏');
assert.strictEqual(maskStudentLabel('Li'), 'L*', '短英文名应脱敏');
assert.strictEqual(maskStudentLabel(''), '', '空姓名应返回空字符串');

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
      campus: 'campus-a',
      venue: '1号场',
      className: '晨训班',
      courseType: '团课',
      studentName: '王小明、李雷',
      status: '已下课'
    },
    {
      id: 's2',
      startTime: '2026-05-14T14:00:00+08:00',
      endTime: '2026-05-14T15:00:00+08:00',
      coachId: 'coach-2',
      coach: '李教练',
      campus: 'campus-a',
      venue: '2号场',
      className: '私教A',
      courseType: '私教',
      studentName: '韩梅梅',
      status: '已取消'
    },
    {
      id: 's3',
      startTime: '2026-05-14T16:00:00+08:00',
      endTime: '2026-05-14T17:00:00+08:00',
      coachId: 'coach-1',
      coach: '张教练',
      campus: 'campus-a',
      venue: '3号场',
      className: '晚训班',
      courseType: '私教',
      studentIds: ['stu-1'],
      studentName: '赵敏',
      status: '已排课'
    },
    {
      id: 's4',
      startTime: '2026-05-15T10:00:00+08:00',
      endTime: '2026-05-15T11:00:00+08:00',
      coachId: 'coach-1',
      coach: '张教练',
      campus: 'campus-a',
      venue: '1号场',
      className: '明日课1',
      courseType: '团课',
      studentName: '周芷若',
      status: '已排课'
    },
    {
      id: 's5',
      startTime: '2026-05-15T13:00:00+08:00',
      endTime: '2026-05-15T14:00:00+08:00',
      coachId: 'coach-2',
      coach: '李教练',
      campus: 'campus-b',
      venue: '室内场',
      className: '明日课2',
      courseType: '私教',
      studentIds: ['stu-2', 'stu-3'],
      status: '已排课'
    }
  ],
  campuses: [
    { id: 'campus-a', code: 'campus-a', name: '高新校区' },
    { id: 'campus-b', code: 'campus-b', name: '曲江校区' }
  ],
  coaches: [
    { id: 'coach-1', name: '张教练', status: 'active' },
    { id: 'coach-2', name: '李教练', status: 'active' }
  ]
});

assert.strictEqual(snapshot.schemaVersion, 'notification-center-v1');
assert.strictEqual(snapshot.today, '2026-05-14');
assert.strictEqual(snapshot.tomorrow, '2026-05-15');
assert.strictEqual(snapshot.generatedAt, '2026-05-14T18:05:00+08:00');

assert.deepStrictEqual(snapshot.todayStats, {
  totalLessons: 3,
  completedLessons: 1,
  cancelledLessons: 1,
  pendingLessons: 1,
  activeCoachCount: 1
});

assert.deepStrictEqual(snapshot.tomorrowStats, {
  totalLessons: 2,
  cancelledLessons: 0,
  scheduledCoachCount: 2
});

assert.strictEqual(snapshot.coachSummaries.length, 2, '应按老师聚合');
const zhang = snapshot.coachSummaries.find((item) => item.coachName === '张教练');
assert.deepStrictEqual(zhang, {
  coachId: 'coach-1',
  coachName: '张教练',
  todayCompletedLessons: 1,
  todayCancelledLessons: 0,
  todayPendingLessons: 1,
  tomorrowScheduledLessons: 1
});

assert.strictEqual(snapshot.todayLessonDetails[0].campusName, '高新校区');
assert.deepStrictEqual(snapshot.todayLessonDetails[0].studentLabels, ['王*明', '李*']);
assert.strictEqual(snapshot.todayLessonDetails[2].studentCount, 1);
assert.deepStrictEqual(snapshot.tomorrowLessonDetails[1].studentLabels, []);
assert.strictEqual(snapshot.tomorrowLessonDetails[1].studentCount, 2);
assert.ok(!('phone' in snapshot.todayLessonDetails[0]), '明细不应包含敏感字段');

console.log('notification center export tests passed');
