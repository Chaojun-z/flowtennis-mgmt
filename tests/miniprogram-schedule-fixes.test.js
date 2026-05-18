const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { workbenchTodoState } = require('../wechat-miniprogram/miniprogram/utils/schedule');

const root = path.join(__dirname, '..');
const scheduleJs = fs.readFileSync(path.join(root, 'wechat-miniprogram/miniprogram/pages/schedule/schedule.js'), 'utf8');
const scheduleWxss = fs.readFileSync(path.join(root, 'wechat-miniprogram/miniprogram/pages/schedule/schedule.wxss'), 'utf8');

function fnBody(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const candidates = [nextFunction].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

const now = new Date('2026-04-27T23:40:00+08:00');
const staleUpcoming = workbenchTodoState({
  startTime: '2026-04-27 16:00',
  endTime: '2026-04-27 17:00',
  status: '已排课',
  workbenchState: { code: 'upcoming', label: '即将开始' }
}, now);

assert.deepStrictEqual(
  staleUpcoming,
  { code: 'pending', label: '待反馈', className: 'tag-danger' },
  'ended lessons should not keep a stale 即将开始 state in the mini timetable'
);

assert.match(
  scheduleJs,
  /canvas\.height\s*=\s*layout\.canvasHeight;/,
  'poster canvas height should grow from computed content layout instead of a fixed height'
);

assert.match(
  scheduleJs,
  /tt-course-ended/,
  'mini timetable items should mark finished lessons with an ended class'
);

assert.match(
  scheduleJs,
  /function findLinkedClassRecord\(/,
  'mini schedule page should centralize linked class lookup'
);

assert.match(
  fnBody(scheduleJs, 'buildShiftDetailData'),
  /findLinkedClassRecord\(/,
  'shift detail data should reuse the linked class helper'
);

assert.match(
  fnBody(scheduleJs, 'buildDetailData'),
  /findLinkedClassRecord\(/,
  'schedule detail data should reuse the linked class helper'
);

assert.doesNotMatch(
  fnBody(scheduleJs, 'buildShiftDetailData'),
  /classes\.find\(/,
  'shift detail data should not scatter direct class lookups'
);

assert.doesNotMatch(
  fnBody(scheduleJs, 'buildDetailData'),
  /classes\.find\(/,
  'schedule detail data should not scatter direct class lookups'
);

assert.match(
  scheduleWxss,
  /\.tt-course-ended\b/,
  'mini timetable stylesheet should define the gray ended card style'
);

console.log('miniprogram schedule fixes tests passed');
