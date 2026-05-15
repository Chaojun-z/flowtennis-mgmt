const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));

assert.ok(
  !Array.isArray(config.crons) || !config.crons.some(job => String(job.schedule || '').includes('*/15')),
  'vercel.json should not define high-frequency cron jobs on the Hobby plan'
);

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-reminders'),
  'vercel.json should define the hourly official account reminder cron'
);

assert.ok(
  Array.isArray(config.crons) && config.crons.some(job => job.path === '/api/cron/official-account-daily-digests'),
  'vercel.json should define the nightly official account digest cron'
);

console.log('vercel config tests passed');
