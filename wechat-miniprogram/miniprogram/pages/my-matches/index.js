const { listMyMatches } = require('../../services/match');
const { bootstrapSession, requireLogin } = require('../../services/auth');
const CACHE_TTL_MS = 5 * 60 * 1000;

Page({
  data: {
    items: [],
    loading: false,
    errorText: ''
  },
  async onShow() {
    const app = getApp();
    const hasCache = !!app.globalData.myMatchesCache;
    const freshCache = hasCache && !app.globalData.myMatchesDirty && (Date.now() - (app.globalData.myMatchesCacheAt || 0) < CACHE_TTL_MS);
    if (hasCache) {
      this.setData({ items: app.globalData.myMatchesCache.items || [], loading: false, errorText: '' });
    }
    if (freshCache) {
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
      await requireLogin({ reason: '查看我的约球' });
      const app = getApp();
      const result = await listMyMatches(app.globalData.userId);
      app.globalData.myMatchesCache = result || { items: [] };
      app.globalData.myMatchesCacheAt = Date.now();
      app.globalData.myMatchesDirty = false;
      this.setData({ items: result.items || [], loading: false });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') {
        this.setData({
          loading: false,
          errorText: '请先登录后查看我的约球'
        });
        return;
      }
      this.setData({
        loading: false,
        errorText: error.code === 'UNAUTHENTICATED' ? '请先登录后查看我的约球' : (error.message || '加载失败')
      });
    }
  },
  openDetail(event) {
    wx.navigateTo({ url: `/pages/match-detail/index?id=${event.currentTarget.dataset.id}` });
  }
});
