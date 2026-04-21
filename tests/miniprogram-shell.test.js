const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'));
}

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

const projectConfig = readJson('wechat-miniprogram/project.config.json');
assert.strictEqual(projectConfig.miniprogramRoot, 'miniprogram/', 'project.config.json should point to miniprogram/');
assert.strictEqual(projectConfig.appid, 'wx7acb7603ee803923', 'project.config.json should use the real mini program AppID');

const appConfig = readJson('wechat-miniprogram/miniprogram/app.json');
assert.deepStrictEqual(appConfig.pages, ['pages/index/index', 'pages/schedule/schedule', 'pages/detail/detail', 'pages/webview/webview'], 'mini program should keep entry, native schedule/detail pages, and the web-view fallback');
assert.strictEqual(appConfig.sitemapLocation, 'sitemap.json', 'mini program should include sitemap config');
assert.strictEqual(appConfig.lazyCodeLoading, 'requiredComponents', 'mini program should enable component lazy injection');

const indexWxml = readText('wechat-miniprogram/miniprogram/pages/index/index.wxml');
assert.match(indexWxml, /接收排课通知并进入教练端/, 'index page should ask the coach to subscribe before entering');
assert.doesNotMatch(indexWxml, /<web-view/, 'index page should stay native so subscribe permission can be requested by tap');

const indexJs = readText('wechat-miniprogram/miniprogram/pages/index/index.js');
assert.match(indexJs, /SCHEDULE_TEMPLATE_ID/, 'index page should read the schedule subscribe template ID from config');
assert.match(indexJs, /COURSE_REMINDER_TEMPLATE_ID/, 'index page should read the course reminder subscribe template ID from config');
assert.match(indexJs, /wx\.requestSubscribeMessage/, 'index page should request schedule subscribe permission from a tap');
assert.match(indexJs, /tmplIds:\s*\[SCHEDULE_TEMPLATE_ID,\s*COURSE_REMINDER_TEMPLATE_ID\]/, 'index page should request both schedule and course reminder templates');
assert.match(indexJs, /pages\/schedule\/schedule/, 'index page should navigate into the native schedule page after the tap');

const scheduleWxml = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxml');
assert.match(scheduleWxml, /本周|下周/, 'native schedule page should provide week navigation');
assert.match(scheduleWxml, /bindtap="openDetail"/, 'native schedule cards should open native detail');

const detailWxml = readText('wechat-miniprogram/miniprogram/pages/detail/detail.wxml');
assert.match(detailWxml, /课程详情/, 'native detail page should render course detail content');
assert.match(detailWxml, /返回课表/, 'native detail page should let coaches return to schedule');

const webviewWxml = readText('wechat-miniprogram/miniprogram/pages/webview/webview.wxml');
assert.match(webviewWxml, /<web-view\s+src="\{\{webViewUrl\}\}"/, 'web-view page should render the PWA through web-view');

const webviewJs = readText('wechat-miniprogram/miniprogram/pages/webview/webview.js');
assert.match(webviewJs, /WEB_VIEW_URL/, 'web-view page should read the PWA URL from config');
assert.doesNotMatch(webviewJs, /https:\/\/[^'"]+/, 'web-view page should not hardcode the business domain');
assert.match(webviewJs, /wx\.login/, 'web-view page should request a mini program login code');
assert.match(webviewJs, /wechatCode/, 'web-view page should pass the mini program login code into the web-view URL');
assert.match(webviewJs, /scheduleId/, 'web-view page should pass notification scheduleId into the PWA URL');

const apiJs = readText('public/assets/scripts/core/api.js');
assert.match(apiJs, /WECHAT_CODE_KEY/, 'web app should keep the mini program login code until account login succeeds');
assert.match(apiJs, /\/auth\/wechat-bind/, 'web app should call the wechat bind API after account login');
assert.match(apiJs, /PENDING_SCHEDULE_ID_KEY/, 'web app should keep notification scheduleId until data is loaded');

const stateJs = readText('public/assets/scripts/core/state.js');
assert.match(stateJs, /openPendingScheduleDeepLink/, 'page data load should try to open a pending notification schedule');

const configJs = readText('wechat-miniprogram/miniprogram/config.js');
assert.match(configJs, /WEB_VIEW_URL:\s*'https:\/\/www\.flowtennis\.cn'/, 'config should use the verified business domain');
assert.match(configJs, /API_BASE_URL:\s*'https:\/\/www\.flowtennis\.cn\/api'/, 'config should expose the API base URL for native pages');
assert.match(configJs, /SCHEDULE_TEMPLATE_ID:\s*'H_BIzR4Ca7aKldMWAlajgSwTWSos80lDZskEM4p8taI'/, 'config should include the selected schedule subscribe template ID');
assert.match(configJs, /COURSE_REMINDER_TEMPLATE_ID:\s*'ME_OpZIFDLRwN-ENibuFk4g4Dtdi8x43TAQR2nKkoUs'/, 'config should include the selected course reminder subscribe template ID');

const apiServerJs = readText('api/index.js');
assert.match(apiServerJs, /\/auth\/wechat-login/, 'API should support mini program login by bound openid');
assert.match(apiServerJs, /findWechatUserByOpenId/, 'API should find the bound coach account by openid');
assert.match(apiServerJs, /pages\/detail\/detail/, 'subscribe messages should deep link to native course detail');

console.log('miniprogram shell tests passed');
