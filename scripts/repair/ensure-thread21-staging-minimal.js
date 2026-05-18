const path = require('path');
const { loadRuntimeEnv } = require('../lib/runtime-env');
const { createClientFromEnv, scanTable, putRow, createTableIfMissing } = require('../lib/staging-data-store');
const { buildThread21LeadFixtures, buildThread21CoachUser } = require('../lib/thread21-staging-minimal');
const { CHAOJUN_COACH_ID, buildChaojunCoachRow } = require('../lib/coach-master-consistency');

async function main() {
  loadRuntimeEnv({
    appEnv: 'staging',
    rootDir: path.join(__dirname, '..', '..'),
    entry: 'ensure-thread21-staging-minimal'
  });

  const client = createClientFromEnv(process.env);
  const now = new Date().toISOString();

  await Promise.all([
    createTableIfMissing(client, 'ft_users'),
    createTableIfMissing(client, 'ft_coaches'),
    createTableIfMissing(client, 'ft_leads'),
    createTableIfMissing(client, 'ft_lead_followups')
  ]);

  const [users, coaches] = await Promise.all([
    scanTable(client, 'ft_users'),
    scanTable(client, 'ft_coaches')
  ]);
  const adminUser = users.find((item) => String(item.id || '') === 'admin');
  if (!adminUser) throw new Error('staging 缺少 admin 账号，无法复用密码 hash');

  const existingCoachUser = users.find((item) => String(item.id || '') === 'chaojun');
  const existingCoach = coaches.find((item) => String(item.id || '') === CHAOJUN_COACH_ID);
  const coachUser = buildThread21CoachUser({ adminUser, existingUser: existingCoachUser, now });
  const coachRow = { ...buildChaojunCoachRow(now), ...(existingCoach || {}), id: CHAOJUN_COACH_ID, name: '朝珺', status: existingCoach?.status || 'active', updatedAt: now };
  const { leads, followups } = buildThread21LeadFixtures({ now });

  await putRow(client, 'ft_coaches', coachRow);
  await putRow(client, 'ft_users', coachUser);
  for (const lead of leads) await putRow(client, 'ft_leads', lead);
  for (const followup of followups) await putRow(client, 'ft_lead_followups', followup);

  const [nextUsers, nextCoaches, nextLeads, nextFollowups] = await Promise.all([
    scanTable(client, 'ft_users'),
    scanTable(client, 'ft_coaches'),
    scanTable(client, 'ft_leads'),
    scanTable(client, 'ft_lead_followups')
  ]);

  const writtenCoachUser = nextUsers.find((item) => String(item.id || '') === 'chaojun');
  const writtenCoach = nextCoaches.find((item) => String(item.id || '') === CHAOJUN_COACH_ID);
  const writtenLeadIds = leads
    .map((lead) => lead.id)
    .filter((id) => nextLeads.some((item) => String(item.id || '') === id));
  const writtenFollowupIds = followups
    .map((item) => item.id)
    .filter((id) => nextFollowups.some((row) => String(row.id || '') === id));

  console.log(
    JSON.stringify(
      {
        targetInstance: process.env.TS_INSTANCE,
        coachMaster: writtenCoach
          ? {
              id: writtenCoach.id,
              name: writtenCoach.name || '',
              status: writtenCoach.status || '',
              campus: writtenCoach.campus || ''
            }
          : null,
        coachUser: writtenCoachUser
          ? {
              id: writtenCoachUser.id,
              username: writtenCoachUser.username || '',
              role: writtenCoachUser.role,
              status: writtenCoachUser.status || '',
              coachId: writtenCoachUser.coachId || '',
              coachName: writtenCoachUser.coachName || '',
              hasPasswordHash: Boolean(String(writtenCoachUser.password || '').trim())
            }
          : null,
        leadCount: nextLeads.length,
        followupCount: nextFollowups.length,
        writtenLeadIds,
        writtenFollowupIds
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err && err.stack ? err.stack : String(err));
  process.exit(1);
});
