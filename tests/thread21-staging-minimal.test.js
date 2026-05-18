const assert = require('assert');
const {
  buildThread21LeadFixtures,
  buildThread21CoachUser
} = require('../scripts/lib/thread21-staging-minimal');

const now = '2026-05-11T12:00:00.000Z';
const { leads, followups } = buildThread21LeadFixtures({ now });

assert.strictEqual(leads.length, 2, 'thread21 should prepare exactly two minimal lead rows');
assert.strictEqual(followups.length, 2, 'thread21 should prepare exactly two minimal followup rows');
assert.deepStrictEqual(
  leads.map((item) => item.id),
  ['thread21-lead-001', 'thread21-lead-002'],
  'lead ids should stay stable for repeatable staging upserts'
);
assert.deepStrictEqual(
  followups.map((item) => item.leadId),
  ['thread21-lead-001', 'thread21-lead-002'],
  'followups should point to the prepared lead ids'
);
assert.ok(
  leads.every((item) => item.displayName && item.source && item.consultType && item.owner && item.systemStatus),
  'minimal lead rows should include the fields needed by the leads page list'
);
assert.ok(
  followups.every((item) => item.followupAt && item.followupBy && item.communicationNote && item.statusAfter),
  'minimal followup rows should include the fields needed by the leads detail timeline'
);

const coachUser = buildThread21CoachUser({
  adminUser: { password: 'hashed-admin-password', createdAt: '2026-05-01T00:00:00.000Z' },
  now
});

assert.deepStrictEqual(
  coachUser,
  {
    id: 'chaojun',
    username: 'chaojun',
    name: '朝珺',
    role: 'editor',
    status: 'active',
    password: 'hashed-admin-password',
    coachId: 'coach-chaojun',
    coachName: '朝珺',
    matchPermissions: [],
    createdAt: '2026-05-01T00:00:00.000Z',
    updatedAt: now
  },
  'thread21 coach user should reuse the admin hash and bind coachName to 朝珺 with a stable coachId'
);

console.log('thread21 staging minimal tests passed');
