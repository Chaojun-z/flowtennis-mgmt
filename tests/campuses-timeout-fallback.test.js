const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /async function listCampusesWithDefaults\(\)\{[\s\S]*return DEFAULT_CAMPUSES;[\s\S]*\}/,
  'campuses list should hard-return default campuses during the hotfix window'
);

console.log('campuses timeout fallback tests passed');
