const { getMatchProfile, listMyMatches, updateMatchProfile, updateMatchPhoneByCode } = require('../../services/match');
const { bootstrapSession, ensureInteractiveLogin, requireLogin, syncSessionUserFromProfile } = require('../../services/auth');
const { parseDateTime } = require('../../utils/match');

const dayMs = 24 * 60 * 60 * 1000;
const calendarDays = 91;
const CACHE_TTL_MS = 5 * 60 * 1000;

function parseMatchDate(item) {
  const raw = String(item.startTime || '').slice(0, 10);
  const date = new Date(raw.replace(/-/g, '/'));
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildCalendar(items) {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const start = new Date(end.getTime() - (calendarDays - 1) * dayMs);
  const counts = {};
  items.forEach((item) => {
    const date = parseMatchDate(item);
    if (!date) return;
    const key = item.startTime.slice(0, 10);
    counts[key] = (counts[key] || 0) + 1;
  });
  return Array.from({ length: 91 }).map((_, index) => {
    const date = new Date(start.getTime() + index * dayMs);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const count = counts[key] || 0;
    return { key, count, level: count > 2 ? 3 : count };
  });
}

function isRealFulfilledAttendance(item) {
  const finalStatus = String(item.viewerFinalAttendanceStatus || item.finalAttendanceStatus || '').trim();
  return finalStatus === 'attended';
}

function enrichMatch(item) {
  const date = parseMatchDate(item);
  const now = Date.now();
  const start = parseDateTime(item.startTime);
  const end = parseDateTime(item.endTime);
  const startMs = start ? start.getTime() : NaN;
  const endMs = end ? end.getTime() : NaN;
  const statusText = String(item.status || '') === 'cancelled'
    ? '已取消'
    : Number.isFinite(endMs) && endMs <= now
      ? '已结束'
      : Number.isFinite(startMs) && startMs > now
        ? '待开始'
        : '进行中';
  return {
    ...item,
    displayDate: date ? `${date.getMonth() + 1}.${date.getDate()}` : '--',
    displayTime: String(item.startTime || '').includes(' ') ? String(item.startTime).split(' ')[1] : '',
    statusText
  };
}

function emptyStats() {
  return {
    matchJoinedCount: 0,
    attendanceRate: '0%',
    matchCreatedCount: 0,
    totalFeeAmount: 0,
    matchCompletedCount: 0
  };
}

function normalizeStats(stats = {}) {
  const joinedCount = Number(stats.matchJoinedCount || stats.joinedCount || 0);
  const createdCount = Number(stats.matchCreatedCount || stats.createdCount || 0);
  const completedCount = Number(stats.matchCompletedCount || stats.completedCount || 0);
  const totalFeeAmount = Number(stats.totalFeeAmount || 0);
  const rawAttendance = stats.attendanceRateText || stats.attendanceRate || '0%';
  const attendanceRate = typeof rawAttendance === 'number' ? `${rawAttendance}%` : String(rawAttendance);
  return {
    ...stats,
    matchJoinedCount: joinedCount,
    matchCreatedCount: createdCount,
    matchCompletedCount: completedCount,
    totalFeeAmount,
    attendanceRate
  };
}

function buildAvatarText(user = {}) {
  const source = String(user.nickName || user.name || user.phone || 'F').trim();
  return source ? source.slice(0, 1).toUpperCase() : 'F';
}

function isPlaceholderNickName(value = '') {
  const text = String(value || '').trim();
  return !text || text === '微信用户';
}

function hasWechatProfile(user = {}) {
  return !isPlaceholderNickName(user.nickName) && !!String(user.avatarUrl || '').trim();
}

function resolveDisplayName(user = {}) {
  const nickName = String(user.nickName || '').trim();
  if (!isPlaceholderNickName(nickName)) {
    return nickName;
  }
  return String(user.name || user.phone || '').trim() || '已登录用户';
}

async function requestWithRelogin(loader) {
  try {
    return await loader();
  } catch (error) {
    if (error.code !== 'UNAUTHENTICATED') throw error;
    try {
      await bootstrapSession(true);
    } catch (loginError) {
      loginError.code = 'UNAUTHENTICATED';
      throw loginError;
    }
    return loader();
  }
}

Page({
  data: {
    currentUser: null,
    loading: false,
    errorText: '',
    loginActionText: '点击登录',
    matches: [],
    calendarDays: [],
    calendarMatchCount: 0,
    ntrpOptions: ['2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0+'],
    stats: {
      matchJoinedCount: 0,
      attendanceRate: '0%',
      matchCreatedCount: 0,
      totalFeeAmount: 0,
      matchCompletedCount: 0
    },
    ntrpText: '未设置',
    attendanceText: '-',
    totalFeeText: '-',
    avatarText: 'F',
    displayName: '未登录用户',
    phoneText: '未绑定',
    createAccessText: '未开通',
    needsProfileCompletion: false,
    profileDraftNickName: '',
    profileDraftAvatarUrl: '',
    profileSaving: false,
    phoneBinding: false
  },
  syncUserView(currentUser) {
    const user = currentUser && currentUser.id ? currentUser : null;
    this.setData({
      currentUser: user,
      avatarText: buildAvatarText(user || {}),
      displayName: user ? resolveDisplayName(user) : '未登录用户',
      phoneText: user?.phone ? user.phone : '未绑定',
      createAccessText: user?.canCreateMatch ? '已开通发布权限' : '未开通',
      needsProfileCompletion: !!(user && !hasWechatProfile(user)),
      profileDraftNickName: user && !isPlaceholderNickName(user.nickName) ? String(user.nickName || '') : '',
      profileDraftAvatarUrl: user && hasWechatProfile(user) ? String(user.avatarUrl || '') : ''
    });
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1,
        canCreateMatch: !!user?.canCreateMatch
      });
    }
  },
  syncProfileCacheUser(nextUser) {
    const app = getApp();
    if (app.globalData.profileCache) {
      app.globalData.profileCache.currentUser = nextUser;
    }
  },
  readAvatarAsDataUrl(filePath = '') {
    return new Promise((resolve, reject) => {
      if (!filePath) {
        reject(new Error('请先选择头像'));
        return;
      }
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (res) => {
          const base64 = String(res.data || '').trim();
          if (!base64) {
            reject(new Error('头像读取失败'));
            return;
          }
          const lowerPath = filePath.toLowerCase();
          const mimeType = lowerPath.endsWith('.png')
            ? 'image/png'
            : lowerPath.endsWith('.webp')
              ? 'image/webp'
              : 'image/jpeg';
          resolve(`data:${mimeType};base64,${base64}`);
        },
        fail: () => reject(new Error('头像读取失败'))
      });
    });
  },
  onChooseAvatar(event) {
    const avatarUrl = String(event.detail?.avatarUrl || '').trim();
    if (!avatarUrl) {
      return;
    }
    this.setData({ profileDraftAvatarUrl: avatarUrl });
  },
  onNicknameInput(event) {
    this.setData({
      profileDraftNickName: String(event.detail?.value || '').trim()
    });
  },
  async saveProfileDraft() {
    const currentUser = this.data.currentUser || {};
    if (!currentUser.id) {
      return this.tapProfileLogin();
    }
    const nickName = String(this.data.profileDraftNickName || '').trim();
    if (isPlaceholderNickName(nickName)) {
      wx.showToast({ title: '请填写昵称', icon: 'none' });
      return;
    }
    if (!this.data.profileDraftAvatarUrl) {
      wx.showToast({ title: '请先选择头像', icon: 'none' });
      return;
    }
    this.setData({ profileSaving: true });
    try {
      const avatarUrl = await this.readAvatarAsDataUrl(this.data.profileDraftAvatarUrl);
      const app = getApp();
      const result = await requestWithRelogin(() => updateMatchProfile(app.globalData.userId, {
        nickName,
        avatarUrl
      }));
      const nextUser = syncSessionUserFromProfile(result);
      this.syncProfileCacheUser(nextUser);
      app.globalData.profileDirty = true;
      this.syncUserView(nextUser);
      wx.showToast({ title: '资料已保存', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ profileSaving: false });
    }
  },
  async onShow() {
    const app = getApp();
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 1,
        canCreateMatch: !!app.globalData.currentUser?.canCreateMatch
      });
    }
    const hasCache = !!(app.globalData.profileCache && app.globalData.profileMatchesCache);
    const freshCache = hasCache && !app.globalData.profileDirty && (Date.now() - (app.globalData.profileCacheAt || 0) < CACHE_TTL_MS);
    if (hasCache) {
      const stats = app.globalData.profileCache.stats || emptyStats();
      const currentUser = app.globalData.profileCache.currentUser?.id ? app.globalData.profileCache.currentUser : null;
      const matches = app.globalData.profileMatchesCache || [];
      const completedCount = Number(stats.matchCompletedCount || 0);
      const fulfilledMatches = matches.filter(isRealFulfilledAttendance);
      this.setData({
        stats,
        matches,
        calendarDays: buildCalendar(fulfilledMatches),
        calendarMatchCount: fulfilledMatches.length,
        ntrpText: currentUser?.ntrpLevel || stats.ntrpLevel || '未设置',
        attendanceText: completedCount > 0 ? stats.attendanceRate : '-',
        totalFeeText: Number(stats.totalFeeAmount || 0) > 0 ? `¥${stats.totalFeeAmount}` : '-',
        loading: false,
        errorText: ''
      });
      this.syncUserView(currentUser);
    }
    if (freshCache) {
      return;
    }
    this.setData({ loading: !hasCache, errorText: '' });
    try {
      const currentUser = app.globalData.currentUser?.id ? app.globalData.currentUser : null;
      if (!currentUser?.id) {
        const loginError = new Error('请先登录后查看我的数据');
        loginError.code = 'UNAUTHENTICATED';
        throw loginError;
      }
      const statsPromise = requestWithRelogin(() => getMatchProfile(app.globalData.userId))
        .then((value) => ({ ok: true, value }))
        .catch((error) => ({ ok: false, error }));
      const myMatchesPromise = requestWithRelogin(() => listMyMatches(app.globalData.userId))
        .then((value) => ({ ok: true, value }))
        .catch((error) => ({ ok: false, error }));
      const [statsOutcome, myMatchesOutcome] = await Promise['all']([statsPromise, myMatchesPromise]);
      if (!statsOutcome.ok && statsOutcome.error && statsOutcome.error.code === 'UNAUTHENTICATED') {
        throw statsOutcome.error;
      }
      if (!myMatchesOutcome.ok && myMatchesOutcome.error && myMatchesOutcome.error.code === 'UNAUTHENTICATED') {
        throw myMatchesOutcome.error;
      }
      const stats = statsOutcome.ok ? normalizeStats(statsOutcome.value) : emptyStats();
      const nextUser = statsOutcome.ok ? syncSessionUserFromProfile(statsOutcome.value) : currentUser;
      const myMatches = myMatchesOutcome.ok ? myMatchesOutcome.value : { items: [] };
      const matches = (myMatches.items || [])
        .filter((item) => item.viewerIsCreator || ['registered', 'attended', 'absent'].includes(item.viewerRegistrationStatus))
        .sort((a, b) => new Date(String(b.startTime || '').replace(/-/g, '/')).getTime() - new Date(String(a.startTime || '').replace(/-/g, '/')).getTime())
        .map(enrichMatch);
      const fulfilledMatches = matches.filter(isRealFulfilledAttendance);
      app.globalData.profileStats = stats;
      app.globalData.profileCache = { stats, currentUser: nextUser };
      app.globalData.profileMatchesCache = matches;
      app.globalData.profileCacheAt = Date.now();
      app.globalData.profileDirty = false;
      const completedCount = Number(stats.matchCompletedCount || 0);
      this.setData({
        stats,
        matches,
        calendarDays: buildCalendar(fulfilledMatches),
        calendarMatchCount: fulfilledMatches.length,
        ntrpText: nextUser?.ntrpLevel || stats.ntrpLevel || '未设置',
        attendanceText: completedCount > 0 ? stats.attendanceRate : '-',
        totalFeeText: Number(stats.totalFeeAmount || 0) > 0 ? `¥${stats.totalFeeAmount}` : '-',
        loading: false,
        errorText: '',
        loginActionText: ''
      });
      this.syncUserView(nextUser);
    } catch (error) {
      const stats = emptyStats();
      const isLoginError = error.code === 'UNAUTHENTICATED';
      this.setData({
        stats,
        currentUser: null,
        displayName: '未登录用户',
        matches: [],
        calendarDays: buildCalendar([]),
        calendarMatchCount: 0,
        ntrpText: '未设置',
        attendanceText: '-',
        totalFeeText: '-',
        loading: false,
        errorText: isLoginError ? '请先登录后查看我的数据' : (error.message || '服务连接失败，请稍后重试'),
        loginActionText: isLoginError ? '点击登录' : '重新登录',
        avatarText: 'F'
      });
    }
  },
  async tapProfileLogin() {
    if (this.data.currentUser?.id && !this.data.errorText) {
      if (hasWechatProfile(this.data.currentUser)) {
        return this.openMyMatches();
      }
      return;
    }
    try {
      await ensureInteractiveLogin({ reason: '查看我的数据' });
      await this.onShow();
    } catch (error) {
      wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
    }
  },
  retryLogin() {
    return this.tapProfileLogin();
  },
  async bindPhone(event) {
    const code = event?.detail?.code || '';
    if (!code) {
      wx.showToast({ title: '未获取到手机号授权', icon: 'none' });
      return;
    }
    try {
      this.setData({ phoneBinding: true });
      await requireLogin({ reason: '绑定手机号' });
      const profile = await requestWithRelogin(() => updateMatchPhoneByCode(code));
      const nextUser = syncSessionUserFromProfile(profile);
      const app = getApp();
      this.syncUserView(nextUser);
      this.syncProfileCacheUser(nextUser);
      app.globalData.profileDirty = true;
      app.globalData.matchesDirty = true;
      await this.onShow();
      wx.showToast({ title: '手机号已绑定', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '手机号授权失败', icon: 'none' });
    } finally {
      this.setData({ phoneBinding: false });
    }
  },
  async openMyMatches() {
    try {
      await requireLogin({ reason: '查看我的约球' });
    } catch (error) {
      if (error.code !== 'LOGIN_CANCELLED') {
        wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
      }
      return;
    }
    wx.navigateTo({ url: '/pages/my-matches/index' });
  },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/match-detail/index?id=${event.currentTarget.dataset.id}` });
  },
  async saveNtrpLevel(event) {
    const value = this.data.ntrpOptions[Number(event.detail.value)];
    if (!value) return;
    try {
      await requireLogin({ reason: '设置你的水平' });
      const app = getApp();
      const result = await requestWithRelogin(() => updateMatchProfile(app.globalData.userId, { ntrpLevel: value }));
      const nextUser = syncSessionUserFromProfile(result);
      this.setData({
        ntrpText: nextUser?.ntrpLevel || value
      });
      this.syncUserView(nextUser);
      this.syncProfileCacheUser(nextUser);
      app.globalData.profileDirty = true;
      wx.showToast({ title: 'NTRP 已保存', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '保存失败', icon: 'none' });
    }
  }
});
