const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /if\(path==='\/campuses'\)\{if\(method==='GET'\)return sendJson\(res,await listCampusesWithDefaults\(\)\);await init\(\);if\(method==='POST'\)/,
  'anonymous campuses GET should bypass init so readonly campus reads do not wait on cold-start repair work'
);

console.log('campuses anonymous init bypass tests passed');
