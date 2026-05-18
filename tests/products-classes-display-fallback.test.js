const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

function fnBody(name){
  const start = source.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const nextFunction = source.indexOf('\nfunction ', start + 1);
  const nextAsync = source.indexOf('\nasync function ', start + 1);
  const candidates = [nextFunction, nextAsync].filter(i => i !== -1);
  const next = candidates.length ? Math.min(...candidates) : -1;
  return source.slice(start, next === -1 ? source.length : next);
}

assert.match(
  fnBody('scheduleClassName'),
  /return s\?\.className\|\|'—';/,
  'schedule class name display should rely on the schedule snapshot first'
);

assert.doesNotMatch(
  fnBody('scheduleClassName'),
  /classes\.find\(c=>c\.id===s\?\.classId\)/,
  'schedule class name display should not require classes dataset lookups'
);

assert.match(
  fnBody('classDisplayName'),
  /const productName=classProductName\(cls\);/,
  'class display name should prefer the class snapshot product name helper'
);

assert.doesNotMatch(
  fnBody('classDisplayName'),
  /products\.find\(p=>p\.id===cls\.productId\)/,
  'class display name should not require products dataset lookups'
);

assert.doesNotMatch(
  fnBody('studentFeedbackHistoryHtml'),
  /classes\.find\(c=>c\.id===sch\.classId\)/,
  'student feedback history should use schedule snapshots instead of class dataset lookups'
);

console.log('products/classes display fallback tests passed');
