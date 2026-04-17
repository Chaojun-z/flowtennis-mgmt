const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { appSource: source } = require('./helpers/read-index-bundle');
const styles = fs.readFileSync(path.join(__dirname, '..', 'public', 'assets', 'styles', 'pages.css'), 'utf8');

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
assert.match(source, /blueGreenDiagonal[\s\S]*minimalDarkGreen[\s\S]*retroCourt[\s\S]*blueprintBlue[\s\S]*minimalRacket[\s\S]*activeGreen/, 'feedback poster should expose the selected Gemini template styles');
assert.doesNotMatch(source, /粉蓝笔刷|专业白\(拍网\)|深蓝撞色|波普斜切/, 'feedback poster should remove the rejected poster styles');
assert.match(fnBody('drawFeedbackPoster'), /网球兄弟/, 'feedback poster should use the local brand name');
assert.match(fnBody('openFeedbackPosterModal'), /blueGreenDiagonal/, 'feedback poster modal should default to the first Gemini template');
assert.match(source, /function drawFeedbackPoster\(/, 'feedback poster should draw fixed templates with canvas');
assert.match(source, /function openFeedbackPosterModal\(/, 'feedback poster should expose a modal entry');
assert.match(source, /function downloadFeedbackPoster\(/, 'feedback poster should expose a direct download action');
assert.match(fnBody('openFeedbackPosterModal'), /下载图片[\s\S]*分享图片/, 'feedback poster modal should separate local download from system share');
assert.match(fnBody('shareFeedbackPoster'), /AbortError/, 'cancelled share should not be treated as a generation failure');
assert.match(styles, /::-webkit-scrollbar\{height:3px\}[\s\S]*max-height:58vh/, 'poster preview should fit the modal and use a thin horizontal scrollbar');
assert.match(fnBody('openFeedbackModal'), /生成海报/, 'saved feedback modal should show a poster entry');
assert.match(fnBody('openFeedbackModal'), /trialFieldsHtml/, 'trial conversion fields should be conditional');
assert.match(fnBody('openFeedbackModal'), /练习情况（非必填）/, 'feedback modal should rename knowledge point to practice status');
assert.match(fnBody('openFeedbackModal'), /体验课内部记录/, 'trial-only fields should be framed as internal notes');
assert.match(fnBody('openFeedbackModal'), /1\.0～1\.5[\s\S]*1\.5～2\.0[\s\S]*2\.0～2\.5[\s\S]*2\.5～3\.0[\s\S]*3\.0～3\.5[\s\S]*3\.5～4\.0/, 'trial level options should use the fixed numeric ladder');
assert.doesNotMatch(fnBody('openFeedbackModal'), /知识点（非必填）|体验课转化判断|零基础|初学|有基础|长期打球/, 'feedback modal should remove the old trial copy and level options');
assert.doesNotMatch(fnBody('openFeedbackModal'), /复制给学员/, 'feedback modal should not keep copy action after poster entry exists');
assert.doesNotMatch(fnBody('saveFeedback'), /openFeedbackPosterModal\(/, 'saving feedback should not force coach into poster generation');

console.log('schedule page view tests passed');
