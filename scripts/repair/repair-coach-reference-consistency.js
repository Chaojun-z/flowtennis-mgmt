const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');
const { planChaojunMasterFixes } = require('../lib/coach-master-consistency');
const { putRow } = require('../lib/staging-data-store');

loadRuntimeEnv({ entry: 'repair-coach-reference-consistency' });

const dryRun = !process.argv.includes('--apply');

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3
});

const TABLES = {
  users: 'ft_users',
  coaches: 'ft_coaches',
  students: 'ft_students',
  schedule: 'ft_schedule',
  purchases: 'ft_purchases',
  entitlements: 'ft_entitlements'
};

const LEGACY_COACH_ROWS = [
  {
    id: 'legacy-coach-tianhao',
    name: '天昊',
    campus: '',
    status: 'inactive',
    phone: '',
    notes: '历史兼容教练，占位保留旧购买/权益记录里的教练语义'
  }
];

const EXACT_NAME_MAP = new Map([
  ['chaojun', '朝珺'],
  ['siren', 'Siren'],
  ['晓哲教练', '晓哲']
]);

function decodeRow(row) {
  if (!row || !row.primaryKey) return null;
  const obj = { id: row.primaryKey[0].value };
  (row.attributes || []).forEach((attr) => {
    try {
      obj[attr.columnName] = JSON.parse(attr.columnValue);
    } catch {
      obj[attr.columnName] = attr.columnValue;
    }
  });
  return obj;
}

function scan(tableName) {
  return new Promise((resolve, reject) => {
    const rows = [];
    function next(startKey) {
      client.getRange({
        tableName,
        direction: TableStore.Direction.FORWARD,
        inclusiveStartPrimaryKey: startKey || [{ id: TableStore.INF_MIN }],
        exclusiveEndPrimaryKey: [{ id: TableStore.INF_MAX }],
        maxVersions: 1,
        limit: 500
      }, (err, data) => {
        if (err) return reject(err);
        (data.rows || []).forEach((row) => {
          const decoded = decodeRow(row);
          if (decoded) rows.push(decoded);
        });
        if (data.nextStartPrimaryKey) return next(data.nextStartPrimaryKey);
        resolve(rows);
      });
    }
    next();
  });
}

function text(value) {
  return String(value || '').trim();
}

function parseArr(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) {
    try {
      return JSON.parse(value);
    } catch {
      return [];
    }
  }
  return [];
}

function buildCoachMaps(coaches) {
  const byName = new Map();
  const byId = new Map();
  (coaches || []).forEach((coach) => {
    const name = text(coach.name);
    const id = text(coach.id);
    if (name) byName.set(name, coach);
    if (id) byId.set(id, coach);
  });
  return { byName, byId };
}

function normalizeSingleCoachValue(value) {
  const raw = text(value);
  if (!raw) return raw;
  return EXACT_NAME_MAP.get(raw) || raw;
}

function normalizeOwnerCoach(value) {
  const raw = normalizeSingleCoachValue(value);
  if (raw === '没有固定教练' || raw === '不固定') return '';
  if (raw === 'siren+老吴' || raw === 'siren/天昊') return 'Siren';
  return raw;
}

function normalizeCoachArray(value) {
  const list = parseArr(value);
  if (!list.length) return list;
  const normalized = [];
  const seen = new Set();
  list.forEach((item) => {
    const next = normalizeSingleCoachValue(item);
    let expanded = [next];
    if (next === '没有固定教练' || next === '不固定') expanded = [];
    if (next === 'siren+老吴') expanded = ['Siren', '吴教练'];
    if (next === 'siren/天昊') expanded = ['Siren', '天昊'];
    expanded.forEach((name) => {
      if (!name || seen.has(name)) return;
      seen.add(name);
      normalized.push(name);
    });
  });
  return normalized;
}

function diffChanged(oldValue, nextValue) {
  return JSON.stringify(oldValue) !== JSON.stringify(nextValue);
}

function planUserFixes(users, coachMaps) {
  const fixes = [];
  (users || []).forEach((user) => {
    if (text(user.role) !== 'editor') return;
    const coachName = text(user.coachName || user.name);
    const mappedCoach = coachMaps.byName.get(coachName);
    if (!mappedCoach) return;
    const nextCoachId = text(mappedCoach.id);
    if (!nextCoachId || nextCoachId === text(user.coachId)) return;
    if (user.id !== 'chaojun') return;
    fixes.push({
      table: TABLES.users,
      id: user.id,
      before: { coachId: user.coachId, coachName: user.coachName },
      after: { coachId: nextCoachId, coachName }
    });
  });
  return fixes;
}

function planPurchaseFixes(rows) {
  const fixes = [];
  (rows || []).forEach((row) => {
    const nextOwnerCoach = normalizeOwnerCoach(row.ownerCoach);
    const nextAllowed = normalizeCoachArray(row.allowedCoaches);
    if (!diffChanged(text(row.ownerCoach), nextOwnerCoach) && !diffChanged(parseArr(row.allowedCoaches), nextAllowed)) return;
    fixes.push({
      table: TABLES.purchases,
      id: row.id,
      before: { ownerCoach: row.ownerCoach, allowedCoaches: parseArr(row.allowedCoaches) },
      after: { ownerCoach: nextOwnerCoach, allowedCoaches: nextAllowed }
    });
  });
  return fixes;
}

function planEntitlementFixes(rows) {
  const fixes = [];
  (rows || []).forEach((row) => {
    const nextOwnerCoach = normalizeOwnerCoach(row.ownerCoach);
    const nextAllowed = normalizeCoachArray(row.allowedCoaches);
    const nextCoachNames = normalizeCoachArray(row.coachNames);
    const changed =
      diffChanged(text(row.ownerCoach), nextOwnerCoach) ||
      diffChanged(parseArr(row.allowedCoaches), nextAllowed) ||
      diffChanged(parseArr(row.coachNames), nextCoachNames);
    if (!changed) return;
    fixes.push({
      table: TABLES.entitlements,
      id: row.id,
      before: {
        ownerCoach: row.ownerCoach,
        allowedCoaches: parseArr(row.allowedCoaches),
        coachNames: parseArr(row.coachNames)
      },
      after: {
        ownerCoach: nextOwnerCoach,
        allowedCoaches: nextAllowed,
        coachNames: nextCoachNames
      }
    });
  });
  return fixes;
}

async function applyFixes(allRows, fixes) {
  const rowMaps = {
    [TABLES.coaches]: new Map(allRows.coaches.map((row) => [row.id, row])),
    [TABLES.users]: new Map(allRows.users.map((row) => [row.id, row])),
    [TABLES.students]: new Map(allRows.students.map((row) => [row.id, row])),
    [TABLES.schedule]: new Map(allRows.schedule.map((row) => [row.id, row])),
    [TABLES.purchases]: new Map(allRows.purchases.map((row) => [row.id, row])),
    [TABLES.entitlements]: new Map(allRows.entitlements.map((row) => [row.id, row]))
  };
  for (const fix of fixes) {
    const current = rowMaps[fix.table].get(fix.id);
    if (!current && fix.table !== TABLES.coaches) continue;
    await putRow(client, fix.table, {
      ...(current || {}),
      ...fix.after,
      updatedAt: new Date().toISOString()
    });
  }
}

function planLegacyCoachFixes(coaches) {
  const coachMaps = buildCoachMaps(coaches);
  return LEGACY_COACH_ROWS
    .filter((row) => !coachMaps.byName.has(text(row.name)))
    .map((row) => ({
      table: TABLES.coaches,
      id: row.id,
      before: null,
      after: {
        ...row,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    }));
}

(async () => {
  const [coaches, users, students, schedule, purchases, entitlements] = await Promise.all([
    scan(TABLES.coaches),
    scan(TABLES.users),
    scan(TABLES.students),
    scan(TABLES.schedule),
    scan(TABLES.purchases),
    scan(TABLES.entitlements)
  ]);

  const coachMaps = buildCoachMaps(coaches);
  const fixes = [
    ...planLegacyCoachFixes(coaches),
    ...planChaojunMasterFixes({ coaches, users, students, schedule }),
    ...planUserFixes(users, coachMaps),
    ...planPurchaseFixes(purchases),
    ...planEntitlementFixes(entitlements)
  ];

  if (!dryRun) {
    await applyFixes({ coaches, users, students, schedule, purchases, entitlements }, fixes);
  }

  const summary = fixes.reduce((acc, item) => {
    acc[item.table] = (acc[item.table] || 0) + 1;
    return acc;
  }, {});

  console.log(JSON.stringify({
    dryRun,
    totalFixes: fixes.length,
    summary,
    fixes: fixes.slice(0, 80)
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
