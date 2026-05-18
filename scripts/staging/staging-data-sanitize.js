const fs = require('fs');
const path = require('path');
const { loadRuntimeEnv } = require('../lib/runtime-env');

const root = path.join(__dirname, '..', '..');
const MASKED = '***';
const SENSITIVE_KEYS = new Set([
  'name',
  'studentName',
  'parentName',
  'phone',
  'mobile',
  'openid',
  'unionid',
  'remark',
  'note',
  'notes',
  'comment'
]);

function readArg(name, fallback = '') {
  const token = process.argv.find((item) => item.startsWith(`${name}=`));
  return token ? token.slice(name.length + 1) : fallback;
}

function maskValue(key, value) {
  if (value == null) return value;
  if (!SENSITIVE_KEYS.has(String(key))) return value;
  if (typeof value === 'string') {
    if (/phone|mobile/i.test(String(key))) return value.replace(/\d(?=\d{2})/g, '*');
    if (/openid|unionid/i.test(String(key))) return `${String(value).slice(0, 3)}***`;
    return MASKED;
  }
  return MASKED;
}

function sanitizeNode(node) {
  if (Array.isArray(node)) return node.map(sanitizeNode);
  if (!node || typeof node !== 'object') return node;
  return Object.fromEntries(
    Object.entries(node).map(([key, value]) => {
      if (value && typeof value === 'object') return [key, sanitizeNode(value)];
      return [key, maskValue(key, value)];
    })
  );
}

function countTopLevelRows(snapshot) {
  return Object.fromEntries(
    Object.entries(snapshot || {}).map(([key, value]) => [key, Array.isArray(value) ? value.length : 0])
  );
}

function main() {
  loadRuntimeEnv({ entry: 'staging-data-sanitize' });
  const inputPath = path.resolve(readArg('--input'));
  if (!inputPath) throw new Error('缺少 --input=<raw-json>');
  const defaultOutput = path.join(root, 'staging-data', 'sanitized', `${path.basename(inputPath, '.json')}.sanitized.json`);
  const outputPath = path.resolve(readArg('--output', defaultOutput));
  const reportPath = path.join(root, 'staging-data', 'reports', `${path.basename(outputPath, '.json')}.report.json`);
  const rawSnapshot = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  const sanitizedSnapshot = sanitizeNode(rawSnapshot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(sanitizedSnapshot, null, 2));
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        inputPath,
        outputPath,
        topLevelCounts: countTopLevelRows(sanitizedSnapshot),
        sensitiveKeys: Array.from(SENSITIVE_KEYS)
      },
      null,
      2
    )
  );
  console.log(JSON.stringify({ outputPath, reportPath }, null, 2));
}

main();
