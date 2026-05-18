const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const scheduleJs = fs.readFileSync(path.join(root, 'wechat-miniprogram/miniprogram/pages/schedule/schedule.js'), 'utf8');
const scheduleUtils = require('../wechat-miniprogram/miniprogram/utils/schedule');

function fnBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notStrictEqual(start, -1, `${signature} should exist`);
  const braceStart = source.indexOf('{', start);
  assert.notStrictEqual(braceStart, -1, `${signature} should have a body`);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail(`${signature} should have a closed body`);
}

const saveFeedbackBody = fnBody(scheduleJs, 'async saveFeedback()');

assert.match(
  scheduleJs,
  /function upsertFeedbackRecord\(/,
  'feedback save should expose a local feedback upsert helper'
);

assert.match(
  scheduleJs,
  /function markScheduleFeedbackState\(/,
  'feedback save should expose a local schedule status patch helper'
);

assert.match(
  saveFeedbackBody,
  /const savedFeedback = await saveCoachFeedback\(/,
  'feedback save should use the returned feedback record'
);

assert.match(
  saveFeedbackBody,
  /feedbackHasSaved:\s*true/,
  'feedback save should switch the sheet into saved state immediately'
);

assert.match(
  saveFeedbackBody,
  /showFeedback:\s*true/,
  'feedback save should keep the feedback sheet open for poster and follow-up actions'
);

assert.match(
  saveFeedbackBody,
  /this\.renderWeek\(\)/,
  'feedback save should refresh the local card state immediately'
);

assert.doesNotMatch(
  saveFeedbackBody,
  /this\.closeSheets\(\)/,
  'feedback save should not close the sheet immediately after success'
);

assert.strictEqual(
  scheduleUtils.workbenchTodoState({
    id: 'sch-1',
    startTime: '2026-05-10 09:00',
    endTime: '2026-05-10 10:00',
    status: '已排课',
    feedbackStatus: '已反馈'
  }, new Date('2026-05-12T12:00:00+08:00')),
  null,
  'ended schedules with saved feedback status should no longer appear as pending'
);

assert.strictEqual(
  scheduleUtils.workbenchTodoState({
    id: 'sch-2',
    startTime: '2026-05-10 09:00',
    endTime: '2026-05-10 10:00',
    status: '已排课'
  }, new Date('2026-05-12T12:00:00+08:00')).label,
  '待反馈',
  'ended schedules without feedback should still remain pending'
);

console.log('thread76 feedback save closure tests passed');
