const { createMatch, updateMatch, getMatchDetail, updateMatchPhoneByCode } = require('../../services/match');
const { bootstrapSession, requireLogin, syncSessionUserFromProfile } = require('../../services/auth');
const { MATCH_TEMPLATE_ID } = require('../../config');
const { parseDateTime } = require('../../utils/match');

const MATCH_TYPES = ['单打', '双打'];
const GENDERS = ['不限', '女生', '男生'];
const NTRP_LEVELS = ['1.0', '1.5', '2.0', '2.5', '3.0', '3.5', '4.0', '4.5', '5.0'];
const HEADCOUNT_MAP = {
  单打: [2, 3, 4],
  双打: [4, 5, 6]
};

function toDateString(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(dateValue) {
  if (!dateValue) return '选择日期';
  const date = new Date(`${dateValue} 00:00:00`.replace(/-/g, '/'));
  if (Number.isNaN(date.getTime())) return dateValue;
  const dows = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
  return `${date.getMonth() + 1}月${date.getDate()}日 ${dows[date.getDay()]}`;
}

function splitDateTime(raw, fallbackDate, fallbackClock) {
  const date = parseDateTime(raw);
  if (!date) {
    return {
      date: fallbackDate,
      clock: fallbackClock
    };
  }
  return {
    date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    clock: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  };
}

function addOneHour(clock) {
  const [hour, minute] = String(clock || '00:00').split(':').map(Number);
  const total = hour * 60 + minute + 60;
  const nextHour = Math.floor((total % (24 * 60)) / 60);
  const nextMinute = total % 60;
  return `${String(nextHour).padStart(2, '0')}:${String(nextMinute).padStart(2, '0')}`;
}

function requestMatchSubscribe() {
  if (!MATCH_TEMPLATE_ID || !wx.requestSubscribeMessage) return Promise.resolve();
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: [MATCH_TEMPLATE_ID],
      complete: resolve
    });
  });
}

Page({
  data: {
    statusBarHeight: 20,
    submitting: false,
    editing: false,
    currentUserHasPhone: false,
    matchId: '',
    showSheet: false,
    activeSheet: '',
    timeExpanded: false,
    matchTypeOptions: MATCH_TYPES,
    genderOptions: GENDERS,
    ntrpOptions: NTRP_LEVELS,
    headcountOptions: [],
    headcountChoices: [],
    startDate: '',
    startClock: '',
    endDate: '',
    endClock: '',
    feeInput: '',
    matchTypeIndex: 0,
    genderIndex: 0,
    ntrpMinIndex: 3,
    ntrpMaxIndex: 5,
    ntrpMinSlider: 25,
    ntrpMaxSlider: 35,
    headcountIndex: 0,
    rangeMinPercent: 37.5,
    rangeMaxPercent: 62.5,
    rangeWidthPercent: 25,
    form: {
      title: '',
      matchType: '单打',
      startTime: '',
      endTime: '',
      venueName: '',
      venueAddress: '',
      venueLatitude: '',
      venueLongitude: '',
      targetHeadcount: 2,
      levelMode: 'preset',
      ntrpMin: '2.5',
      ntrpMax: '3.5',
      genderPreference: '不限',
      estimatedCourtFee: '',
      feeRuleType: 'aa'
    },
    levelSummaryText: '',
    preferenceSummary: '',
    feeSummary: '',
    timeSummary: '',
    venueSummary: '未指定球场'
  },

  onLoad(query = {}) {
    const sysInfo = wx.getSystemInfoSync();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const date = toDateString(tomorrow);
    this.setData({
      statusBarHeight: sysInfo.statusBarHeight || 20,
      editing: Boolean(query.id),
      currentUserHasPhone: !!getApp().globalData.currentUser?.phone,
      matchId: query.id || '',
      startDate: date,
      endDate: date,
      startClock: '19:00',
      endClock: '21:00',
      feeInput: ''
    }, () => {
      this.syncDateTime();
      this.syncSummaries();
      if (query.id) this.loadMatch(query.id);
    });
    bootstrapSession()
      .then((user) => {
        this.setData({ currentUserHasPhone: !!user?.phone });
        if (!query.id && user?.id && !user.canCreateMatch) {
          wx.showToast({
            title: '当前账号没有发布权限，请先确认后台同手机号账号已开通约球发布权限或管理员权限',
            icon: 'none',
            duration: 2500
          });
          this.goBack();
        }
      })
      .catch(() => null);
  },

  vibrate(type = 'light') {
    if (wx.vibrateShort) wx.vibrateShort({ type });
  },

  goBack() {
    wx.navigateBack({
      delta: 1,
      fail() {
        wx.switchTab({ url: '/pages/matches/index' });
      }
    });
  },

  toggleTimeExpanded() {
    this.setData({ timeExpanded: !this.data.timeExpanded });
  },

  updateTitle(event) {
    this.setData({ 'form.title': event.detail.value });
  },

  async loadMatch(matchId) {
    try {
      await bootstrapSession();
      const result = await getMatchDetail(matchId);
      const match = result.match || {};
      const startParts = splitDateTime(match.startTime, this.data.startDate, this.data.startClock || '19:00');
      const endParts = splitDateTime(match.endTime, startParts.date, this.data.endClock || '20:00');
      const estimatedCourtFee = match.estimatedCourtFee === 0 ? '0' : String(match.estimatedCourtFee || '');
      this.setData({
        startDate: startParts.date,
        endDate: endParts.date,
        startClock: startParts.clock,
        endClock: endParts.clock,
        feeInput: estimatedCourtFee,
        form: {
          ...this.data.form,
          ...match,
          levelMode: match.levelMode || (match.ntrpMin && match.ntrpMax ? 'preset' : 'first_join'),
          estimatedCourtFee,
          feeRuleType: match.feeRuleType || 'aa'
        }
      }, () => {
        this.syncDateTime();
        this.syncSummaries();
      });
    } catch (error) {
      wx.showToast({ title: error.message || '加载失败', icon: 'none' });
    }
  },

  syncDateTime() {
    const { startDate, startClock, endDate, endClock } = this.data;
    const endDay = endDate || startDate;
    this.setData({
      'form.startTime': startDate && startClock ? `${startDate} ${startClock}` : '',
      'form.endTime': endDay && endClock ? `${endDay} ${endClock}` : ''
    }, () => this.syncSummaries());
  },

  syncSummaries() {
    const { form, startDate, startClock, endClock } = this.data;
    const total = Number(form.estimatedCourtFee || 0);
    const people = Number(form.targetHeadcount || 0);
    const aaText = total > 0 && people > 0 ? `约 ¥${Math.ceil(total / people)}/人` : 'AA待定';
    const levelSummaryText = form.levelMode === 'first_join' ? '待首位报名定级' : `${form.ntrpMin}-${form.ntrpMax}`;
    const headcountOptions = HEADCOUNT_MAP[form.matchType].map((count) => `${count}人`);
    const headcountChoices = HEADCOUNT_MAP[form.matchType].map((count) => ({ label: `${count}人`, value: count }));
    const venueSummary = form.venueName && form.venueName !== '待定'
      ? `${form.venueName}${form.venueAddress ? ` · ${form.venueAddress}` : ''}`
      : '未指定球场';

    const ntrpMinSlider = Math.max(Number(form.ntrpMin || 2.5) * 10, 10);
    const ntrpMaxSlider = Math.max(Number(form.ntrpMax || 3.5) * 10, 10);
    const rangeMinPercent = ((ntrpMinSlider - 10) / 40) * 100;
    const rangeMaxPercent = ((ntrpMaxSlider - 10) / 40) * 100;

    this.setData({
      levelSummaryText,
      preferenceSummary: `${levelSummaryText} · ${form.genderPreference} · ${form.matchType} · ${form.targetHeadcount}人`,
      feeSummary: total > 0 ? `总场地费 ¥${total} · ${aaText}` : '输入总场地费后自动算人均',
      timeSummary: `${formatDateLabel(startDate)} · ${startClock}-${endClock}`,
      venueSummary,
      headcountOptions,
      headcountChoices,
      matchTypeIndex: Math.max(MATCH_TYPES.indexOf(form.matchType), 0),
      genderIndex: Math.max(GENDERS.indexOf(form.genderPreference), 0),
      ntrpMinIndex: Math.max(NTRP_LEVELS.indexOf(form.ntrpMin), 0),
      ntrpMaxIndex: Math.max(NTRP_LEVELS.indexOf(form.ntrpMax), 0),
      ntrpMinSlider,
      ntrpMaxSlider,
      headcountIndex: Math.max(headcountOptions.indexOf(`${form.targetHeadcount}人`), 0),
      rangeMinPercent,
      rangeMaxPercent,
      rangeWidthPercent: Math.max(rangeMaxPercent - rangeMinPercent, 0)
    });
  },

  openSheet(event) {
    const activeSheet = event.currentTarget.dataset.sheet;
    this.setData({
      activeSheet,
      showSheet: true
    });
  },

  closeSheet() {
    this.setData({
      showSheet: false,
      activeSheet: ''
    });
  },

  stopSheetTouch() {},

  updateMatchType(event) {
    const datasetValue = event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.value : '';
    const pickerValue = event.detail ? MATCH_TYPES[Number(event.detail.value)] : '';
    const value = datasetValue || pickerValue || '单打';
    const options = HEADCOUNT_MAP[value];
    const currentCount = Number(this.data.form.targetHeadcount || options[0]);
    const nextCount = options.includes(currentCount) ? currentCount : options[0];
    this.setData({
      'form.matchType': value,
      'form.targetHeadcount': nextCount
    }, () => this.syncSummaries());
  },

  updateHeadcount(event) {
    const datasetValue = event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.value : '';
    const pickerLabel = event.detail ? this.data.headcountOptions[Number(event.detail.value)] : '';
    const value = Number(datasetValue || (pickerLabel ? pickerLabel.replace('人', '') : 0));
    this.setData({
      'form.targetHeadcount': value
    }, () => this.syncSummaries());
  },

  updateGender(event) {
    const datasetValue = event.currentTarget && event.currentTarget.dataset ? event.currentTarget.dataset.value : '';
    const pickerValue = event.detail ? GENDERS[Number(event.detail.value)] : '';
    const value = datasetValue || pickerValue || '不限';
    this.setData({
      'form.genderPreference': value
    }, () => this.syncSummaries());
  },

  toggleLevelMode(event) {
    const value = event.currentTarget.dataset.value || 'preset';
    if (value === 'first_join') {
      this.setData({
        'form.levelMode': 'first_join',
        'form.ntrpMin': '',
        'form.ntrpMax': ''
      }, () => this.syncSummaries());
      return;
    }
    this.setData({
      'form.levelMode': 'preset',
      'form.ntrpMin': this.data.form.ntrpMin || '2.5',
      'form.ntrpMax': this.data.form.ntrpMax || '3.5'
    }, () => this.syncSummaries());
  },

  updateNtrpSlider(event) {
    const field = event.currentTarget.dataset.field;
    const value = Number(event.detail.value);
    let min = field === 'min' ? value : this.data.ntrpMinSlider;
    let max = field === 'max' ? value : this.data.ntrpMaxSlider;
    if (min > max) {
      if (field === 'min') {
        max = min;
      } else {
        min = max;
      }
    }
    this.setData({
      'form.levelMode': 'preset',
      ntrpMinSlider: min,
      ntrpMaxSlider: max,
      rangeMinPercent: ((min - 10) / 40) * 100,
      rangeMaxPercent: ((max - 10) / 40) * 100,
      rangeWidthPercent: Math.max(((max - min) / 40) * 100, 0),
      'form.ntrpMin': (min / 10).toFixed(1),
      'form.ntrpMax': (max / 10).toFixed(1)
    }, () => this.syncSummaries());
  },

  updateNtrp(event) {
    const field = event.currentTarget.dataset.field;
    const value = NTRP_LEVELS[Number(event.detail.value)] || '2.5';
    const currentMin = field === 'ntrpMin' ? value : this.data.form.ntrpMin;
    const currentMax = field === 'ntrpMax' ? value : this.data.form.ntrpMax;
    const minIndex = NTRP_LEVELS.indexOf(currentMin);
    const maxIndex = NTRP_LEVELS.indexOf(currentMax);
    const fixedMin = minIndex <= maxIndex ? currentMin : currentMax;
    const fixedMax = minIndex <= maxIndex ? currentMax : currentMin;
    this.setData({
      'form.levelMode': 'preset',
      'form.ntrpMin': fixedMin,
      'form.ntrpMax': fixedMax
    }, () => this.syncSummaries());
  },

  updateFeeInput(event) {
    const rawValue = `${event.detail.value || ''}`.replace(/[^\d.]/g, '');
    this.setData({
      feeInput: rawValue,
      'form.estimatedCourtFee': rawValue
    }, () => this.syncSummaries());
  },

  updateDate(event) {
    const field = event.currentTarget.dataset.field;
    const next = { [field]: event.detail.value };
    if (field === 'startDate') next.endDate = event.detail.value;
    this.setData(next, () => this.syncDateTime());
  },

  updateClock(event) {
    const field = event.currentTarget.dataset.field;
    const value = event.detail.value;
    if (field === 'startClock') {
      this.setData({
        startClock: value,
        endClock: addOneHour(value)
      }, () => this.syncDateTime());
      return;
    }
    this.setData({ [field]: value }, () => this.syncDateTime());
  },

  chooseVenueLocation() {
    this.vibrate('medium');
    wx.chooseLocation({
      success: (res) => {
        this.setData({
          'form.venueName': res.name || '',
          'form.venueAddress': res.address || '',
          'form.venueLatitude': res.latitude || '',
          'form.venueLongitude': res.longitude || ''
        }, () => this.syncSummaries());
      },
      fail: () => {
        wx.showToast({ title: '未选择位置', icon: 'none' });
      }
    });
  },

  async submitMatch() {
    const { title, startTime, endTime, ntrpMin, ntrpMax, targetHeadcount, estimatedCourtFee, venueName, venueAddress, venueLatitude, venueLongitude, levelMode } = this.data.form;
    if (!title || !startTime || !endTime || !targetHeadcount) {
      wx.showToast({ title: '请补全约球信息', icon: 'none' });
      return;
    }
    if (levelMode !== 'first_join' && (!ntrpMin || !ntrpMax)) {
      wx.showToast({ title: '请设置水平范围', icon: 'none' });
      return;
    }
    if (!venueName || !venueAddress || venueLatitude === '' || venueLongitude === '') {
      wx.showToast({ title: '请选择球场', icon: 'none' });
      return;
    }
    if (estimatedCourtFee === '' || estimatedCourtFee === null || Number(estimatedCourtFee) <= 0) {
      wx.showToast({ title: '请填写AA费用', icon: 'none' });
      return;
    }
    const start = new Date(String(startTime).replace(/-/g, '/'));
    const end = new Date(String(endTime).replace(/-/g, '/'));
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end.getTime() <= start.getTime()) {
      wx.showToast({ title: '结束时间需晚于开始时间', icon: 'none' });
      return;
    }
    if (String(startTime).slice(0, 10) !== String(endTime).slice(0, 10)) {
      wx.showToast({ title: '约球时间不能跨天', icon: 'none' });
      return;
    }
    this.vibrate('heavy');
    this.setData({ submitting: true });
    try {
      await requireLogin({ reason: this.data.editing ? '修改约球' : '发起约球' });
      await requestMatchSubscribe();
      const app = getApp();
      const payload = {
        ...this.data.form,
        estimatedCourtFee: Number(this.data.form.estimatedCourtFee),
        creatorUserId: app.globalData.userId
      };
      if (this.data.editing && this.data.matchId) {
        await updateMatch(this.data.matchId, payload);
      } else {
        await createMatch(payload);
      }
      app.globalData.matchesDirty = true;
      app.globalData.myMatchesDirty = true;
      app.globalData.profileDirty = true;
      app.globalData.notificationsDirty = true;
      wx.showToast({ title: this.data.editing ? '已保存' : '发布成功', icon: 'success' });
      wx.switchTab({ url: '/pages/matches/index' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || (this.data.editing ? '保存失败' : '发布失败'), icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  }
  ,
  async submitMatchWithPhone(event) {
    try {
      if (!this.data.editing && event.detail && event.detail.code) {
        await requireLogin({ reason: '发起约球' });
        const profile = await updateMatchPhoneByCode(event.detail.code);
        const nextUser = syncSessionUserFromProfile(profile);
        this.setData({ currentUserHasPhone: !!nextUser?.phone });
      } else if (!this.data.editing && !this.data.currentUserHasPhone) {
        wx.showToast({ title: '请先授权手机号', icon: 'none' });
        return;
      }
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '手机号授权失败', icon: 'none' });
      return;
    }
    return this.submitMatch();
  }
});
