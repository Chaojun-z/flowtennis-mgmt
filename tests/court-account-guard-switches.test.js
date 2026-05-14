const assert = require('assert');
const fs = require('fs');
const path = require('path');

const stateSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');
const courtsSource = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/courts.js'), 'utf8');
const pageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/aggregate-handlers.js'), 'utf8');
const indexSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');

assert.match(indexSource, /court-account-read-model/, 'api/index.js 应接入订场用户读模型模块');
assert.match(pageDataSource, /\/page-data\/court-account-list-view/, 'page-data 聚合处理器应新增订场用户隐藏读模型入口');
assert.match(pageDataSource, /\/page-data\/court-account-list-view-compare/, 'page-data 聚合处理器应新增新旧结果 compare 入口');

assert.match(stateSource, /const COURT_READ_MODEL_STORAGE_KEY='ft_court_read_model_mode';/, '前端应保留隐藏验证模式存储键');
assert.match(stateSource, /const COURT_READ_MODEL_FORCE_LEGACY_KEY='ft_court_read_model_force_legacy';/, '前端应保留全局强退开关存储键');
assert.match(stateSource, /function shouldUseCourtReadModelByDefault\(/, '前端应暴露订场用户页正式默认切换判断');
assert.match(stateSource, /function isCourtReadModelPreviewEnabled\(/, '前端应暴露隐藏验证开关判断');
assert.match(stateSource, /function isCourtReadModelRollbackForced\(/, '前端应暴露全局强退开关判断');
assert.match(stateSource, /\/page-data\/court-account-list-view/, '前端应可加载订场用户隐藏读模型');
assert.match(stateSource, /\/page-data\/court-account-list-view-compare/, '前端应可加载 compare 输出');

assert.match(courtsSource, /function renderCourtAccountListView\(/, '订场用户页应增加隐藏读模型渲染入口');
assert.match(courtsSource, /if\(shouldUseCourtReadModelByDefault\(\)&&courtAccountListViewData\)/, '订场用户页默认应使用新读模型，强退时再回旧链');
assert.match(courtsSource, /window\.__courtAccountListViewCompare=/, '前端应暴露最新 compare 输出供内部验证');
assert.match(courtsSource, /const filters=courtAccountListViewData\?\.filters\|\|\{\};/, '隐藏读模型路径应直接消费后端 filters');
assert.match(courtsSource, /const summary=courtAccountListViewData\?\.summary\|\|\{\};/, '隐藏读模型路径应直接消费后端 summary');
assert.match(courtsSource, /const scopedSummary=campus==='all'\?summary:summarizeCourtAccountListItems\(base\);/, '隐藏读模型统计卡应优先读取后端 summary，并仅在本地校区过滤时做局部汇总');

console.log('court account guard switch tests passed');
