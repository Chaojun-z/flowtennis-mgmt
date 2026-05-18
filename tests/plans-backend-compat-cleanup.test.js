const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '../api/index.js'), 'utf8');
const routeSource = fs.readFileSync(path.join(__dirname, '../api/teaching/route-handlers.js'), 'utf8');
function sectionBetween(source,startMarker,endMarker){
  const start=source.indexOf(startMarker);
  const end=source.indexOf(endMarker,start);
  assert.ok(start>=0&&end>start, `missing source section: ${startMarker}`);
  return source.slice(start,end);
}

const studentIdentitySection=sectionBetween(apiSource,'function buildStudentIdentityUpdates','async function validateScheduleSave');
const coachRenameSection=sectionBetween(apiSource,'function buildCoachRenameUpdates','function buildStudentIdentityUpdates');
const productRenameSection=sectionBetween(apiSource,'function buildProductRenameDisplayUpdates','function normalizeCourtRecord');
const classDeleteSection=sectionBetween(routeSource,"const classMatch=path.match(/^\\/classes\\/(.+)$/);",'return null;');
const plansRouteSection=routeSource;
const classesRouteSection=sectionBetween(routeSource,"if(path==='/classes'){","const classMatch=path.match(/^\\/classes\\/(.+)$/);");
const classDetailRouteSection=sectionBetween(routeSource,"const classMatch=path.match(/^\\/classes\\/(.+)$/);",'return null;');
const scheduleRouteSection=sectionBetween(routeSource,"const scheduleMatch=path.match(/^\\/schedule\\/(.+)$/);","if(path==='/coaches'){");

assert.doesNotMatch(
  studentIdentitySection,
  /plans:\(data\.plans\|\|\[\]\)/,
  'student identity sync should stop maintaining retired plans rows'
);

assert.doesNotMatch(
  studentIdentitySection,
  /getCachedScan\(T_PLANS\)/,
  'student identity sync should stop scanning retired plans rows'
);

assert.doesNotMatch(
  coachRenameSection,
  /plans:\(data\.plans\|\|\[\]\)/,
  'coach rename should stop maintaining retired plans rows'
);

assert.doesNotMatch(
  coachRenameSection,
  /scan plans for coach references/,
  'coach reference loading should stop scanning retired plans rows'
);

assert.doesNotMatch(
  productRenameSection,
  /const plans=\(data\.plans\|\|\[\]\)/,
  'product rename should stop preparing retired plans rows'
);

assert.doesNotMatch(apiSource, /async function syncClassPlans\(classId,cls\)\{/, 'class plan sync should be removed');

assert.doesNotMatch(plansRouteSection, /if\(path==='\/plans'\)\{/, '/plans list route should be removed');

assert.doesNotMatch(plansRouteSection, /path\.match\(\/\^\\\/plans\\\/\(\.\+\)\$\/\)|path\.match\(\^\\\/plans\\\/\(\.\+\)\$\/\)|path\.match\(\^\/plans\/\(\.\+\)\$\/\)/, '/plans detail route should be removed');

assert.doesNotMatch(
  classesRouteSection,
  /syncClassPlans\(id,r\)/,
  'class create should stop syncing retired plans rows'
);

assert.doesNotMatch(
  classDetailRouteSection,
  /syncClassPlans\(id,r\)/,
  'class edit should stop syncing retired plans rows'
);

assert.doesNotMatch(
  scheduleRouteSection,
  /return sendJson\(res,\{schedule:r,classes,plans,entitlements,entitlementLedger,warnings:risk\.warnings\|\|\[\]\}\);|return sendJson\(res,\{schedule:r,classes,plans,entitlements,entitlementLedger\}\);/,
  'schedule edit should stop exposing retired plans payloads to callers'
);

assert.doesNotMatch(classDeleteSection, /getCachedScan\(T_PLANS\)|del\(T_PLANS,/, 'class delete should stop clearing retired plans rows');

console.log('plans backend compat cleanup tests passed');
