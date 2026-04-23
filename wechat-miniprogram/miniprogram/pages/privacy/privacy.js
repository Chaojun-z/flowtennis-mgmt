Page({
  openWechatPrivacy() {
    const app = getApp();
    if (!app || typeof app.openPrivacyContract !== 'function') {
      wx.showToast({ title: '当前版本不支持', icon: 'none' });
      return;
    }
    app.openPrivacyContract().catch(() => {
      wx.showToast({ title: '打开失败', icon: 'none' });
    });
  }
});
