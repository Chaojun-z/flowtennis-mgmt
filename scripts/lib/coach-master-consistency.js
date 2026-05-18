const CHAOJUN_COACH_ID = 'coach-chaojun';
const CHAOJUN_COACH_NAME = '朝珺';
const CHAOJUN_ALIASES = new Set(['朝珺', '刘朝']);

function text(value) {
  return String(value || '').trim();
}

function matchesChaojun(value) {
  return CHAOJUN_ALIASES.has(text(value));
}

function buildChaojunCoachRow(now = new Date().toISOString()) {
  return {
    id: CHAOJUN_COACH_ID,
    name: CHAOJUN_COACH_NAME,
    campus: '',
    status: 'active',
    phone: '',
    notes: 'staging 教练主数据补齐：统一朝珺账号/主档/排课引用口径',
    createdAt: now,
    updatedAt: now
  };
}

function diffChanged(oldValue, nextValue) {
  return JSON.stringify(oldValue) !== JSON.stringify(nextValue);
}

function planChaojunMasterFixes({ coaches = [], users = [], students = [], schedule = [] } = {}, now = new Date().toISOString()) {
  const fixes = [];
  const existingCoach = coaches.find((row) => text(row.id) === CHAOJUN_COACH_ID || text(row.name) === CHAOJUN_COACH_NAME);
  const canonicalCoach = buildChaojunCoachRow(now);

  if (!existingCoach) {
    fixes.push({
      table: 'ft_coaches',
      id: CHAOJUN_COACH_ID,
      before: null,
      after: canonicalCoach
    });
  } else {
    const before = {
      name: text(existingCoach.name),
      campus: text(existingCoach.campus),
      status: text(existingCoach.status)
    };
    const after = canonicalCoach;
    if (
      before.name !== CHAOJUN_COACH_NAME ||
      !before.status
    ) {
      fixes.push({
        table: 'ft_coaches',
        id: existingCoach.id || CHAOJUN_COACH_ID,
        before,
        after
      });
    }
  }

  if (existingCoach && text(existingCoach.id) && text(existingCoach.id) !== CHAOJUN_COACH_ID) {
    users = users.map((row) => {
      if (text(row.coachId) === text(existingCoach.id)) return { ...row, coachId: CHAOJUN_COACH_ID };
      return row;
    });
  }

  users.forEach((row) => {
    if (text(row.id) !== 'chaojun' && !matchesChaojun(row.coachName || row.name)) return;
    const after = {
      coachId: CHAOJUN_COACH_ID,
      coachName: CHAOJUN_COACH_NAME
    };
    if (!diffChanged({ coachId: text(row.coachId), coachName: text(row.coachName) }, after)) return;
    fixes.push({
      table: 'ft_users',
      id: row.id,
      before: { coachId: row.coachId, coachName: row.coachName },
      after
    });
  });

  students.forEach((row) => {
    if (!matchesChaojun(row.primaryCoach) && text(row.primaryCoachId) !== CHAOJUN_COACH_ID) return;
    const after = {
      primaryCoachId: CHAOJUN_COACH_ID,
      primaryCoach: CHAOJUN_COACH_NAME
    };
    if (!diffChanged({ primaryCoachId: text(row.primaryCoachId), primaryCoach: text(row.primaryCoach) }, after)) return;
    fixes.push({
      table: 'ft_students',
      id: row.id,
      before: { primaryCoachId: row.primaryCoachId, primaryCoach: row.primaryCoach },
      after
    });
  });

  schedule.forEach((row) => {
    if (!matchesChaojun(row.coach) && !matchesChaojun(row.coachId) && text(row.coachId) !== CHAOJUN_COACH_ID) return;
    const after = {
      coachId: CHAOJUN_COACH_ID,
      coach: CHAOJUN_COACH_NAME
    };
    if (!diffChanged({ coachId: text(row.coachId), coach: text(row.coach) }, after)) return;
    fixes.push({
      table: 'ft_schedule',
      id: row.id,
      before: { coachId: row.coachId, coach: row.coach },
      after
    });
  });

  return fixes;
}

module.exports = {
  CHAOJUN_COACH_ID,
  CHAOJUN_COACH_NAME,
  buildChaojunCoachRow,
  planChaojunMasterFixes
};
