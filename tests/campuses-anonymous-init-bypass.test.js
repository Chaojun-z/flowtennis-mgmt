const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /if\(path==='\/campuses'\)\{[\s\S]*if\(method==='GET'\)\{[\s\S]*console\.log\('\[campuses\] GET route entered'\);[\s\S]*console\.log\('\[campuses\] GET using hard fallback DEFAULT_CAMPUSES'\);[\s\S]*return sendJson\(res,result\);[\s\S]*\}[\s\S]*await init\(\);[\s\S]*if\(method==='POST'\)/,
  'anonymous campuses GET should bypass init and use the hard fallback route before any write-path init logic'
);

console.log('campuses anonymous init bypass tests passed');
