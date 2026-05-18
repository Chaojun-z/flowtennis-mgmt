Component({
  data: {
    selected: 0,
    tabs: [
      { pagePath: '/pages/index/index', text: '登录' },
      { pagePath: '/pages/schedule/schedule', text: '工作台' }
    ]
  },
  methods: {
    switchTab(event) {
      const { index, path } = event.currentTarget.dataset;
      this.setData({ selected: index });
      wx.switchTab({ url: path });
    }
  }
});
