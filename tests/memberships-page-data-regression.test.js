const assert = require('assert');
const fs = require('fs');
const path = require('path');

const handlerSource = fs.readFileSync(path.join(__dirname, '../api/page-data/aggregate-handlers.js'), 'utf8');

assert.match(
  handlerSource,
  /\/page-data\/memberships[\s\S]*const normalizedMembershipPlans=\(Array\.isArray\(membershipPlans\)\?membershipPlans:\[\]\)\.map\(normalizeMembershipPlanViewRecord\);[\s\S]*const membershipPlanMap=new Map\(normalizedMembershipPlans\.map\(item=>\[item\.id,item\]\)\);[\s\S]*const normalizedMembershipOrders=\(Array\.isArray\(membershipOrders\)\?membershipOrders:\[\]\)\.map\(order=>normalizeMembershipOrderViewRecord\(order,membershipPlanMap\.get\(order\.membershipPlanId\)\)\);[\s\S]*const reconciled=await runMembershipReconcile\(\{accounts:membershipAccounts,courts\}\);[\s\S]*courts:reconciled\.courts\|\|courts[\s\S]*membershipAccounts:Array\.isArray\(reconciled\.accounts\)\?reconciled\.accounts:\[\][\s\S]*membershipOrders:normalizedMembershipOrders[\s\S]*membershipAccountEvents:\[\.\.\.\(Array\.isArray\(membershipAccountEvents\)\?membershipAccountEvents:\[\]\),\.\.\.\(reconciled\.events\|\|\[\]\)\][\s\S]*membershipPlans:normalizedMembershipPlans[\s\S]*coaches/s,
  'memberships page aggregate endpoint should normalize membership data and reconcile accounts/courts before returning'
);

console.log('memberships page data regression tests passed');
