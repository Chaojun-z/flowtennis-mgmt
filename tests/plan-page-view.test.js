const assert = require('assert');
const { appSource: source } = require('./helpers/read-index-bundle');

assert.match(source, /仍然以课包余额和可用规则为准/, 'class page should keep the truth-boundary note after plans retirement');
assert.match(source, /products \/ classes \/ plans 仅保留历史兼容，不应再作为新增功能默认依赖。/, 'bundle should still document the active default business chain');
assert.match(source, /id="page-classes"[\s\S]*tms-audit-note">班次用于组织固定上课关系和学习进度；是否还能继续约课，仍然以课包余额和可用规则为准。<\/div>/, 'class page should explain the difference between class progress and package balance');
assert.doesNotMatch(source, /id="page-plans"/, 'html should no longer keep the retired plans shell');
assert.doesNotMatch(source, /planCampusFilterHost|planCoachFilterHost|planTypeFilterHost|planStageFilterHost/, 'plan filter controls should be removed with the retired shell');
assert.doesNotMatch(source, /function openPlanDetail\(|function openPlanStudent\(|function openPlanClass\(|function openPlanSchedule\(|function renderPlans\(/, 'plan page handlers should be retired with the shell');

console.log('plan page view tests passed');
