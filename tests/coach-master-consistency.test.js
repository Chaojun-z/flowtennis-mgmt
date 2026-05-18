const assert = require('assert');
const {
  CHAOJUN_COACH_ID,
  CHAOJUN_COACH_NAME,
  planChaojunMasterFixes
} = require('../scripts/lib/coach-master-consistency');

const now = '2026-05-11T12:00:00.000Z';

{
  const fixes = planChaojunMasterFixes({
    coaches: [],
    users: [{
      id: 'chaojun',
      username: 'chaojun',
      name: '朝珺',
      role: 'editor',
      coachId: '朝珺',
      coachName: '朝珺'
    }],
    students: [
      { id: 'stu-1', primaryCoachId: '', primaryCoach: '朝珺' },
      { id: 'stu-2', primaryCoachId: '', primaryCoach: '刘朝' }
    ],
    schedule: [
      { id: 'sch-1', coachId: '朝珺', coach: '朝珺' },
      { id: 'sch-2', coachId: '', coach: '刘朝' }
    ]
  }, now);

  assert.deepStrictEqual(
    fixes.map((item) => [item.table, item.id]),
    [
      ['ft_coaches', CHAOJUN_COACH_ID],
      ['ft_users', 'chaojun'],
      ['ft_students', 'stu-1'],
      ['ft_students', 'stu-2'],
      ['ft_schedule', 'sch-1'],
      ['ft_schedule', 'sch-2']
    ],
    'repair plan should cover coach master, coach account, students, and schedule rows in the 朝珺 line'
  );

  const coachFix = fixes.find((item) => item.table === 'ft_coaches');
  assert.deepStrictEqual(
    coachFix.after,
    {
      id: CHAOJUN_COACH_ID,
      name: CHAOJUN_COACH_NAME,
      campus: '',
      status: 'active',
      phone: '',
      notes: 'staging 教练主数据补齐：统一朝珺账号/主档/排课引用口径',
      createdAt: now,
      updatedAt: now
    },
    'repair should create the minimal 朝珺 coach master row when it is missing'
  );

  const userFix = fixes.find((item) => item.table === 'ft_users');
  assert.deepStrictEqual(
    userFix.after,
    { coachId: CHAOJUN_COACH_ID, coachName: CHAOJUN_COACH_NAME },
    'coach account should bind to the canonical coach id instead of storing the name in coachId'
  );

  const studentFix = fixes.find((item) => item.id === 'stu-2');
  assert.deepStrictEqual(
    studentFix.after,
    { primaryCoachId: CHAOJUN_COACH_ID, primaryCoach: CHAOJUN_COACH_NAME },
    'legacy alias 刘朝 should be normalized back to 朝珺 on student ownership'
  );

  const scheduleFix = fixes.find((item) => item.id === 'sch-1');
  assert.deepStrictEqual(
    scheduleFix.after,
    { coachId: CHAOJUN_COACH_ID, coach: CHAOJUN_COACH_NAME },
    'schedule rows should use the canonical coach id while keeping the display name'
  );
}

{
  const fixes = planChaojunMasterFixes({
    coaches: [{ id: CHAOJUN_COACH_ID, name: '', campus: '', status: '' }],
    users: [],
    students: [],
    schedule: []
  }, now);

  assert.deepStrictEqual(
    fixes,
    [{
      table: 'ft_coaches',
      id: CHAOJUN_COACH_ID,
      before: { name: '', campus: '', status: '' },
      after: {
        id: CHAOJUN_COACH_ID,
        name: CHAOJUN_COACH_NAME,
        campus: '',
        status: 'active',
        phone: '',
        notes: 'staging 教练主数据补齐：统一朝珺账号/主档/排课引用口径',
        createdAt: now,
        updatedAt: now
      }
    }],
    'existing but corrupted 朝珺 coach master row should be repaired back to the canonical fields'
  );
}

{
  const fixes = planChaojunMasterFixes({
    coaches: [{ id: CHAOJUN_COACH_ID, name: CHAOJUN_COACH_NAME, campus: '', status: 'active' }],
    users: [{ id: 'chaojun', role: 'editor', coachId: CHAOJUN_COACH_ID, coachName: CHAOJUN_COACH_NAME, name: CHAOJUN_COACH_NAME }],
    students: [{ id: 'stu-1', primaryCoachId: CHAOJUN_COACH_ID, primaryCoach: CHAOJUN_COACH_NAME }],
    schedule: [{ id: 'sch-1', coachId: CHAOJUN_COACH_ID, coach: CHAOJUN_COACH_NAME }]
  }, now);

  assert.deepStrictEqual(fixes, [], 'already-aligned 朝珺 records should not be rewritten');
}

console.log('coach master consistency tests passed');
