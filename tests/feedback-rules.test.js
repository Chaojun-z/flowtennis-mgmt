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
    forehand: '稳定击球',
    backhand: '继续加强',
    footwork: '启动积极',
    rally: '能完成多拍',
    readyPosition: '注意架拍',
    serve: '本节未练',
    focus: '正手连续性',
    performance: '专注',
    problems: '击球点偏晚',
    nextAdvice: '下次加强步伐'
  },
  { id: 'fb-1' },
  { name: '朝珺' }
);

assert.strictEqual(record.id, 'fb-1');
assert.strictEqual(record.scheduleId, 'sch-1');
assert.strictEqual(record.coach, '朝珺');
assert.strictEqual(record.template.forehand, '稳定击球');
assert.strictEqual(record.nextAdvice, '下次加强步伐');

console.log('feedback rules tests passed');
