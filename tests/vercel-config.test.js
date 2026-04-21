const assert = require('assert');
const fs = require('fs');
const path = require('path');

const config = JSON.parse(fs.readFileSync(path.join(__dirname, '../vercel.json'), 'utf8'));

assert.ok(
  !Array.isArray(config.crons) || !config.crons.some(job => String(job.schedule || '').includes('*/15')),
  'vercel.json should not define high-frequency cron jobs on the Hobby plan'
);

console.log('vercel config tests passed');
