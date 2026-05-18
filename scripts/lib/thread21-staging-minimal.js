const { CHAOJUN_COACH_ID } = require('./coach-master-consistency');

function buildThread21LeadFixtures({ now = new Date().toISOString(), owner = '朝珺', formalCoach = '朝珺' } = {}) {
  const leads = [
    {
      id: 'thread21-lead-001',
      leadDate: '2026-05-10',
      displayName: '体验课线索A',
      phone: '13900000001',
      wechatName: '体验课线索A',
      level: '2.0-2.5',
      profileNote: '成人新客，周中晚间可约，优先体验私教。',
      source: '大众点评',
      consultType: '成人私教',
      intentLevel: '高',
      owner,
      rawStatus: '已约体验',
      systemStatus: '已约体验',
      trialAtRaw: '2026-05-12 19:00',
      enrollAtRaw: '',
      convertedFlag: false,
      formalCoach,
      lostReason: '',
      latestConcern: '担心固定排课时间不稳定',
      latestConclusion: '已约体验课，待到店后继续跟进',
      nextAction: '体验课结束后 24 小时内回访',
      lastFollowupAt: '2026-05-11 10:00',
      nextFollowupAt: '2026-05-12',
      studentId: '',
      courtId: '',
      membershipAccountId: '',
      isCourseConverted: false,
      isCourtConverted: false,
      isMembershipConverted: false,
      closedAt: '',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'thread21-lead-002',
      leadDate: '2026-05-09',
      displayName: '成人跟进线索B',
      phone: '13900000002',
      wechatName: '成人跟进线索B',
      level: '1.5-2.0',
      profileNote: '成人零基础，先咨询训练营，再考虑长期私教。',
      source: '线下到店',
      consultType: '成人训练营',
      intentLevel: '中',
      owner,
      rawStatus: '跟进中',
      systemStatus: '跟进中',
      trialAtRaw: '',
      enrollAtRaw: '',
      convertedFlag: false,
      formalCoach,
      lostReason: '',
      latestConcern: '预算有限，先比较训练营和私教差异',
      latestConclusion: '已发送课程建议，等对方确认开课时间',
      nextAction: '48 小时后微信跟进训练营意向',
      lastFollowupAt: '2026-05-11 11:00',
      nextFollowupAt: '2026-05-13',
      studentId: '',
      courtId: '',
      membershipAccountId: '',
      isCourseConverted: false,
      isCourtConverted: false,
      isMembershipConverted: false,
      closedAt: '',
      createdAt: now,
      updatedAt: now
    }
  ];

  const followups = [
    {
      id: 'thread21-followup-001',
      leadId: 'thread21-lead-001',
      followupAt: '2026-05-11 10:00',
      followupBy: owner,
      followupType: '微信',
      concern: '担心固定排课时间不稳定',
      communicationNote: '已沟通体验课安排，确认周一晚到店体验。',
      statusAfter: '已约体验',
      conclusion: '已约体验课，待到店后继续跟进',
      nextFollowupAt: '2026-05-12',
      nextAction: '体验课结束后 24 小时内回访',
      createdAt: now,
      updatedAt: now
    },
    {
      id: 'thread21-followup-002',
      leadId: 'thread21-lead-002',
      followupAt: '2026-05-11 11:00',
      followupBy: owner,
      followupType: '电话',
      concern: '预算有限，先比较训练营和私教差异',
      communicationNote: '已说明训练营与私教区别，对方表示再看本周排期。',
      statusAfter: '跟进中',
      conclusion: '已发送课程建议，等对方确认开课时间',
      nextFollowupAt: '2026-05-13',
      nextAction: '48 小时后微信跟进训练营意向',
      createdAt: now,
      updatedAt: now
    }
  ];

  return { leads, followups };
}

function buildThread21CoachUser({ adminUser, existingUser = null, now = new Date().toISOString() } = {}) {
  const password = String(existingUser?.password || adminUser?.password || '').trim();
  if (!password) throw new Error('缺少可复用的密码 hash，不能创建教练账号');
  return {
    id: 'chaojun',
    username: 'chaojun',
    name: '朝珺',
    role: 'editor',
    status: 'active',
    password,
    coachId: CHAOJUN_COACH_ID,
    coachName: '朝珺',
    matchPermissions: Array.isArray(existingUser?.matchPermissions) ? existingUser.matchPermissions : [],
    createdAt: existingUser?.createdAt || adminUser?.createdAt || now,
    updatedAt: now
  };
}

module.exports = {
  buildThread21LeadFixtures,
  buildThread21CoachUser
};
