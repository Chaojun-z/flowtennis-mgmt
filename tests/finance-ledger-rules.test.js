const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function financeCampusNameFromTextClues\(/, 'finance ledger should normalize campus names from free-text clues');
assert.match(source, /function financeNormalizedRows\(/, 'finance page should reuse the normalized backend finance rows');
assert.match(source, /function financeRevenueRowsFromLedger\(/, 'finance revenue report should support a financial-ledger-first source');
assert.match(source, /function financeConsumeRowsFromLedger\(/, 'finance recognized report should support a financial-ledger-first source');
assert.match(source, /function financeLessonDeferredRows\(\)\{[\s\S]*purchaseEntitlement\(purchase\.id\)/, 'lesson deferred report should still compute from purchases and entitlements instead of depending on revenue rows');
assert.match(source, /if\(Array\.isArray\(financeRows\)&&financeRows\.length\)return financeRevenueRowsFromLedger\(\);/, 'finance revenue report should prefer normalized financeRows before older stitched sources');
assert.match(source, /if\(Array\.isArray\(financeRows\)&&financeRows\.length\)\{[\s\S]*return financeConsumeRowsFromLedger\(\)\.filter/, 'finance recognized report should prefer normalized financeRows before older entitlement stitching');
assert.match(source, /return loadedDatasets\.has\('financeRows'\)\|\|loadedDatasets\.has\('financialLedger'\)\|\|loadedDatasets\.has\('financePage'\);/, 'finance center loading state should recognize normalized finance rows');
assert.match(source, /const overviewCandidate=campusName[\s\S]*: financeOverviewData\?\.all;/, 'finance overview cards should read the backend normalized overview summary candidate');
assert.match(source, /const hasApiLedger=financeNormalizedRows\(\)\.length\|\|\s*\(Array\.isArray\(financialLedger\)&&financialLedger\.length\);[\s\S]*const overviewFromApi=hasApiLedger\?overviewCandidate:null;/, 'finance overview cards should fall back to legacy stitched totals when the financial ledger is empty');
assert.doesNotMatch(source, /financeOverviewSecondaryStats/, 'owner-facing finance overview should not render a second audit card row');
assert.match(source, /row\.suggestion/, 'finance audit detail table should surface actionable handling guidance');
assert.match(source, /purchase\.saleCampusId\|\|entitlementCampus\|\|purchase\.campus\|\|studentCampus/, 'course income campus should prefer saleCampusId before old fallback fields');
assert.match(source, /if\(actionType==='核销'\)return '已入账';/, 'finance ledger should treat write-off rows as recognized revenue actions');
assert.match(source, /if\(actionType==='留痕'\)return '记录';/, 'finance ledger should preserve trace-only rows as non-revenue records');
assert.match(source, /if\(userId==='match-court-finance'\)return '顺义马坡';/, 'finance ledger should pin match-court-finance to mabao campus');
assert.match(source, /const bookingOverviewRows=overviewFromApi\?\[\]:ledgerRows\.filter\(row=>\{[\s\S]*paymentChannel\|\|''\)\.trim\(\)==='历史导入'[\s\S]*期初导入汇总\|历史导入/, 'booking overview cards should exclude historical import and migration-only booking rows from the owner-facing summary');
assert.match(source, /const finalBookingIncome=overviewFromApi\?bookingIncome:bookingOverviewRows\.reduce/, 'booking income summary should only use the filtered operating booking rows');
assert.match(source, /const finalBookingRecognized=overviewFromApi\?bookingRecognized:bookingOverviewRows\.reduce/, 'booking recognized summary should use the same operating booking rows as booking income');

console.log('finance ledger rules tests passed');
