const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '../public/assets/scripts/core/state.js'), 'utf8');

function readArrayLiteral(objectName, key) {
  const pattern = new RegExp(`const ${objectName}=\\{[\\s\\S]*?${key}:\\[(.*?)\\]`, 'm');
  const match = source.match(pattern);
  assert.ok(match, `${objectName}.${key} should exist`);
  return match[1].replace(/\s+/g, '');
}

const studentsBackground = readArrayLiteral('PAGE_DATA_BACKGROUND_REQUIREMENTS', 'students');
const studentsGuard = readArrayLiteral('PERFORMANCE_PAGE_DATA_GUARD', 'students');
const workbenchBackground = readArrayLiteral('PAGE_DATA_BACKGROUND_REQUIREMENTS', 'workbench');
const workbenchGuard = readArrayLiteral('PERFORMANCE_PAGE_DATA_GUARD', 'workbench');

assert.strictEqual(
  studentsGuard,
  studentsBackground,
  'students performance guard must stay consistent with the actual background loading strategy'
);
assert.strictEqual(
  workbenchGuard,
  workbenchBackground,
  'workbench performance guard must stay consistent with the actual background loading strategy'
);

console.log('page data guard consistency tests passed');
