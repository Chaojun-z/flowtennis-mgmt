const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'inspect-coach-reference-anomalies' });

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3
});
const LEGACY_STATIC_COACH_REFS = [{ id: 'legacy-coach-tianhao', name: '天昊', source: 'legacy-static' }];

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

function buildCoachIndex(coaches, users) {
  const idToName = new Map();
  const nameToId = new Map();
  const refs = [];
  const push = (id, name, source) => {
    const cid = text(id);
    const cname = text(name);
    if (!cid || !cname) return;
    if (!idToName.has(cid)) idToName.set(cid, cname);
    if (!nameToId.has(cname)) nameToId.set(cname, cid);
    refs.push({ id: cid, name: cname, source });
  };
  coaches.forEach((coach) => push(coach.id, coach.name, 'coach'));
  LEGACY_STATIC_COACH_REFS.forEach((ref) => push(ref.id, ref.name, ref.source));
  users.filter((user) => text(user.role) === 'editor').forEach((user) => {
    const coachName = user.coachName || user.name;
    push(user.coachId || user.id || user.username, coachName, 'user');
    if (text(user.id) && text(user.coachId) && text(user.id) !== text(user.coachId)) push(user.id, coachName, 'user-alias');
    if (text(user.username) && text(user.coachId) && text(user.username) !== text(user.coachId)) push(user.username, coachName, 'user-alias');
  });
  return { idToName, nameToId, refs };
}

function classify(value, index) {
  const raw = text(value);
  if (!raw) return null;
  if (index.idToName.has(raw)) return { raw, type: 'id', coachId: raw, coachName: index.idToName.get(raw) };
  if (index.nameToId.has(raw)) return { raw, type: 'name', coachId: index.nameToId.get(raw), coachName: raw };
  return { raw, type: 'unknown', coachId: '', coachName: '' };
}

function pushCount(map, raw, table, field, rowId) {
  if (!raw) return;
  if (!map.has(raw)) map.set(raw, { count: 0, refs: [] });
  const current = map.get(raw);
  current.count += 1;
  current.refs.push({ table, field, rowId });
}

(async () => {
  const [coaches, users, purchases, entitlements] = await Promise.all([
    scan('ft_coaches'),
    scan('ft_users'),
    scan('ft_purchases'),
    scan('ft_entitlements')
  ]);

  const index = buildCoachIndex(coaches, users);
  const unknowns = new Map();

  purchases.forEach((row) => {
    const owner = classify(row.ownerCoach, index);
    if (owner && owner.type === 'unknown') pushCount(unknowns, owner.raw, 'ft_purchases', 'ownerCoach', row.id);
    parseArr(row.allowedCoaches).forEach((item) => {
      const ref = classify(item, index);
      if (ref && ref.type === 'unknown') pushCount(unknowns, ref.raw, 'ft_purchases', 'allowedCoaches', row.id);
    });
  });

  entitlements.forEach((row) => {
    const owner = classify(row.ownerCoach, index);
    if (owner && owner.type === 'unknown') pushCount(unknowns, owner.raw, 'ft_entitlements', 'ownerCoach', row.id);
    ['allowedCoaches', 'coachNames'].forEach((field) => {
      parseArr(row[field]).forEach((item) => {
        const ref = classify(item, index);
        if (ref && ref.type === 'unknown') pushCount(unknowns, ref.raw, 'ft_entitlements', field, row.id);
      });
    });
  });

  const userBindings = users
    .filter((user) => text(user.role) === 'editor')
    .map((user) => ({
      userId: user.id,
      userName: user.name,
      coachId: text(user.coachId || user.id || user.username),
      coachName: text(user.coachName || user.name)
    }));

  const coachList = coaches.map((coach) => ({
    id: text(coach.id),
    name: text(coach.name),
    campus: text(coach.campus),
    status: text(coach.status || 'active')
  }));

  const summary = [...unknowns.entries()]
    .map(([raw, meta]) => ({ raw, count: meta.count, examples: meta.refs.slice(0, 5) }))
    .sort((a, b) => b.count - a.count || a.raw.localeCompare(b.raw, 'zh-Hans-CN'));

  console.log(JSON.stringify({
    generatedAt: new Date().toISOString(),
    coaches: coachList,
    userBindings,
    unknownSummary: summary
  }, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
