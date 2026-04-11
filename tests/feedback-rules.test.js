const assert = require('assert');
const api = require('../api/index.js');

const rules = api._test;

assert.ok(rules, 'api._test should expose helpers');

assert.throws(
  () => rules.buildFeedbackRecord({}, {}, { name: '教练' }),
  /缺少排课ID/,
  'feedback must be linked to a schedule'
);

const record = rules.buildFeedbackRecord(
  {
    scheduleId: 'sch-1',
    studentId: 'stu-1',
    studentName: '学员A',
    coach: '朝珺',
    startTime: '2026-04-11 09:00',
    campus: 'mabao',
    venue: '1号场',
    lessonCount: 1,
    practicedToday: '底线练习',
    knowledgePoint: '重心转移',
    nextTraining: '脚步移动'
  },
  { id: 'fb-1' },
  { name: '朝珺' }
);

assert.strictEqual(record.id, 'fb-1');
assert.strictEqual(record.scheduleId, 'sch-1');
assert.strictEqual(record.coach, '朝珺');
assert.strictEqual(record.practicedToday, '底线练习');
assert.strictEqual(record.knowledgePoint, '重心转移');
assert.strictEqual(record.nextTraining, '脚步移动');

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'admin', name: '管理员' },
    { coach: '朝珺' }
  ),
  'admin can write any schedule feedback'
);

assert.doesNotThrow(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '朝珺', name: '朝珺' },
    { coach: '朝珺' }
  ),
  'coach can write own schedule feedback'
);

assert.throws(
  () => rules.assertCanWriteFeedback(
    { role: 'editor', coachName: '白杨静', name: '白杨静' },
    { coach: '朝珺' }
  ),
  /只能填写自己的课程反馈/,
  'coach cannot write other coach schedule feedback'
);

console.log('feedback rules tests passed');
