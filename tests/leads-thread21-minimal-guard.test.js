const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { buildThread21LeadFixtures } = require('../scripts/lib/thread21-staging-minimal');

const now = '2026-05-11T12:00:00.000Z';
const { leads, followups } = buildThread21LeadFixtures({ now });
const repairScript = fs.readFileSync(
  path.join(__dirname, '..', 'scripts', 'repair', 'ensure-thread21-staging-minimal.js'),
  'utf8'
);

assert.deepStrictEqual(
  leads.map((item) => item.id),
  ['thread21-lead-001', 'thread21-lead-002'],
  'leads guard should keep the minimal lead ids stable'
);
assert.deepStrictEqual(
  followups.map((item) => item.leadId),
  ['thread21-lead-001', 'thread21-lead-002'],
  'leads guard should keep the followup-to-lead links stable'
);
assert.ok(
  leads.every((item) =>
    item.displayName &&
    item.source &&
    item.consultType &&
    item.owner &&
    item.systemStatus &&
    item.latestConclusion &&
    item.nextAction &&
    item.lastFollowupAt &&
    item.nextFollowupAt
  ),
  'leads list acceptance fields should stay present'
);
assert.ok(
  followups.every((item) =>
    item.followupAt &&
    item.followupBy &&
    item.followupType &&
    item.concern &&
    item.communicationNote &&
    item.statusAfter &&
    item.conclusion &&
    item.nextFollowupAt &&
    item.nextAction
  ),
  'lead detail timeline acceptance fields should stay present'
);
assert.match(
  repairScript,
  /createTableIfMissing\(client, 'ft_leads'\)[\s\S]*createTableIfMissing\(client, 'ft_lead_followups'\)/,
  'minimal staging repair script should still prepare leads and followups tables'
);
assert.match(
  repairScript,
  /for \(const lead of leads\) await putRow\(client, 'ft_leads', lead\);[\s\S]*for \(const followup of followups\) await putRow\(client, 'ft_lead_followups', followup\);/,
  'minimal staging repair script should still upsert both leads and followups fixtures'
);

console.log('leads thread21 minimal guard tests passed');
