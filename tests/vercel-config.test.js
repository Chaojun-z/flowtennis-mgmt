const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-reminders'),
  'vercel.json should define the daily official account reminder cron'
);

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-daily-digests'),
  'vercel.json should define the nightly official account digest cron'
);

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-reminders' && String(job.schedule || '') === '2,12,22,32,42,52 * * * *'),
  'vercel.json should run official account reminders every 10 minutes with an offset'
);

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-daily-digests' && String(job.schedule || '') === '2 20 * * *'),
  'vercel.json should run official account digests at 20:02'
);

console.log('vercel config tests passed');
