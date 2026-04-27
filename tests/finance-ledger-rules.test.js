const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/pages/coachops.js'), 'utf8');

assert.match(source, /function renderFinanceOverview\(/, 'finance center should expose overview rendering');
assert.match(source, /const overviewCandidate=campusName[\s\S]*: financeOverviewData\?\.all;/, 'finance overview cards should read the backend normalized overview summary candidate');
assert.match(source, /const hasApiLedger=financeNormalizedRows\(\)\.length\|\|\s*\(Array\.isArray\(financialLedger\)&&financialLedger\.length\);[\s\S]*const overviewFromApi=hasApiLedger\?overviewCandidate:null;/, 'finance overview cards should fall back to legacy stitched totals when the financial ledger is empty');
assert.match(source, /const finalPackageRecognized=overviewFromApi\?packageRecognized:consumeRows\.reduce\(\(sum,row\)=>sum\+\(\(row\.actionLabel==='退回'\?-1:1\)\*Math\.max\(0,Number\(row\.recognizedAmount\)\|\|0\)\),0\);/, 'package recognized summary should count all consume rows instead of depending on a brittle courseType label');
assert.doesNotMatch(source, /financeOverviewSecondaryStats/, 'owner-facing finance overview should not render a second audit card row');
assert.match(source, /function financeBookingOverviewRows\(\)\{/, 'booking overview cards should use a dedicated helper');
assert.match(source, /\['会员订场','散客订场','约球局'\]\.includes\(businessType\)/, 'booking overview helper should include member bookings');
assert.match(source, /if\(\/期初导入汇总\/\.test\(noteText\)\)return \[\];/, 'booking overview helper should only exclude opening-balance style import rows');
assert.match(source, /recognizedAmount:payMethod==='代用户订场'\?0:signed/, 'booking overview helper should keep proxy bookings pending instead of recognized');
assert.match(source, /const bookingOverviewRows=overviewFromApi\?\[\]:financeBookingOverviewRows\(\);/, 'booking overview cards should use the dedicated booking operating helper');
assert.match(source, /const finalBookingIncome=overviewFromApi\?bookingIncome:bookingOverviewRows\.reduce\(\(sum,row\)=>sum\+\(Number\(row\.incomeAmount\)\|\|0\),0\);/, 'booking income summary should use booking operating income amounts');
assert.match(source, /const finalBookingRecognized=overviewFromApi\?bookingRecognized:bookingOverviewRows\.reduce\(\(sum,row\)=>sum\+\(Number\(row\.recognizedAmount\)\|\|0\),0\);/, 'booking recognized summary should use booking operating recognized amounts');
assert.match(source, /value:financeCardValue\(finalCash\)/, 'finance overview should render fallback totals instead of zeroing owner cards');
assert.match(source, /value:financeCardValue\(finalBookingIncome,finalBookingRecognized\)/, 'booking overview should render the filtered booking totals');

console.log('finance ledger rules tests passed');
