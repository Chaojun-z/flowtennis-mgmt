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
assert.match(source, /const FEEDBACK_POSTER_TEMPLATES\s*=/, 'feedback poster should define fixed template configs');
assert.match(source, /blueGreenDiagonal[\s\S]*minimalDarkGreen[\s\S]*neonBrush[\s\S]*flatPopBlue[\s\S]*retroCourt[\s\S]*blueprintBlue[\s\S]*dynamicSmash[\s\S]*minimalRacket[\s\S]*proWhite[\s\S]*activeGreen/, 'feedback poster should expose ten Gemini template styles');
assert.match(fnBody('drawFeedbackPoster'), /网球兄弟/, 'feedback poster should use the local brand name');
assert.match(fnBody('openFeedbackPosterModal'), /blueGreenDiagonal/, 'feedback poster modal should default to the first Gemini template');
assert.match(source, /function drawFeedbackPoster\(/, 'feedback poster should draw fixed templates with canvas');
assert.match(source, /function openFeedbackPosterModal\(/, 'feedback poster should expose a modal entry');
assert.match(source, /function downloadFeedbackPoster\(/, 'feedback poster should expose a direct download action');
assert.match(fnBody('openFeedbackPosterModal'), /下载图片[\s\S]*分享图片/, 'feedback poster modal should separate local download from system share');
assert.match(fnBody('shareFeedbackPoster'), /AbortError/, 'cancelled share should not be treated as a generation failure');
assert.match(fnBody('openFeedbackModal'), /生成海报/, 'saved feedback modal should show a poster entry');
assert.match(fnBody('openFeedbackModal'), /trialFieldsHtml/, 'trial conversion fields should be conditional');
assert.doesNotMatch(fnBody('openFeedbackModal'), /复制给学员/, 'feedback modal should not keep copy action after poster entry exists');
assert.doesNotMatch(fnBody('saveFeedback'), /openFeedbackPosterModal\(/, 'saving feedback should not force coach into poster generation');

console.log('schedule page view tests passed');
