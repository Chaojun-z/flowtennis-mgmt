const assert = require('assert');
const importer = require('../scripts/import/import-confirmed-income-batch.js');

assert.ok(importer._test, 'import script should expose test helpers');
assert.equal(typeof importer._test.withRetry, 'function', 'withRetry should be exposed');
assert.equal(typeof importer._test.getRowsByIds, 'function', 'getRowsByIds should be exposed');
assert.equal(typeof importer._test.parseMultiPackageSplitRows, 'function', 'parseMultiPackageSplitRows should be exposed');

(async () => {
  let attempts = 0;
  const result = await importer._test.withRetry('retry-demo', async () => {
    attempts += 1;
    if (attempts < 3) {
      throw new Error('temporary failure');
    }
    return 'ok';
  }, 3);

  assert.equal(result, 'ok', 'withRetry should eventually return success');
  assert.equal(attempts, 3, 'withRetry should retry before succeeding');

  const calls = [];
  const originalGetRow = importer._test.getRowsByIds;
  const rows = await originalGetRow('demo_table', ['1', '2', '3'], 2, async (_tableName, id) => {
    calls.push(id);
    return { id };
  });

  assert.deepStrictEqual(calls, ['1', '2', '3'], 'getRowsByIds should fetch rows in stable order');
  assert.deepStrictEqual(rows, [{ id: '1' }, { id: '2' }, { id: '3' }], 'getRowsByIds should collect fetched rows');

  const splitRows = importer._test.parseMultiPackageSplitRows({
    '原表行号': '212',
    parseType: 'multi_package_split',
    recognizedRevenueDelta: 1200,
    cashDelta: 0,
    '你的回答': 'misha/1v1 黄金时间10课时课包/扣一课时\n黄总/1v1 黄金时间10课时课包/扣一课时'
  });
  assert.equal(splitRows.length, 2, 'split row should create two child rows');
  assert.equal(splitRows[0].studentName, 'misha');
  assert.equal(splitRows[1].studentName, '黄总');
  assert.equal(splitRows[0].recognizedRevenueDelta, 600);
  assert.equal(splitRows[1].deferredRevenueDelta, -600);

  console.log('income import script tests passed');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
