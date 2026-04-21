const { API_BASE_URL } = require('../config');

const TOKEN_KEY = 'ft_mini_token';
const USER_KEY = 'ft_mini_user';

function request(path, options = {}) {
  const token = wx.getStorageSync(TOKEN_KEY);
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${API_BASE_URL}${path}`,
      method: options.method || 'GET',
      data: options.data,
      header: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {})
      },
      success(res) {
        const data = res.data || {};
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve(data);
        reject(new Error(data.error || '请求失败'));
      },
      fail(err) {
        reject(new Error(err.errMsg || '网络请求失败'));
      }
    });
  });
}

function loginWithWechat() {
  return new Promise((resolve, reject) => {
    wx.login({
      success(res) {
        if (!res.code) return reject(new Error('微信登录失败'));
        request('/auth/wechat-login', { method: 'POST', data: { code: res.code } })
          .then((data) => {
            wx.setStorageSync(TOKEN_KEY, data.token);
            wx.setStorageSync(USER_KEY, data.user);
            resolve(data);
          })
          .catch(reject);
      },
      fail(err) {
        reject(new Error(err.errMsg || '微信登录失败'));
      }
    });
  });
}

function loadCoachWorkbench() {
  return request('/page-data/workbench');
}

module.exports = {
  loginWithWechat,
  loadCoachWorkbench,
  request,
  TOKEN_KEY,
  USER_KEY
};
