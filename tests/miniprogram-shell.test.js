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
assert.match(scheduleWxml, /student-card"[^>]*data-id="\{\{item\.lastScheduleId\}\}"[^>]*bindtap="openDetail"/, 'native student cards should open the latest class detail sheet');
assert.match(scheduleWxml, /今日排课/, 'native workbench should keep the today schedule section');
assert.match(scheduleWxml, /本周待办/, 'native workbench should also show a weekly todo section');
assert.match(scheduleWxml, /今日课程[\s\S]*本周课时[\s\S]*本月课时[\s\S]*本月反馈[\s\S]*未反馈[\s\S]*体验转化/, 'native workbench should keep the six original web metrics in the requested order');
assert.match(scheduleWxml, /dashboard-hero/, 'native workbench should render the recreated SVG hero header');
assert.match(scheduleWxml, /dashboard-grid/, 'native workbench should render the two-row three-column metric grid');
assert.match(scheduleWxml, /today-lesson-card/, 'native workbench should render the larger today lesson card style');
assert.match(scheduleWxml, /week-task-card/, 'native workbench should render the weekly task card style');
assert.match(scheduleWxml, /coachGreeting/, 'native workbench should bind the greeting line dynamically');
assert.match(scheduleWxml, /coachDisplayName/, 'native workbench should bind the coach name dynamically');
assert.match(scheduleWxml, /coach-title-row/, 'native workbench should render the coach title and dropdown arrow in one aligned row');
assert.doesNotMatch(scheduleWxml, /dashboard-topbar/, 'native workbench should not render the extra custom top bar');
assert.doesNotMatch(scheduleWxml, /hero-device-pill/, 'native workbench should not render the extra simulated top-right device pill');
assert.doesNotMatch(scheduleWxml, /已连接/, 'native workbench should not render the temporary real-device connection tag');
assert.doesNotMatch(scheduleWxml, /coach-task-panel/, 'native workbench should not show a separate large task card above the summary');
assert.match(scheduleWxml, /wx:if="\{\{reminderItems\.length\}\}"/, 'native workbench summary should only render when there are reminders');
assert.match(scheduleWxml, /metric-primary/, 'native workbench should use a consumer-style highlighted metric card');
assert.match(scheduleWxml, /schedule-location/, 'native workbench lesson cards should make location easy to scan');
assert.match(scheduleWxml, /scroll-top="\{\{timetableScrollTop\}\}"/, 'native timetable should support vertical auto positioning');
assert.match(scheduleWxml, /scroll-left="\{\{timetableScrollLeft\}\}"/, 'native timetable should support horizontal auto positioning to today');
assert.match(scheduleWxml, /currentTimeText/, 'native timetable should render a dynamic current-time marker instead of a hardcoded label');

const scheduleJs = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.js');
assert.match(scheduleJs, /weekTodoGroups/, 'native workbench should prepare grouped weekly todo data');
assert.match(scheduleJs, /dashboardClasses,\s*weekTodoGroups/, 'native week render should expose both today cards and weekly todo groups');
assert.match(scheduleJs, /reminderItems/, 'native workbench should prepare compact reminder chips');
assert.match(scheduleJs, /coachGreeting/, 'mini program schedule page should prepare the greeting copy for the recreated dashboard header');
assert.match(scheduleJs, /coachDisplayName/, 'mini program schedule page should prepare the coach name for the recreated dashboard header');
assert.doesNotMatch(scheduleJs, /const studentsList = \[/, 'mini program students should not stay on hardcoded local list data');
assert.doesNotMatch(scheduleJs, /const shiftsList = \[/, 'mini program classes should not stay on hardcoded local list data');
assert.match(scheduleJs, /onShow\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should refresh when returning to the page');
assert.match(scheduleJs, /onPullDownRefresh\(\)\s*\{[\s\S]*this\.load\(/, 'mini program schedule page should support pull-down refresh');
assert.match(scheduleJs, /saveCoachFeedback/, 'mini program schedule page should expose a real feedback save action');
assert.match(scheduleJs, /timetableScrollTop/, 'mini program schedule page should compute a vertical scroll position for the timetable');
assert.match(scheduleJs, /timetableScrollLeft/, 'mini program schedule page should compute a horizontal scroll position for the timetable');
assert.match(scheduleJs, /currentTimeText/, 'mini program schedule page should compute the current-time marker text');
assert.match(scheduleJs, /lastScheduleId:\s*lastClass && lastClass\.id/, 'mini program students should carry their latest class id for the detail sheet');

const scheduleUtils = require('../wechat-miniprogram/miniprogram/utils/schedule');
const todoNow = new Date('2026-04-21T12:00:00+08:00');
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已排课' }, todoNow).label,
  '待上课',
  'future active courses should be weekly todos'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已排课' }, todoNow).label,
  '待反馈',
  'ended courses without feedback should become feedback todos'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 09:00', endTime: '2026-04-21 10:00', status: '已排课', hasFeedback: true }, todoNow),
  null,
  'ended courses with feedback should not remain weekly todos'
);
assert.strictEqual(
  scheduleUtils.workbenchTodoState({ startTime: '2026-04-21 15:00', endTime: '2026-04-21 16:00', status: '已取消' }, todoNow),
  null,
  'cancelled courses should not appear as weekly todos'
);

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

const miniApiJs = readText('wechat-miniprogram/miniprogram/utils/api.js');
assert.match(miniApiJs, /function saveCoachFeedback/, 'mini program API helper should provide feedback save');
assert.match(miniApiJs, /request\('\/feedbacks'/, 'mini program feedback save should call the feedback API');

const scheduleWxss = readText('wechat-miniprogram/miniprogram/pages/schedule/schedule.wxss');
assert.match(scheduleWxss, /\.dashboard-top\s*\{[\s\S]*background:\s*linear-gradient\(135deg,\s*#2b3a55 0%,\s*#1e2a38 100%\)/i, 'mini program workbench should use the SVG dark header gradient');
assert.match(scheduleWxss, /\.dashboard-grid\s*\{[\s\S]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/, 'mini program workbench should use a fixed three-column grid like the SVG');
assert.match(scheduleWxss, /\.today-lesson-card\s*\{[\s\S]*border-radius:\s*34rpx;/, 'mini program today lesson card should use the larger rounded card style');
assert.match(scheduleWxss, /\.tabbar\s*\{[\s\S]*background:\s*#fff;/, 'mini program tabbar should stay white like the SVG bottom bar');
assert.match(scheduleWxss, /\.tabbar\s*\{[\s\S]*height:\s*166rpx;/, 'mini program tabbar should lock to the 83px SVG height');
assert.match(scheduleWxss, /\.tab-icon\s*\{[\s\S]*width:\s*44rpx;[\s\S]*height:\s*44rpx;/, 'mini program tab icons should stay inside a compact visual box');
assert.match(scheduleWxss, /\.tab-grid-icon\s*\{[\s\S]*width:\s*36rpx;[\s\S]*height:\s*36rpx;/, 'workbench icon should use its own smaller visual size');
assert.match(scheduleWxss, /\.tab-list-icon\s*\{[\s\S]*width:\s*42rpx;[\s\S]*height:\s*34rpx;/, 'class list icon should use a narrower visual size');
assert.match(scheduleWxss, /\.tab-item\.active \.tab-grid-icon view\s*\{[\s\S]*background:\s*#2b3a55;/, 'active workbench icon should render as solid blocks');
assert.match(scheduleWxss, /\.tab-item:not\(\.active\) \.tab-grid-icon view\s*\{[\s\S]*border:\s*3rpx solid #94a3b8;/, 'inactive workbench icon should render as outline blocks');
assert.match(scheduleWxss, /\.coach-title-row\s*\{[\s\S]*align-items:\s*center;/, 'mini program coach name row should vertically center the dropdown arrow');
assert.doesNotMatch(scheduleWxss, /\.dashboard-topbar\s*\{/, 'mini program workbench should not keep the removed custom top bar styles');
assert.doesNotMatch(scheduleWxss, /\.coach-status-pill\s*\{/, 'mini program workbench should not keep the removed connection pill styles');
assert.match(scheduleWxss, /\.sheet\s*\{[\s\S]*display:\s*flex;[\s\S]*flex-direction:\s*column;/, 'mini program bottom sheets should use a flex column layout so the body can scroll');
assert.doesNotMatch(scheduleWxss, /\.sheet-actions\s*\{[\s\S]*position:\s*absolute;/, 'mini program bottom sheet footer should not pin absolutely over scrollable content');

console.log('miniprogram shell tests passed');
