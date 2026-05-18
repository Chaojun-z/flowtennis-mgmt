function normalizeTableNames(tableNames) {
  if (!Array.isArray(tableNames)) return [];
  return tableNames
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function resolveImportPlan(snapshot, options = {}) {
  const orderedEntries = Object.entries(snapshot || {});
  const tableFilter = new Set(normalizeTableNames(options.tableNames));
  const startAtTable = String(options.startAtTable || '').trim();
  let startAtReached = !startAtTable;
  const plan = [];
  for (const [tableName, rows] of orderedEntries) {
    if (!startAtReached) {
      if (tableName !== startAtTable) continue;
      startAtReached = true;
    }
    if (tableFilter.size && !tableFilter.has(tableName)) continue;
    plan.push({
      tableName,
      rows: Array.isArray(rows) ? rows : []
    });
  }
  return plan;
}

function isRetryableImportError(error) {
  const message = String(error && error.message ? error.message : error || '').toLowerCase();
  if (!message) return false;
  if (message.includes('accesskeyid does not exist')) return false;
  if (message.includes('otsauthfailed')) return false;
  return (
    message.includes('client network socket disconnected before secure tls connection was established') ||
    message.includes('socket hang up') ||
    message.includes('otspartitionunavailable') ||
    message.includes('partition is splitting') ||
    message.includes('econnreset') ||
    message.includes('etimedout') ||
    message.includes('timeout')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runWithRetry(task, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts || 1));
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs || 0));
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isRetryableImportError(error)) break;
      if (baseDelayMs > 0) await sleep(baseDelayMs * attempt);
    }
  }
  throw lastError;
}

module.exports = {
  resolveImportPlan,
  isRetryableImportError,
  runWithRetry
};
