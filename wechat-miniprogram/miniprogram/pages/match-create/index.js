const { loadMatchProfile, createMatch } = require('../../utils/api');

Page({
  data: {
    submitting: false,
    form: {
      title: '',
      matchType: 'double',
      targetHeadcount: '4',
      ntrpMin: '',
      ntrpMax: '',
      genderPreference: '不限',
      estimatedCourtFee: '',
      venueName: '',
      startTime: '',
      endTime: ''
    }
  },
  onInput(event) {
    const field = event.currentTarget.dataset.field;
    this.setData({ [`form.${field}`]: event.detail.value });
  },
  async submitMatch() {
    if (this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const profile = await loadMatchProfile();
      if (!profile?.user?.phone) throw new Error('请先在个人页授权手机号');
      if (!profile?.user?.canCreateMatch) throw new Error('当前账号没有约球发布权限');
      await createMatch(this.data.form);
      wx.showToast({ title: '发布成功', icon: 'success' });
      wx.navigateBack();
    } catch (error) {
      wx.showToast({ title: error.message || '发布失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
});
