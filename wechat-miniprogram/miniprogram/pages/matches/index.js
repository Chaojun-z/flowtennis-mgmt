const { listMatches, registerMatch, updateMatchPhoneByCode } = require('../../services/match');
const { bootstrapSession, ensureInteractiveLogin, requireLogin, syncSessionUserFromProfile } = require('../../services/auth');
const { parseDateTime, formatMatchType, formatTimeRange, formatDateLine, formatMonthDayParts, formatAaText, formatNtrpRange } = require('../../utils/match');
const CACHE_TTL_MS = 5 * 60 * 1000;

function formatGender(value) {
  const raw = String(value || '不限').trim();
  if (raw === '男') return '男生';
  if (raw === '女') return '女生';
  return '不限';
}

function formatVenueDisplay(item) {
  const address = String(item.venueAddress || '');
  const name = String(item.venueName || '待定场地');
  const cityMatch = address.match(/(北京市|上海市|天津市|重庆市|[^省]+省)/);
  const districtMatch = address.match(/([\u4e00-\u9fa5]+区|[\u4e00-\u9fa5]+县|[\u4e00-\u9fa5]+市)/g);
  const city = cityMatch ? cityMatch[1] : '';
  const rawDistrict = districtMatch && districtMatch.length ? districtMatch[districtMatch.length - 1] : '';
  const district = city && rawDistrict.startsWith(city) ? rawDistrict.slice(city.length) : rawDistrict;
  return [city, district, name].filter(Boolean).join(' · ') || name;
}

function buildPublishAccessText(user) {
  if (!user || !user.id || user.canCreateMatch) return '';
  return '当前账号可报名，但不能发布。只有微信登录手机号能对应到后台同手机号账号，且后台开通约球发布权限或管理员权限后，才可以发布约球。';
}

function enrichMatch(item, options = {}) {
  const startDate = parseDateTime(item.startTime);
  const endDate = parseDateTime(item.endTime);
  const current = Number(item.currentHeadcount || 0);
  const target = Number(item.targetHeadcount || 0);
  const estimatedCourtFee = Number(item.estimatedCourtFee || 0);
  const now = Date.now();
  const hasStarted = !!startDate && startDate.getTime() <= now;
  const hasEnded = !!endDate && endDate.getTime() <= now;
  const isFull = target > 0 && current >= target;
  const isJoined = Boolean(options.isJoined);
  const statusText = hasEnded
    ? '已结束'
    : hasStarted
      ? '进行中'
      : isJoined
        ? (target > 0 ? `${current}/${target} 已报` : `${current}人 已报`)
        : (isFull ? `${current}/${target} 已满` : `${current}/${target} 可报`);
  const monthDay = formatMonthDayParts(item.startTime);
  return {
    ...item,
    displayMonth: monthDay.monthText,
    displayDay: monthDay.dayText,
    displayDow: monthDay.dowText,
    displayTimeRange: formatTimeRange(item.startTime, item.endTime),
    dateTimeLine: formatDateLine(item.startTime, item.endTime),
    venueDisplay: formatVenueDisplay(item),
    ntrpText: item.ntrpRangeText || formatNtrpRange(item.ntrpMin, item.ntrpMax),
    genderText: formatGender(item.genderPreference),
    matchTypeText: formatMatchType(item.matchType),
    openSpots: Math.max(target - current, 0),
    isFull,
    hasStarted,
    hasEnded,
    isJoined,
    statusText,
    nextTimeText: formatDateLine(item.startTime, item.endTime),
    nextStatusText: isJoined ? '已报名' : statusText,
    headcountText: target > 0 ? `${current}/${target}人` : `${current}人`,
    targetHeadcountText: target > 0 ? `${target}人` : '人数待定',
    feeText: estimatedCourtFee > 0 ? `¥${estimatedCourtFee}` : '待定',
    aaFeeText: item.aaDisplayText || formatAaText({
      estimatedCourtFee,
      finalCourtFee: item.finalCourtFee,
      activeCount: current,
      targetHeadcount: target
    })
  };
}

function isUpcoming(item) {
  const start = parseDateTime(item.startTime);
  const status = String(item.status || '');
  if (!start) return false;
  return start.getTime() >= Date.now() && !['closed', 'cancelled', 'settled'].includes(status);
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

async function bindPhoneWithRetry(code) {
  if (!code) return;
  return requestWithRelogin(() => updateMatchPhoneByCode(code));
}

Page({
  data: {
    items: [],
    filteredItems: [],
    upcomingItems: [],
    filters: ['全部', '今天', '单打', '双打'],
    activeFilter: '全部',
    currentUser: null,
    publishAccessText: '',
    viewerHasPhone: false,
    loading: false,
    errorText: '',
    loginActionText: ''
  },
  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0,
        canCreateMatch: !!getApp().globalData.currentUser?.canCreateMatch
      });
    }
    const app = getApp();
    const hasCache = !!app.globalData.matchesCache;
    const freshCache = hasCache && !app.globalData.matchesDirty && (Date.now() - (app.globalData.matchesCacheAt || 0) < CACHE_TTL_MS);
    if (hasCache) {
      this.setData({
        items: app.globalData.matchesCache.items || [],
        upcomingItems: app.globalData.matchesCache.upcomingItems || [],
        filteredItems: filterMatches(app.globalData.matchesCache.items || [], this.data.activeFilter),
        currentUser: app.globalData.currentUser?.id ? app.globalData.currentUser : null,
        publishAccessText: buildPublishAccessText(app.globalData.currentUser),
        viewerHasPhone: !!app.globalData.currentUser?.phone,
        loading: false,
        errorText: '',
        loginActionText: ''
      });
    }
    if (freshCache) {
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({
          selected: 0,
          canCreateMatch: !!app.globalData.currentUser?.canCreateMatch
        });
      }
      return;
    }
    await this.loadData({ silent: hasCache });
  },
  async loadData({ silent = false } = {}) {
    if (!silent) {
      this.setData({ loading: true, errorText: '' });
    } else {
      this.setData({ errorText: '' });
    }
    try {
      const currentUser = getApp().globalData.currentUser?.id ? getApp().globalData.currentUser : null;
      const app = getApp();
      if (typeof this.getTabBar === 'function' && this.getTabBar()) {
        this.getTabBar().setData({
          selected: 0,
          canCreateMatch: !!currentUser?.canCreateMatch
        });
      }
      this.setData({
        currentUser,
        publishAccessText: buildPublishAccessText(currentUser),
        viewerHasPhone: !!currentUser?.phone,
        loginActionText: currentUser?.id ? '' : '点击登录'
      });
      const result = await requestWithRelogin(() => listMatches());
      const items = (result.items || []).map(item => enrichMatch(item, {
        isJoined: item.viewerJoined
      }))
        .sort((a, b) => (parseDateTime(a.startTime)?.getTime() || 0) - (parseDateTime(b.startTime)?.getTime() || 0));
      const upcomingItems = items
        .filter(item => item.isJoined)
        .filter(isUpcoming)
        .sort((a, b) => (parseDateTime(a.startTime)?.getTime() || 0) - (parseDateTime(b.startTime)?.getTime() || 0));
      app.globalData.matchesCache = { items, upcomingItems };
      app.globalData.matchesCacheAt = Date.now();
      app.globalData.matchesDirty = false;
      this.setData({ items, upcomingItems, filteredItems: filterMatches(items, this.data.activeFilter), loading: false, errorText: '', loginActionText: '' });
    } catch (error) {
      const isLoginError = error.code === 'UNAUTHENTICATED';
      this.setData({
        currentUser: null,
        publishAccessText: '',
        loading: false,
        loginActionText: isLoginError ? '点击登录' : '',
        errorText: isLoginError ? '' : (error.message || '服务连接失败，请稍后重试')
      });
    }
  },
  async handleErrorAction() {
    if (this.data.loginActionText) {
      try {
        await ensureInteractiveLogin({ reason: '查看约球列表' });
        const app = getApp();
        app.globalData.matchesDirty = true;
        await this.loadData();
      } catch (error) {
        if (error.code !== 'LOGIN_CANCELLED') {
          wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
        }
      }
      return;
    }
    return this.loadData();
  },
  openDetail(event) {
    const matchId = event.currentTarget.dataset.id;
    const item = this.data.items.find((row) => row.id === matchId);
    if (item) {
      const app = getApp();
      app.globalData.matchPreviewCache[matchId] = {
        result: {
          match: item,
          previewOnly: true,
          viewerJoined: !!item.viewerJoined,
          viewerRegistrationStatus: item.viewerJoined ? 'registered' : ''
        },
        settings: app.globalData.matchSettingsCache || {}
      };
    }
    wx.navigateTo({ url: `/pages/match-detail/index?id=${matchId}` });
  },
  async registerFromCard(event) {
    const matchId = event.currentTarget.dataset.id;
    const item = this.data.items.find((row) => row.id === matchId);
    if (!item || item.isJoined || item.isFull || item.hasStarted || item.hasEnded) return;
    try {
      const app = getApp();
      await requireLogin({ reason: '报名约球' });
      if (event.detail && event.detail.code) {
        const profile = await bindPhoneWithRetry(event.detail.code);
        const nextUser = syncSessionUserFromProfile(profile);
        this.setData({
          currentUser: nextUser,
          viewerHasPhone: !!nextUser?.phone,
          publishAccessText: buildPublishAccessText(nextUser)
        });
        if (typeof this.getTabBar === 'function' && this.getTabBar()) {
          this.getTabBar().setData({
            selected: 0,
            canCreateMatch: !!nextUser?.canCreateMatch
          });
        }
      }
      const result = await requestWithRelogin(() => registerMatch(matchId, app.globalData.userId));
      app.globalData.matchesDirty = true;
      app.globalData.myMatchesDirty = true;
      app.globalData.profileDirty = true;
      app.globalData.notificationsDirty = true;
      await this.loadData();
      if (result && result.formationNotice) {
        wx.showModal({
          title: '本局已成团',
          content: result.formationNotice,
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      wx.showToast({ title: '报名成功', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '报名失败', icon: 'none' });
    }
  },
  openVenue(event) {
    const item = this.data.items.find(row => row.id === event.currentTarget.dataset.id);
    const latitude = Number(item && item.venueLatitude);
    const longitude = Number(item && item.venueLongitude);
    if (!latitude || !longitude) {
      wx.showToast({ title: '暂未设置场地位置', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude,
      longitude,
      name: item.venueName || '约球场地',
      address: item.venueAddress || item.venueName || ''
    });
  },
  setFilter(event) {
    const activeFilter = event.currentTarget.dataset.filter;
    this.setData({
      activeFilter,
      filteredItems: filterMatches(this.data.items, activeFilter)
    });
  },
  openCreate() {
    requireLogin({ reason: '发起约球' })
      .then(() => {
        wx.navigateTo({ url: '/pages/match-create/index' });
      })
      .catch((error) => {
        if (error.code !== 'LOGIN_CANCELLED') {
          wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
        }
      });
  },
  openNotifications() {
    requireLogin({ reason: '查看通知' })
      .then(() => {
        wx.navigateTo({ url: '/pages/notifications/index' });
      })
      .catch((error) => {
        if (error.code !== 'LOGIN_CANCELLED') {
          wx.showToast({ title: error.message || '登录失败，请重试', icon: 'none' });
        }
      });
  },
  noop() {
  }
});

function filterMatches(items, filter) {
  if (filter === '单打') return items.filter(item => formatMatchType(item.matchType) === '单打');
  if (filter === '双打') return items.filter(item => formatMatchType(item.matchType) === '双打');
  if (filter === '今天') {
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return items.filter(item => String(item.startTime || '').startsWith(today));
  }
  return items;
}
