const { ACTIVE_ENV, API_BASE_URL, WECHAT_ENV_VERSION } = require('../config');

function request({ url, method = 'GET', data, skipAuth = false }) {
  const app = getApp();
  const header = {
    'X-FlowTennis-Client': 'mini-match',
    'X-FlowTennis-Client-Env': ACTIVE_ENV
  };
  if (WECHAT_ENV_VERSION) {
    header['X-FlowTennis-Wechat-Env-Version'] = WECHAT_ENV_VERSION;
  }
  if (app.globalData.token && !skipAuth) {
    header.Authorization = `Bearer ${app.globalData.token}`;
  }
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${url}`,
      method,
      data,
      header,
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
          return;
        }
        if (res.statusCode === 401) {
          app.globalData.token = '';
          app.globalData.currentUser = null;
          app.globalData.userId = '';
          wx.removeStorageSync('flowtennis_match_session');
          const error = new Error(res.data?.error || '登录状态已过期');
          error.code = 'UNAUTHENTICATED';
          reject(error);
          return;
        }
        reject(new Error(res.data?.error || '请求失败'));
      },
      fail: reject
    });
  });
}

module.exports = { request };
