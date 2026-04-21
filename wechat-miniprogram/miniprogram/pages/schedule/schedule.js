const { loginWithWechat, loadCoachWorkbench } = require('../../utils/api');
const { buildWeekDays } = require('../../utils/schedule');

Page({
  data: {
    loading: true,
    error: '',
    weekOffset: 0,
    weekTitle: '本周',
    days: [],
    schedule: []
  },

  onLoad() {
    this.load();
  },

  async load() {
    this.setData({ loading: true, error: '' });
    try {
      await loginWithWechat();
      const data = await loadCoachWorkbench();
      this.setData({ schedule: data.schedule || [], loading: false });
      this.renderWeek();
    } catch (err) {
      this.setData({ loading: false, error: err.message || '请先进入完整教练端登录并绑定微信' });
    }
  },

  renderWeek() {
    const { weekOffset, schedule } = this.data;
    this.setData({
      weekTitle: weekOffset === 0 ? '本周' : (weekOffset > 0 ? `后 ${weekOffset} 周` : `前 ${Math.abs(weekOffset)} 周`),
      days: buildWeekDays(schedule, weekOffset)
    });
  },

  prevWeek() {
    this.setData({ weekOffset: this.data.weekOffset - 1 }, () => this.renderWeek());
  },

  nextWeek() {
    this.setData({ weekOffset: this.data.weekOffset + 1 }, () => this.renderWeek());
  },

  goCurrentWeek() {
    this.setData({ weekOffset: 0 }, () => this.renderWeek());
  },

  openDetail(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/detail/detail?scheduleId=${encodeURIComponent(id)}` });
  },

  openWebview() {
    wx.navigateTo({ url: '/pages/webview/webview' });
  }
});
