const path = require('path');
const TableStore = require('tablestore');
const { loadRuntimeEnv } = require('../lib/runtime-env');

loadRuntimeEnv({ entry: 'inspect-mabao-membership-related' });

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
    name: '唐果',
    orderId: 'daf10fa1-da77-4c7f-8686-53bcadff5e1d',
    accountId: '5c330c64-4fcc-44a7-ae46-76e86eabd7f1',
    courtId: 'eed2716c-c642-49ac-b00d-96e8b7c4e549',
    ledgerIds: ['55af6068-89f1-4786-8d2f-e920d53427f9'],
    benefitIds: []
  },
  {
    name: '张满满（张颖）',
    orderId: '40bda10f-86fd-4b7c-99b6-7703946fe58c',
    accountId: 'ea6b1afe-51bd-45e0-9d16-18ff7699642d',
    courtId: '29c46280-0a29-4f11-bf52-b4fa9d3568e9',
    ledgerIds: ['3f3d9508-7fab-4508-be3d-d024211f3d2a'],
    benefitIds: [
      '849e2245-7b06-4d6d-8f99-60234993142c',
      '897933eb-9191-4e1b-8000-814b2ec07cd7',
      '9b608868-655b-4b37-86c2-84ced9d8c422',
      'ad415806-62cd-417d-a922-33fc2881143f'
    ]
  },
  {
    name: '胡之超',
    orderId: '68b8f708-437d-4073-bbeb-204e17060634',
    accountId: '7c1eb850-57e9-4612-b169-614e9ec76458',
    courtId: 'c840ae23-51e4-48f2-a9ef-5b7486f6a185',
    ledgerIds: [],
    benefitIds: [
      '3c936995-f81b-40fe-969e-a8ddb2bc171d',
      '6d11bbb1-b434-49d3-be03-058fb1288421',
      'cfe0f586-487b-4740-ab06-a77391a9ccdf',
      'e8ad9ebc-72f7-4b1a-88e8-a9a44dba003c'
    ]
  }
];

function decodeRow(row) {
  if (!row || !row.primaryKey || !row.primaryKey[0]) return null;
  const obj = { id: row.primaryKey[0].value };
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
    const account = await getRow('ft_membership_accounts', target.accountId).catch(() => null);
    const ledgers = [];
    for (const id of target.ledgerIds) {
      ledgers.push(await getRow('ft_financial_ledger', id).catch(() => null));
    }
    const benefits = [];
    for (const id of target.benefitIds) {
      benefits.push(await getRow('ft_membership_benefit_ledger', id).catch(() => null));
    }
    result.push({
      name: target.name,
      account,
      ledgers,
      benefits
    });
  }
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
