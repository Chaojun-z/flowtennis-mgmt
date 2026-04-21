const { loginWithWechat, loadCoachWorkbench } = require('../../utils/api');
const { findSchedule, formatScheduleItem } = require('../../utils/schedule');

Page({
  data: {
    loading: true,
    error: '',
    scheduleId: '',
    course: null
  },

  onLoad(options) {
    this.setData({ scheduleId: options.scheduleId || '' });
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await loginWithWechat();
      const data = await loadCoachWorkbench();
      const item = findSchedule(data.schedule || [], this.data.scheduleId);
      if (!item) throw new Error('没有找到这节课，可能已取消或不属于当前教练');
      this.setData({ course: formatScheduleItem(item), loading: false });
    } catch (err) {
      this.setData({ loading: false, error: err.message || '课程详情加载失败' });
    }
  },

  backToSchedule() {
    const pages = getCurrentPages();
    if (pages.length > 1) return wx.navigateBack();
    wx.redirectTo({ url: '/pages/schedule/schedule' });
  },

  openWebview() {
    const suffix = this.data.scheduleId ? `?scheduleId=${encodeURIComponent(this.data.scheduleId)}` : '';
    wx.navigateTo({ url: `/pages/webview/webview${suffix}` });
  }
});
