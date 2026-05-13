const { loadMatchProfile, bindMatchPhoneByCode, MATCH_USER_KEY } = require('../../utils/api');

function readStoredUser() {
  return wx.getStorageSync(MATCH_USER_KEY) || {};
}

function syncProfileToApp(profile) {
  const app = getApp();
  if (app && app.globalData) {
    app.globalData.matchProfile = profile || null;
    app.globalData.matchUser = (profile && profile.user) || null;
  }
}

Page({
  data: {
    loading: false,
    bindingPhone: false,
    profile: null,
    user: readStoredUser()
  },
  onShow() {
    this.loadProfile();
  },
  async loadProfile() {
    this.setData({ loading: true });
    try {
      const profile = await loadMatchProfile();
      syncProfileToApp(profile);
      this.setData({
        profile,
        user: (profile && profile.user) || {}
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    } finally {
      this.setData({ loading: false });
    }
  },
  async onGetPhoneNumber(event) {
    const code = event?.detail?.code || '';
    if (!code) {
      wx.showToast({ title: '未获取到手机号授权', icon: 'none' });
      return;
    }
    if (this.data.bindingPhone) return;
    this.setData({ bindingPhone: true });
    try {
      const profile = await bindMatchPhoneByCode(code);
      syncProfileToApp(profile);
      this.setData({
        profile,
        user: (profile && profile.user) || {}
      });
      await this.loadProfile();
      wx.showToast({ title: '手机号绑定成功', icon: 'success' });
    } catch (error) {
      wx.showToast({ title: error.message || '绑定失败', icon: 'none' });
    } finally {
      this.setData({ bindingPhone: false });
    }
  },
  goCreateMatch() {
    if (!this.data.user?.canCreateMatch) {
      wx.showToast({ title: '当前账号没有约球发布权限', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/match-create/index' });
  }
});
