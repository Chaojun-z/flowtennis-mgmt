const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

assert.match(source, /students:\[\]/, 'students page should open shell immediately and load data in background');
assert.match(source, /plans:\[\]/, 'plans page should open shell immediately and load data in background');
assert.match(source, /packages:\[\]/, 'packages page should open shell immediately and load data in background');
assert.match(source, /purchases:\[\]/, 'purchases page should open shell immediately and load data in background');
assert.match(source, /courts:\[\]/, 'courts page should open shell immediately and load data in background');
assert.match(source, /memberships:\[\]/, 'memberships page should open shell immediately and load data in background');
assert.match(source, /const PAGE_DATA_BACKGROUND_REQUIREMENTS=\{[\s\S]*students:\['campuses','students','courts','classes','schedule','feedbacks','products'\][\s\S]*plans:\['campuses','students','classes','plans','products','schedule','courts','entitlements'\][\s\S]*packages:\['packages','products'\][\s\S]*purchases:\['purchases','packages','students','entitlements'\][\s\S]*courts:\['campuses','students','courts','membershipAccounts','coaches','pricePlans'\][\s\S]*memberships:\['campuses','students','courts','membershipAccounts','coaches'\]/, 'heavy page datasets should move behind first render');
assert.match(source, /loadPageBackgroundDatasets\(pg,requestVersion,\{force\}\);/, 'page load should trigger deferred background datasets after first render');

console.log('page data requirements tests passed');
