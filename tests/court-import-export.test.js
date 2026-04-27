const assert = require('assert');
const { appSource: html } = require('./helpers/read-index-bundle');

assert.match(html, /function csvEscapeCell\(/, 'court csv helpers should escape fields consistently');
assert.match(html, /function decodeCourtCsvText\(/, 'court import should decode csv text through a dedicated helper');
assert.match(html, /new TextDecoder\('utf-8',\s*\{fatal:true\}\)/, 'court import should try fatal utf-8 decoding first');
assert.match(html, /for\(const enc of \['gb18030','gbk'\]\)/, 'court import should fall back to gb18030 and gbk');
assert.match(html, /末次跟进日期[\s\S]*下次跟进日期/, 'court import\/export should include follow-up fields');
assert.match(html, /exportCourtCSV\([\s\S]*csvEscapeCell/, 'court export should use shared CSV escaping');
assert.match(html, /normalizeCourtImportRows\([\s\S]*末次跟进日期[\s\S]*下次跟进日期/, 'court import normalization should read follow-up fields');
assert.match(html, /import-note[\s\S]*末次跟进日期[\s\S]*下次跟进日期/, 'court import hint should mention the new columns');
assert.doesNotMatch(html, /<th>余额<\/th><th>储值<\/th><th>消费金额<\/th>/, 'court import preview should no longer surface finance columns as if they were normal import targets');
assert.doesNotMatch(html, /balance:row\.balance,totalDeposit:row\.totalDeposit,spentAmount:row\.spentAmount/, 'court import payload should stop sending finance fields into the normal court import endpoint');

console.log('court import export tests passed');
