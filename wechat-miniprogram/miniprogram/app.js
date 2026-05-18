App({
  globalData: {
    userId: '',
    token: '',
    currentUser: null,
    matchesDirty: true,
    myMatchesDirty: true,
    profileDirty: true,
    notificationsDirty: true,
    matchesCache: null,
    matchesCacheAt: 0,
    myMatchesCache: null,
    myMatchesCacheAt: 0,
    profileCache: null,
    profileMatchesCache: null,
    profileCacheAt: 0,
    notificationsCache: null,
    notificationsCacheAt: 0,
    matchSettingsCache: null,
    matchSettingsCacheAt: 0,
    matchDetailCache: {},
    matchDetailCacheAt: {},
    matchPreviewCache: {},
    matchShareImageCache: {},
    profileStats: {
      matchJoinedCount: 0,
      attendanceRate: '0%'
    },
    privacyAccepted: false,
    matchUser: null,
    matchProfile: null
  },

  openPrivacyContract() {
    return new Promise((resolve, reject) => {
      if (typeof wx.openPrivacyContract !== 'function') {
        this.globalData.privacyAccepted = true;
        resolve();
        return;
      }
      wx.openPrivacyContract({
        success: () => {
          this.globalData.privacyAccepted = true;
          resolve();
        },
        fail: reject
      });
    });
  },

  onNeedPrivacyAuthorization(resolve, eventInfo) {
    const complete = (buttonId) => {
      if (typeof resolve === 'function') {
        resolve({
          event: 'agree',
          buttonId: buttonId || (eventInfo && eventInfo.buttonId) || ''
        });
      }
    };
    wx.showModal({
      title: '隐私保护提示',
      content: '请先阅读并同意《隐私政策》后再继续使用小程序相关能力。',
      confirmText: '查看隐私政策',
      cancelText: '暂不使用',
      success: ({ confirm }) => {
        if (!confirm) return;
        this.openPrivacyContract()
          .then(() => complete((eventInfo && eventInfo.buttonId) || ''))
          .catch(() => {
            wx.showToast({
              title: '打开隐私政策失败',
              icon: 'none'
            });
          });
      }
    });
  }
});
