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

assert.match(source, /function scheduleConfirmRuleMeta\(/, 'schedule page should expose a confirm-rule helper');
assert.match(source, /function buildRepeatScheduleSeeds\(/, 'schedule page should expose a repeat schedule helper');
assert.match(fnBody('openScheduleModal'), /sch_repeatEnabled/, 'schedule modal should allow enabling repeat scheduling');
assert.match(fnBody('openScheduleModal'), /每周重复/, 'schedule modal should describe weekly repeat scheduling');
assert.match(fnBody('openScheduleModal'), /确认规则/, 'schedule modal should show the confirm rule in plain language');
assert.match(fnBody('scheduleSaveConfirmText'), /确认截止/, 'schedule save confirm copy should show the confirm deadline');
assert.match(fnBody('saveSchedule'), /buildRepeatScheduleSeeds\(/, 'saving schedules should fan out repeat seeds when enabled');
assert.match(fnBody('openScheduleDetail'), /确认规则/, 'schedule detail should show the applied confirm rule');

console.log('schedule page view tests passed');
