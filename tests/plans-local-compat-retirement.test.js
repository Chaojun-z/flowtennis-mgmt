const assert = require('assert');
const fs = require('fs');
const path = require('path');

function read(relPath) {
  return fs.readFileSync(path.join(__dirname, '..', relPath), 'utf8');
}

const studentsSource = read('public/assets/scripts/pages/students.js');
const scheduleSource = read('public/assets/scripts/pages/schedule.js');
const classesSource = read('public/assets/scripts/pages/classes.js');
const bootstrapSource = read('public/assets/scripts/core/bootstrap.js');
const stateSource = read('public/assets/scripts/core/state.js');

assert.doesNotMatch(
  studentsSource,
  /\(updates\.plans\|\|\[\]\)\.forEach/,
  'students page should stop merging retired plans compatibility updates into local state'
);

assert.doesNotMatch(
  scheduleSource,
  /\(result\?\.plans\|\|\[\]\)\.forEach/,
  'schedule page should stop writing retired plans rows back into local state after save'
);

assert.doesNotMatch(
  classesSource,
  /Array\.isArray\(res\?\.plans\)/,
  'classes page should stop consuming retired plans save payloads'
);

assert.doesNotMatch(
  bootstrapSource,
  /plan:'\/plans\/'/,
  'bootstrap delete router should stop keeping a retired plans delete mapping'
);

assert.doesNotMatch(
  bootstrapSource,
  /else if\(delType==='plan'\)/,
  'bootstrap delete flow should stop mutating retired plans local state'
);

assert.doesNotMatch(
  bootstrapSource,
  /plans=plans\.filter\(p=>p\.classId!==delId\)/,
  'bootstrap class delete flow should stop cleaning retired plans local state'
);

assert.doesNotMatch(
  stateSource,
  /pricePlans=\[\],plans=\[\],schedules=\[\]/,
  'state bootstrap should stop defining a local retired plans dataset slot'
);

assert.doesNotMatch(
  stateSource,
  /if\(name==='plans'\)plans=rows;/,
  'state dataset setter should stop hydrating retired plans rows'
);

assert.doesNotMatch(
  stateSource,
  /plans=\[\];schedules=\[\]/,
  'state clear flow should stop resetting retired plans local state'
);

assert.doesNotMatch(
  stateSource,
  /plans=Array\.isArray\(data\?\.plans\)\?data\.plans:\[\];/,
  'state load-all hydration should stop restoring retired plans rows'
);

assert.doesNotMatch(
  stateSource,
  /'pricePlans','plans','schedule'/,
  'state loaded dataset registry should stop marking retired plans as active data'
);

assert.doesNotMatch(
  bootstrapSource,
  /- 计划：'\+plans\.length\+/,
  'bootstrap backup summary should stop counting retired plans'
);

console.log('plans local compatibility retirement tests passed');
