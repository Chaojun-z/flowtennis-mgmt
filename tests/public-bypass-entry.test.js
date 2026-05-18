const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /if\(path==='\/health'&&method==='GET'\)\{[\s\S]*console\.log\('\[health\] GET bypass scheduleInitInBackground'\);[\s\S]*return sendJson\(res,\{status:'ok',time:new Date\(\)\.toISOString\(\)\}\);[\s\S]*if\(path==='\/campuses'&&method==='GET'\)\{[\s\S]*console\.log\('\[campuses\] GET bypass scheduleInitInBackground'\);[\s\S]*return sendJson\(res,DEFAULT_CAMPUSES\);[\s\S]*scheduleInitInBackground\(\);/,
  'public health and campuses endpoints should bypass scheduleInitInBackground at request entry'
);

console.log('public bypass entry tests passed');
