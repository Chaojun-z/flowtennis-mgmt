const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'inspect-mabao-membership-damaged-orders' });

const client = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET,
  endpoint: process.env.TS_ENDPOINT,
  instancename: process.env.TS_INSTANCE || 'flowtennis',
  maxRetries: 3,
  httpOptions: { timeout: 12000, maxSockets: 5 }
});

const TARGETS = [
  {
    orderId: 'daf10fa1-da77-4c7f-8686-53bcadff5e1d',
    courtId: 'eed2716c-c642-49ac-b00d-96e8b7c4e549'
  },
  {
    orderId: '40bda10f-86fd-4b7c-99b6-7703946fe58c',
    courtId: '29c46280-0a29-4f11-bf52-b4fa9d3568e9'
  },
  {
    orderId: '68b8f708-437d-4073-bbeb-204e17060634',
    courtId: 'c840ae23-51e4-48f2-a9ef-5b7486f6a185'
  }
];

function decodeRow(row) {
  if (!row || !row.primaryKey || !row.primaryKey[0]) return null;
  const obj = { id: row.primaryKey[0].value, _rawAttributes: row.attributes || [] };
  (row.attributes || []).forEach((a) => {
    try {
      obj[a.columnName] = JSON.parse(a.columnValue);
    } catch {
      obj[a.columnName] = a.columnValue;
    }
  });
  return obj;
}

function getRow(tableName, id) {
  return new Promise((resolve, reject) => {
    client.getRow({ tableName, primaryKey: [{ id: String(id) }] }, (err, data) => {
      if (err) return reject(err);
      resolve(decodeRow(data.row));
    });
  });
}

async function main() {
  const result = [];
  for (const target of TARGETS) {
    const [order, court] = await Promise.all([
      getRow('ft_membership_orders', target.orderId).catch(() => null),
      getRow('ft_courts', target.courtId).catch(() => null)
    ]);
    result.push({
      orderId: target.orderId,
      courtId: target.courtId,
      orderAttrCount: order?._rawAttributes?.length || 0,
      orderKeys: order ? Object.keys(order).filter((key) => !key.startsWith('_')).sort() : [],
      order,
      courtAttrCount: court?._rawAttributes?.length || 0,
      courtKeys: court ? Object.keys(court).filter((key) => !key.startsWith('_')).sort() : [],
      court
    });
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
