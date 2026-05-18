const assert = require('assert');
const { appSource, apiSource } = require('./helpers/read-index-bundle');
const fs = require('fs');
const path = require('path');
const pageDataSource = fs.readFileSync(path.join(__dirname, '../api/page-data/aggregate-handlers.js'), 'utf8');

function fnBody(name){
  const start = appSource.indexOf(`function ${name}(`);
  assert.notStrictEqual(start, -1, `${name} should exist`);
  const next = appSource.indexOf('\nfunction ', start + 1);
  return appSource.slice(start, next === -1 ? appSource.length : next);
}

assert.match(appSource, /const PAGE_DATA_REQUIREMENTS=\{/, 'state should define per-page data requirements');
assert.match(appSource, /function loadPageDataAndRender\(/, 'state should expose a page-scoped loading entry');
assert.doesNotMatch(fnBody('showApp'), /loadAll\(\)/, 'showApp should no longer trigger full load-all on first paint');
assert.match(fnBody('showApp'), /hydrateDatasetsFromCache\(\)/, 'showApp should restore last successful data before network refresh');
assert.match(fnBody('showApp'), /buildCampusTabs\(\);[\s\S]*renderAll\(\);/, 'showApp should render cached data immediately before waiting on network');
assert.match(fnBody('showApp'), /loadPageDataAndRender\(currentPage,\{quiet:true\}\)/, 'showApp should boot the current page without a blocking full-screen loader');
assert.match(appSource, /const CLIENT_DATA_CACHE_SCOPE=/, 'frontend cache should derive a runtime scope so preview and production do not share dataset keys');
assert.match(appSource, /if\(isNonProductionRuntime\(\)&&pg==='finance'\)return \['financePage'\];/, 'non-production finance should hold the page in loading state until the aggregated finance payload returns');
assert.doesNotMatch(fnBody('goPage'), /if\(!skipRender\)renderPageData\(pg\)/, 'goPage should not render immediately before page data is ready');
assert.match(fnBody('goPage'), /if\(!skipRender\)loadPageDataAndRender\(pg,\{quiet:true\}\)/, 'goPage should reuse the page-scoped loading entry without blocking the whole screen');
assert.doesNotMatch(fnBody('loadPageBackgroundDatasets'), /for\(const name of names\)/, 'background page datasets should not load one by one');
assert.match(fnBody('loadPageBackgroundDatasets'), /Promise\.allSettled\(names\.map/, 'background page datasets should load in parallel');
assert.doesNotMatch(apiSource, /if\(path==='\/page-data\/plans'&&method==='GET'\)/, 'retired plans page should not keep a dedicated aggregated endpoint');
assert.match(pageDataSource, /if\(path==='\/page-data\/purchases'\)/, 'api should expose an aggregated purchases page endpoint');
assert.match(pageDataSource, /if\(path==='\/page-data\/finance'\)/, 'api should expose an aggregated finance page endpoint');
assert.match(pageDataSource, /if\(path==='\/page-data\/courts'\)/, 'api should expose an aggregated courts page endpoint');
assert.match(pageDataSource, /if\(path==='\/page-data\/memberships'\)/, 'api should expose an aggregated memberships page endpoint');
assert.match(pageDataSource, /if\(path==='\/page-data\/workbench'\)/, 'api should expose an aggregated workbench page endpoint');

console.log('page load strategy tests passed');
