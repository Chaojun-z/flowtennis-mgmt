const assert = require('assert');
const fs = require('fs');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '../public/index.html'), 'utf8');

assert.match(html, /<th>下次跟进日期<\/th>/, 'court table should show next follow-up date');
assert.match(html, /<th style="text-align:right">操作<\/th>[\s\S]*查看账户[\s\S]*编辑资料[\s\S]*记一笔流水/, 'court row actions should be view account, edit profile, and add finance record');
assert.match(html, /function openCourtFinanceModal\(/, 'court page should expose a dedicated finance modal');
assert.match(html, /记一笔流水/, 'court page should expose the standalone finance entry label');
assert.match(html, /function openCourtModal[\s\S]*最近跟进日期[\s\S]*下次跟进日期/, 'court edit modal should keep follow-up fields');
assert.doesNotMatch(html, /function openCourtModal[\s\S]*充值\/消费记录[\s\S]*add-rec-row/, 'court edit modal should no longer contain the inline finance entry area');
assert.match(html, /function getCourtDuplicateCandidates\(/, 'court save flow should detect duplicates');
assert.match(html, /发现可能重复的订场用户：/, 'court save flow should warn about possible duplicates');
assert.match(html, /手机号优先，若无手机号则按姓名\+校区/, 'court duplicate reminder should prioritize phone and then name plus campus');
assert.match(html, /search.*nextFollowUp|nextFollowUp.*search|courtSearch[\s\S]*followUp/, 'court search should cover follow-up fields');

console.log('court page view tests passed');
