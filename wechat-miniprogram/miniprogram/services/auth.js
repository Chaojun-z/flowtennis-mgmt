const { request } = require('./request');
const STORAGE_KEY = 'flowtennis_match_session';
let sessionPromise = null;
const DEFAULT_LOGIN_REASON = '继续操作';

function getCurrentUser() {
  const app = getApp();
  return app.globalData.currentUser || null;
}

function hasValidSession() {
  const app = getApp();
  return !!(app.globalData.token && app.globalData.userId);
}

function restoreSession() {
  const app = getApp();
  if (hasValidSession() && app.globalData.currentUser?.id) {
    return app.globalData.currentUser || null;
  }
  const cachedSession = wx.getStorageSync(STORAGE_KEY);
  if (cachedSession && cachedSession.token && cachedSession.user && cachedSession.user.id && Object.prototype.hasOwnProperty.call(cachedSession.user, 'canCreateMatch')) {
    app.globalData.token = cachedSession.token;
    app.globalData.currentUser = cachedSession.user || null;
    app.globalData.userId = cachedSession.user?.id || '';
    return app.globalData.currentUser || null;
  }
  return null;
}

function persistSession(token, user) {
  const app = getApp();
  app.globalData.token = token || '';
  app.globalData.currentUser = user || null;
  app.globalData.userId = user?.id || '';
  wx.setStorageSync(STORAGE_KEY, {
    token: app.globalData.token,
    user: app.globalData.currentUser
  });
}

function getLoginCode() {
  return new Promise((resolve, reject) => {
    wx.login({
      success: resolve,
      fail: reject
    });
  });
}

async function bootstrapSession(force = false) {
  const app = getApp();
  if (!force && hasValidSession()) {
    return app.globalData.currentUser || {};
  }
  if (!force) {
    const restoredUser = restoreSession();
    if (restoredUser) {
      return restoredUser;
    }
  }
  if (!force && sessionPromise) {
    return sessionPromise;
  }
  sessionPromise = (async () => {
    const result = await getLoginCode();
    const response = await request({
      url: '/auth/wechat-mini-login',
      method: 'POST',
      data: { code: result.code },
      skipAuth: true
    });
    persistSession(response.token || '', response.user || null);
    return response.user || {};
  })();
  try {
    return await sessionPromise;
  } finally {
    sessionPromise = null;
  }
}

function clearSession() {
  const app = getApp();
  app.globalData.token = '';
  app.globalData.currentUser = null;
  app.globalData.userId = '';
  wx.removeStorageSync(STORAGE_KEY);
}

function updateSessionUser(patch = {}) {
  const app = getApp();
  const nextUser = {
    ...(app.globalData.currentUser || {}),
    ...(patch || {})
  };
  persistSession(app.globalData.token || '', nextUser);
  return nextUser;
}

function syncSessionUserFromProfile(profile = {}) {
  const payload = profile && typeof profile === 'object' ? profile : {};
  const nextUser = payload.user && typeof payload.user === 'object' ? payload.user : payload;
  if (!nextUser || !nextUser.id) {
    return getCurrentUser();
  }
  return updateSessionUser(nextUser);
}

function normalizeLoginError(error, fallback = '登录失败，请重试') {
  const nextError = error instanceof Error ? error : new Error(fallback);
  nextError.message = nextError.message || fallback;
  if (!nextError.code) {
    nextError.code = 'UNAUTHENTICATED';
  }
  return nextError;
}

function buildLoginPromptText(reason = DEFAULT_LOGIN_REASON) {
  return `请先登录后再${reason}`;
}

function showLoginPrompt(reason = DEFAULT_LOGIN_REASON) {
  return new Promise((resolve) => {
    wx.showModal({
      title: '需要先登录',
      content: buildLoginPromptText(reason),
      confirmText: '去登录',
      cancelText: '稍后再说',
      success: (res) => resolve(!!res.confirm),
      fail: () => resolve(false)
    });
  });
}

async function ensureInteractiveLogin(options = {}) {
  const { reason = DEFAULT_LOGIN_REASON, loadingText = '登录中' } = options;
  if (wx.showLoading) {
    wx.showLoading({
      title: loadingText,
      mask: true
    });
  }
  try {
    const user = await bootstrapSession(true);
    if (!user || !user.id) {
      throw new Error(buildLoginPromptText(reason));
    }
    return user;
  } catch (error) {
    throw normalizeLoginError(error, buildLoginPromptText(reason));
  } finally {
    if (wx.hideLoading) {
      wx.hideLoading();
    }
  }
}

async function requireLogin(options = {}) {
  const { reason = DEFAULT_LOGIN_REASON } = options;
  if (hasValidSession() && getCurrentUser()?.id) {
    return getCurrentUser();
  }
  const confirmed = await showLoginPrompt(reason);
  if (!confirmed) {
    const cancelError = new Error(buildLoginPromptText(reason));
    cancelError.code = 'LOGIN_CANCELLED';
    throw cancelError;
  }
  return ensureInteractiveLogin({ reason });
}

module.exports = {
  bootstrapSession,
  clearSession,
  restoreSession,
  updateSessionUser,
  syncSessionUserFromProfile,
  ensureInteractiveLogin,
  requireLogin,
  STORAGE_KEY
};
