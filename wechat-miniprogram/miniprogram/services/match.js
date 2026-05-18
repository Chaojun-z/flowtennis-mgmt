const { request } = require('./request');

function listMatches(params = {}) {
  return request({ url: '/matches', method: 'GET', data: params });
}

function getMatchDetail(matchId) {
  return request({ url: `/matches/${matchId}`, method: 'GET' });
}

function createMatch(payload) {
  return request({ url: '/matches', method: 'POST', data: payload });
}

function updateMatch(matchId, payload) {
  return request({ url: `/matches/${matchId}`, method: 'PUT', data: payload });
}

function registerMatch(matchId, userId) {
  return request({ url: `/matches/${matchId}/register`, method: 'POST', data: { userId } });
}

function cancelMatchRegistration(matchId, userId) {
  return request({ url: `/matches/${matchId}/cancel-registration`, method: 'POST', data: { userId } });
}

function creatorConfirmAttendance(matchId, registrationId, creatorUserId, finalAttendanceStatus) {
  return request({
    url: '/match-attendance/creator-confirm',
    method: 'POST',
    data: { matchId, registrationId, creatorUserId, finalAttendanceStatus }
  });
}

function listMyMatches(userId) {
  return request({ url: '/my-matches', method: 'GET', data: { userId } });
}

function listNotifications(userId) {
  return request({ url: '/match-notifications', method: 'GET', data: { userId } });
}

function getMatchProfile(userId) {
  return request({ url: '/match-profile', method: 'GET', data: { userId } });
}
function getMatchSettings() {
  return request({ url: '/match-settings', method: 'GET' });
}

function updateMatchProfile(userId, payload) {
  return request({ url: '/match-profile', method: 'POST', data: { userId, ...payload } });
}

function updateMatchPhoneByCode(code) {
  return request({ url: '/match-profile/phone-code', method: 'POST', data: { code } });
}

function listMatchPlayers(params = {}) {
  return request({ url: '/match-players', method: 'GET', data: params });
}

module.exports = {
  listMatches,
  getMatchDetail,
  createMatch,
  updateMatch,
  registerMatch,
  cancelMatchRegistration,
  creatorConfirmAttendance,
  listMyMatches,
  listNotifications,
  getMatchProfile,
  getMatchSettings,
  updateMatchProfile,
  updateMatchPhoneByCode,
  listMatchPlayers
};
