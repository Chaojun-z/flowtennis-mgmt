const { SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID } = require('../../config');

function enterCoachPortal() {
  wx.navigateTo({ url: '/pages/schedule/schedule' });
}

Page({
  data: {
    account: '',
    password: '',
    passwordVisible: false
  },
  onAccountInput(event) {
    this.setData({ account: event.detail.value });
  },
  onPasswordInput(event) {
    this.setData({ password: event.detail.value });
  },
  togglePasswordVisible() {
    this.setData({ passwordVisible: !this.data.passwordVisible });
  },
  requestScheduleNotice() {
    wx.requestSubscribeMessage({
      tmplIds: [SCHEDULE_TEMPLATE_ID, COURSE_REMINDER_TEMPLATE_ID],
      complete: enterCoachPortal
    });
  },
  enterWithoutNotice() {
    enterCoachPortal();
  }
});
