const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'audit-coach-reference-consistency' });

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3
});
const LEGACY_STATIC_COACH_REFS = [{ id: 'legacy-coach-tianhao', name: '天昊' }];

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

function text(value) {
  return String(value || '').trim();
}

function buildCoachIndex(coaches, users = []) {
  const idToName = new Map();
  const nameToId = new Map();
  const push = (id, name) => {
    const cid = text(id);
    const cname = text(name);
    if (!cid || !cname) return;
    if (!idToName.has(cid)) idToName.set(cid, cname);
    if (!nameToId.has(cname)) nameToId.set(cname, cid);
  };
  (coaches || []).forEach((coach) => {
    push(coach.id, coach.name);
  });
  LEGACY_STATIC_COACH_REFS.forEach((ref) => {
    push(ref.id, ref.name);
  });
  (users || []).filter((user) => text(user.role) === 'editor').forEach((user) => {
    const coachName = user.coachName || user.name;
    push(user.coachId || user.id || user.username, coachName);
    if (text(user.id) && text(user.coachId) && text(user.id) !== text(user.coachId)) push(user.id, coachName);
    if (text(user.username) && text(user.coachId) && text(user.username) !== text(user.coachId)) push(user.username, coachName);
  });
  return { idToName, nameToId };
}

function classifyCoachRef(value, coachIndex) {
  const raw = text(value);
  if (!raw) return null;
  const byId = coachIndex.idToName.get(raw);
  if (byId) return { raw, type: 'id', coachId: raw, coachName: byId };
  const byName = coachIndex.nameToId.get(raw);
  if (byName) return { raw, type: 'name', coachId: byName, coachName: raw };
  return { raw, type: 'unknown', coachId: '', coachName: '' };
}

function pushIssue(issues, table, field, rowId, detail) {
  issues.push({ table, field, rowId, ...detail });
}

function auditSingleFieldRows(rows, table, field, coachIndex, issues) {
  (rows || []).forEach((row) => {
    const ref = classifyCoachRef(row[field], coachIndex);
    if (!ref || ref.type !== 'unknown') return;
    pushIssue(issues, table, field, row.id, { raw: ref.raw, problem: 'unknown_ref' });
  });
}

function auditPairedCoachRows(rows, table, idField, nameField, coachIndex, issues) {
  (rows || []).forEach((row) => {
    const idRef = classifyCoachRef(row[idField], coachIndex);
    const nameRef = classifyCoachRef(row[nameField], coachIndex);
    if (idRef && idRef.type === 'unknown') {
      pushIssue(issues, table, idField, row.id, { raw: idRef.raw, problem: 'unknown_ref' });
    }
    if (nameRef && nameRef.type === 'unknown') {
      pushIssue(issues, table, nameField, row.id, { raw: nameRef.raw, problem: 'unknown_ref' });
    }
    if (idRef && nameRef && idRef.type !== 'unknown' && nameRef.type !== 'unknown') {
      if (idRef.coachId !== nameRef.coachId) {
        pushIssue(issues, table, `${idField}+${nameField}`, row.id, {
          idValue: idRef.raw,
          nameValue: nameRef.raw,
          problem: 'id_name_mismatch',
          expectedName: idRef.coachName,
          expectedId: nameRef.coachId
        });
      }
    }
  });
}

function auditArrayCoachRows(rows, table, fields, coachIndex, issues) {
  (rows || []).forEach((row) => {
    fields.forEach((field) => {
      const refs = parseArr(row[field]).map((value) => classifyCoachRef(value, coachIndex)).filter(Boolean);
      const unknown = refs.filter((item) => item.type === 'unknown').map((item) => item.raw);
      if (unknown.length) {
        pushIssue(issues, table, field, row.id, { raw: unknown, problem: 'unknown_ref' });
      }
      const types = [...new Set(refs.filter((item) => item.type !== 'unknown').map((item) => item.type))];
      if (types.length > 1) {
        pushIssue(issues, table, field, row.id, {
          raw: refs.map((item) => item.raw),
          problem: 'mixed_id_and_name_refs'
        });
      }
    });
  });
}

function summarizeIssues(issues) {
  return issues.reduce((acc, issue) => {
    const key = `${issue.table}.${issue.field}.${issue.problem}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

(async () => {
  const [coaches, users, students, classes, schedule, purchases, entitlements, packages] = await Promise.all([
    scan('ft_coaches'),
    scan('ft_users'),
    scan('ft_students'),
    scan('ft_classes'),
    scan('ft_schedule'),
    scan('ft_purchases'),
    scan('ft_entitlements'),
    scan('ft_packages')
  ]);

  const coachIndex = buildCoachIndex(coaches, users);
  const issues = [];

  auditPairedCoachRows(users.filter((row) => text(row.role) === 'editor'), 'ft_users', 'coachId', 'coachName', coachIndex, issues);
  auditPairedCoachRows(students, 'ft_students', 'primaryCoachId', 'primaryCoach', coachIndex, issues);
  auditPairedCoachRows(classes, 'ft_classes', 'coachId', 'coach', coachIndex, issues);
  auditPairedCoachRows(schedule, 'ft_schedule', 'coachId', 'coach', coachIndex, issues);

  auditSingleFieldRows(purchases, 'ft_purchases', 'ownerCoach', coachIndex, issues);
  auditArrayCoachRows(purchases, 'ft_purchases', ['allowedCoaches'], coachIndex, issues);

  auditSingleFieldRows(entitlements, 'ft_entitlements', 'ownerCoach', coachIndex, issues);
  auditArrayCoachRows(entitlements, 'ft_entitlements', ['allowedCoaches', 'coachIds', 'coachNames'], coachIndex, issues);

  auditArrayCoachRows(packages, 'ft_packages', ['coachIds', 'coachNames'], coachIndex, issues);

  const result = {
    generatedAt: new Date().toISOString(),
    coachCount: coaches.length,
    coachRefCount: coachIndex.idToName.size,
    summary: summarizeIssues(issues),
    issues
  };

  console.log(JSON.stringify(result, null, 2));
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
