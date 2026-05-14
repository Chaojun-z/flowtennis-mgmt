const assert = require('assert');
const fs = require('fs');
const path = require('path');

const apiSource = fs.readFileSync(path.join(__dirname, '..', 'api', 'index.js'), 'utf8');

assert.match(
  apiSource,
  /async function listCampusesWithDefaults\(\)\{[\s\S]*withTimeout\(getCachedScan\(T_CAMPUSES\)\.catch\(\(\)=>\[\]\),2500,null\)[\s\S]*console\.error\('\[campuses\] getCachedScan timeout, fallback to default campuses'\)[\s\S]*return DEFAULT_CAMPUSES;/,
  'campuses list should fall back to default campuses when campus table scan hangs'
);

console.log('campuses timeout fallback tests passed');
