const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', 'wechat-miniprogram', 'miniprogram');
const appJson = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const apiJs = fs.readFileSync(path.join(root, 'utils', 'api.js'), 'utf8');
const indexJs = fs.readFileSync(path.join(root, 'pages', 'index', 'index.js'), 'utf8');
const indexWxml = fs.readFileSync(path.join(root, 'pages', 'index', 'index.wxml'), 'utf8');
const profileJs = fs.readFileSync(path.join(root, 'pages', 'profile', 'index.js'), 'utf8');
const profileWxml = fs.readFileSync(path.join(root, 'pages', 'profile', 'index.wxml'), 'utf8');
const createJs = fs.readFileSync(path.join(root, 'pages', 'match-create', 'index.js'), 'utf8');
const createWxml = fs.readFileSync(path.join(root, 'pages', 'match-create', 'index.wxml'), 'utf8');

assert.ok(appJson.pages.includes('pages/profile/index'), 'mini program should register match profile page');
assert.ok(appJson.pages.includes('pages/match-create/index'), 'mini program should register match create page');
assert.match(apiJs, /\/auth\/wechat-mini-login/, 'mini program api should call match mini login');
assert.match(apiJs, /\/match-profile\/phone-code/, 'mini program api should call phone bind endpoint');
assert.match(apiJs, /canCreateMatch/, 'mini program api should keep the refreshed match permission state');
assert.match(indexWxml, /微信进入约球/, 'index page should expose the match mini-program entry');
assert.match(indexJs, /loginMatchWithWechat/, 'index page should support match wechat login');
assert.match(profileWxml, /授权手机号/, 'profile page should expose phone authorization entry');
assert.match(profileJs, /bindMatchPhoneByCode/, 'profile page should bind phone through phone-code endpoint');
assert.match(profileJs, /loadMatchProfile/, 'profile page should refresh profile after phone bind');
assert.match(profileWxml, /canCreateMatch/, 'profile page should show match create permission state');
assert.match(profileWxml, /发布约球/, 'profile page should expose the match create entry');
assert.match(createJs, /loadMatchProfile/, 'match create page should re-check profile permission before submit');
assert.match(createJs, /createMatch/, 'match create page should call create match api');
assert.match(createWxml, /提交发布|发布约球/, 'match create page should expose the submit CTA');

console.log('miniprogram match ops closure tests passed');
