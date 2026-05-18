const { getMatchDetail, registerMatch, cancelMatchRegistration, creatorConfirmAttendance, updateMatchPhoneByCode, getMatchSettings } = require('../../services/match');
const { bootstrapSession, requireLogin, restoreSession, syncSessionUserFromProfile } = require('../../services/auth');
const { MATCH_TEMPLATE_ID } = require('../../config');
const { parseDateTime, formatMatchType, formatDateLine, formatAaText, formatNtrpRange } = require('../../utils/match');
const SETTINGS_CACHE_TTL_MS = 5 * 60 * 1000;
const DETAIL_CACHE_TTL_MS = 5 * 60 * 1000;
const SHARE_CANVAS_ID = 'share-card-canvas';
const SHARE_CARD_WIDTH = 720;
const SHARE_CARD_HEIGHT = 576;
const SHARE_FALLBACK_IMAGE = '/assets/images/match-share-cover.png';

const MATCH_RULES = [
  '请根据自己的真实水平报名；若发起时未设水平，则以首位报名球友的水平作为本局最低门槛。',
  '1-3 人仅占位报名，不收款，可随时取消，不记违约。',
  '四人局凑齐第 4 人后即成团，系统统一提醒 2 小时内完成预付；全员付款成功后约球生效。',
  '四人成团并完成付款后，如需退出，须自行找到符合条件的替补；后台处理名额与订单转让。',
  '若四人局后续跌破 4 人，则自动降级为自由局，恢复赛后结算规则。',
  '2 人单打 1 小时按原价结算；2 人单打 2 小时每人加收 30 元；3 人开局按原价结算。',
  '1 人默认取消。',
  '包场预定享优先。',
  '仅限私人比赛或球局，禁止商业教学类包场。'
];

async function requestWithRelogin(loader) {
  try {
    return await loader();
  } catch (error) {
    if (error.code !== 'UNAUTHENTICATED') throw error;
    await bootstrapSession(true);
    return loader();
  }
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

function enrichMatch(match) {
  if (!match) return null;
  const current = Number(match.currentHeadcount || 0);
  const target = Number(match.targetHeadcount || 0);
  const estimatedCourtFee = Number(match.estimatedCourtFee || 0);
  const start = parseDateTime(match.startTime);
  const end = parseDateTime(match.endTime);
  const now = Date.now();
  const hasStarted = !!start && start.getTime() <= now;
  const hasEnded = !!end && end.getTime() <= now;
  const isFull = target > 0 && current >= target;
  const statusText = match.statusText || (hasEnded ? '已结束' : hasStarted ? '进行中' : isFull ? '已满' : '招募中');
  return {
    ...match,
    isFull,
    hasStarted,
    hasEnded,
    statusText,
    statusHintText: match.statusHintText || '',
    matchTypeText: formatMatchType(match.matchType),
    ntrpText: match.ntrpRangeText || formatNtrpRange(match.ntrpMin, match.ntrpMax),
    venueCardText: match.venueName || '待定场地',
    dateLine: formatDateLine(match.startTime, match.endTime),
    spotsLeftText: `${Math.max(target - current, 0)}个名额`,
    attendanceLocked: !!match.attendanceLocked,
    needsOperatorTakeover: !!match.needsOperatorTakeover,
    feeText: estimatedCourtFee > 0 ? `¥${estimatedCourtFee}` : '待定',
    aaFeeText: match.aaDisplayText || formatAaText({
      estimatedCourtFee,
      finalCourtFee: match.finalCourtFee,
      activeCount: current,
      targetHeadcount: target
    }),
    paymentText: match.viewerFeeSplit && match.viewerFeeSplit.amount
      ? `待缴 ¥${match.viewerFeeSplit.amount} · ${match.offlinePaymentText || '请线下联系运营付款'}`
      : ''
  };
}

function buildShareMeta(match) {
  if (!match) {
    return {
      title: '网球兄弟约球',
      subline: '来一起打球',
      venue: '场地待定',
      headcount: '0/0',
      aaText: 'AA待定'
    };
  }
  return {
    title: match.title || '网球兄弟约球',
    subline: match.dateLine || '时间待定',
    venue: match.venueCardText || '场地待定',
    headcount: `${Number(match.currentHeadcount || 0)}/${Number(match.targetHeadcount || 0)}`,
    aaText: match.aaFeeText || 'AA待定'
  };
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.save();
  ctx.beginPath();
  ctx.setFillStyle(fillStyle);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function fillLines(ctx, text, x, startY, maxWidth, lineHeight, maxLines) {
  const content = String(text || '').trim();
  if (!content) return;
  const chars = content.split('');
  let line = '';
  let lineIndex = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const candidate = line + chars[i];
    if (ctx.measureText(candidate).width > maxWidth && line) {
      const isLastLine = lineIndex === maxLines - 1;
      ctx.fillText(isLastLine && i < chars.length ? `${line}…` : line, x, startY + lineIndex * lineHeight);
      lineIndex += 1;
      line = chars[i];
      if (lineIndex >= maxLines) return;
      continue;
    }
    line = candidate;
  }
  if (line && lineIndex < maxLines) {
    ctx.fillText(line, x, startY + lineIndex * lineHeight);
  }
}

Page({
  data: {
    statusBarHeight: 20,
    match: null,
    registrations: [],
    joined: false,
    isCreator: false,
    viewerRegistrationStatus: '',
    canEdit: false,
    canCancelRegistration: false,
    canRegister: false,
    loading: false,
    previewOnly: false,
    viewerHasPhone: false,
    errorText: '',
    matchId: '',
    operatorWechatId: '',
    operatorPaymentQr: '',
    matchRules: MATCH_RULES,
    shareImageUrl: ''
  },
  onUnload() {
    if (this.shareRenderTimer) {
      clearTimeout(this.shareRenderTimer);
      this.shareRenderTimer = null;
    }
  },
  async onLoad(query) {
    const info = wx.getSystemInfoSync ? wx.getSystemInfoSync() : { statusBarHeight: 20 };
    this.setData({
      statusBarHeight: info.statusBarHeight || 20,
      matchId: query.id || ''
    });
    if (wx.showShareMenu) {
      wx.showShareMenu({ menus: ['shareAppMessage'] });
    }
    this.loadDetail();
  },
  goBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) {
      wx.navigateBack({ delta: 1 });
      return;
    }
    wx.switchTab({ url: '/pages/matches/index' });
  },
  async loadDetail() {
    const app = getApp();
    restoreSession();
    const cachedDetail = app.globalData.matchDetailCache[this.data.matchId];
    const previewDetail = app.globalData.matchPreviewCache[this.data.matchId];
    const cacheAt = app.globalData.matchDetailCacheAt[this.data.matchId] || 0;
    const freshDetail = cachedDetail && !app.globalData.matchesDirty && (Date.now() - cacheAt < DETAIL_CACHE_TTL_MS);
    if (cachedDetail) {
      this.applyDetailPayload(cachedDetail, app);
      this.setData({ loading: false, errorText: '' });
    } else if (previewDetail) {
      this.applyDetailPayload(previewDetail, app);
      this.setData({ loading: true, errorText: '' });
    } else {
      this.setData({ loading: true, errorText: '' });
    }
    if (freshDetail) {
      return;
    }
    try {
      const cachedSettings = app.globalData.matchSettingsCache && (Date.now() - (app.globalData.matchSettingsCacheAt || 0) < SETTINGS_CACHE_TTL_MS)
        ? app.globalData.matchSettingsCache
        : {};
      const result = await requestWithRelogin(() => getMatchDetail(this.data.matchId));
      const payload = { result, settings: cachedSettings };
      app.globalData.matchDetailCache[this.data.matchId] = payload;
      app.globalData.matchDetailCacheAt[this.data.matchId] = Date.now();
      this.applyDetailPayload(payload, app);
      this.setData({ loading: false });
      if (!app.globalData.matchSettingsCache || (Date.now() - (app.globalData.matchSettingsCacheAt || 0) >= SETTINGS_CACHE_TTL_MS)) {
        requestWithRelogin(() => getMatchSettings())
          .then((settings) => {
            app.globalData.matchSettingsCache = settings || {};
            app.globalData.matchSettingsCacheAt = Date.now();
            const latestPayload = app.globalData.matchDetailCache[this.data.matchId];
            if (latestPayload && latestPayload.result) {
              latestPayload.settings = app.globalData.matchSettingsCache;
              this.applyDetailPayload(latestPayload, app);
            }
          })
          .catch(() => null);
      }
    } catch (error) {
      this.setData({
        loading: false,
        errorText: error.message || '加载失败'
      });
    }
  },
  applyDetailPayload(payload, app = getApp()) {
    const result = payload.result || {};
    const settings = payload.settings || {};
    const previewOnly = !!result.previewOnly;
    const registrations = previewOnly ? [] : (result.registrations || []).filter((item) => item.registrationStatus !== 'cancelled');
    const match = enrichMatch(result.match);
    const viewerRegistration = registrations.find((item) => item.userId === app.globalData.userId);
    const viewerRegistrationStatus = previewOnly
      ? (result.viewerRegistrationStatus || (result.viewerJoined ? 'registered' : ''))
      : (viewerRegistration ? viewerRegistration.registrationStatus : '');
    const canCancelRegistration = Boolean(
      viewerRegistrationStatus === 'registered' &&
      match &&
      !match.hasStarted &&
      result.match &&
      result.match.canSelfCancel !== false
    );
    const canRegister = Boolean(match && !match.hasStarted && !match.hasEnded && !match.isFull);
    const canEdit = Boolean(match && result.match && result.match.creatorUserId === app.globalData.userId && !match.hasStarted && app.globalData.currentUser?.canCreateMatch);
    this.setData({
      match,
      registrations,
      joined: previewOnly ? !!result.viewerJoined : Boolean(viewerRegistration && viewerRegistrationStatus !== 'cancelled'),
      isCreator: result.match && result.match.creatorUserId === app.globalData.userId,
      viewerRegistrationStatus,
      canEdit,
      canCancelRegistration,
      canRegister,
      previewOnly,
      viewerHasPhone: !!app.globalData.currentUser?.phone,
      operatorWechatId: settings.operatorWechatId || '',
      operatorPaymentQr: settings.operatorPaymentQr || ''
    });
    if (!previewOnly && match) {
      this.scheduleShareCard(match, app);
    }
  },
  scheduleShareCard(match, app = getApp()) {
    if (this.shareRenderTimer) {
      clearTimeout(this.shareRenderTimer);
      this.shareRenderTimer = null;
    }
    const shareKey = [
      this.data.matchId,
      match.title,
      match.dateLine,
      match.venueCardText,
      match.currentHeadcount,
      match.targetHeadcount,
      match.aaFeeText,
      match.statusText
    ].join('|');
    const cachedShare = app.globalData.matchShareImageCache && app.globalData.matchShareImageCache[shareKey];
    if (cachedShare) {
      this.setData({ shareImageUrl: cachedShare });
      return;
    }
    this.shareRenderTimer = setTimeout(() => {
      this.shareRenderTimer = null;
      this.renderShareCard(match, shareKey, app);
    }, 180);
  },
  renderShareCard(match, shareKey = '', app = getApp()) {
    const meta = buildShareMeta(match);
    const ctx = wx.createCanvasContext(SHARE_CANVAS_ID, this);
    ctx.setFillStyle('#0d0d10');
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    ctx.setFillStyle('#17171b');
    ctx.fillRect(0, 0, SHARE_CARD_WIDTH, SHARE_CARD_HEIGHT);

    ctx.save();
    ctx.beginPath();
    ctx.arc(620, 110, 120, 0, Math.PI * 2);
    ctx.setFillStyle('rgba(212,245,78,0.12)');
    ctx.fill();
    ctx.restore();

    drawRoundedRect(ctx, 38, 38, SHARE_CARD_WIDTH - 76, SHARE_CARD_HEIGHT - 76, 36, '#151519');
    drawRoundedRect(ctx, 60, 64, 126, 54, 27, 'rgba(212,245,78,0.10)');

    ctx.setFillStyle('#d4f54e');
    ctx.setFontSize(24);
    ctx.setTextAlign('center');
    ctx.fillText(match.statusText || '招募中', 123, 98);

    ctx.setTextAlign('left');
    ctx.setFillStyle('#8a8993');
    ctx.setFontSize(24);
    ctx.fillText(meta.subline, 208, 98);

    ctx.setFillStyle('#eeece4');
    ctx.setFontSize(48);
    fillLines(ctx, meta.title, 60, 170, SHARE_CARD_WIDTH - 120, 58, 2);

    ctx.setFillStyle('#d4f54e');
    ctx.setFontSize(34);
    ctx.fillText(meta.venue, 60, 296);

    drawRoundedRect(ctx, 60, 344, 274, 132, 28, '#1d1d22');
    drawRoundedRect(ctx, 386, 344, 274, 132, 28, '#1d1d22');

    ctx.setFillStyle('#d4f54e');
    ctx.setFontSize(48);
    ctx.setTextAlign('center');
    ctx.fillText(meta.headcount, 197, 406);
    ctx.fillText(meta.aaText, 523, 406);

    ctx.setFillStyle('#7c7b85');
    ctx.setFontSize(24);
    ctx.fillText('实时报名', 197, 446);
    ctx.fillText('AA 预估', 523, 446);

    ctx.setGlobalAlpha(0.05);
    ctx.setFillStyle('#ffffff');
    ctx.setFontSize(112);
    ctx.setTextAlign('left');
    ctx.fillText('PLAY', 58, 510);
    ctx.setGlobalAlpha(1);

    ctx.draw(false, () => {
      wx.canvasToTempFilePath({
        canvasId: SHARE_CANVAS_ID,
        width: SHARE_CARD_WIDTH,
        height: SHARE_CARD_HEIGHT,
        destWidth: SHARE_CARD_WIDTH,
        destHeight: SHARE_CARD_HEIGHT,
        success: ({ tempFilePath }) => {
          if (!app.globalData.matchShareImageCache) app.globalData.matchShareImageCache = {};
          if (shareKey) app.globalData.matchShareImageCache[shareKey] = tempFilePath;
          this.setData({ shareImageUrl: tempFilePath });
        },
        fail: () => this.setData({ shareImageUrl: '' })
      }, this);
    });
  },
  editMatch() {
    if (!this.data.canEdit || !this.data.matchId) return;
    wx.navigateTo({ url: `/pages/match-create/index?id=${this.data.matchId}` });
  },
  async register() {
    try {
      if (!this.data.canRegister) {
        const title = this.data.match && this.data.match.hasEnded
          ? '球局已结束'
          : this.data.match && this.data.match.hasStarted
            ? '球局已开始'
            : '名额已满';
        wx.showToast({ title, icon: 'none' });
        return;
      }
      await requireLogin({ reason: '报名约球' });
      const app = getApp();
      await requestMatchSubscribe();
      const result = await requestWithRelogin(() => registerMatch(this.data.match.id, app.globalData.userId));
      app.globalData.matchesDirty = true;
      app.globalData.myMatchesDirty = true;
      app.globalData.profileDirty = true;
      app.globalData.notificationsDirty = true;
      await this.loadDetail();
      if (result && result.formationNotice) {
        wx.showModal({
          title: '本局已成团',
          content: result.formationNotice,
          showCancel: false,
          confirmText: '知道了'
        });
        return;
      }
      wx.showToast({ title: '报名成功', icon: 'success' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '报名失败', icon: 'none' });
    }
  },
  async registerWithPhone(event) {
    try {
      if (event.detail && event.detail.code) {
        await requireLogin({ reason: '报名约球' });
        const profile = await requestWithRelogin(() => updateMatchPhoneByCode(event.detail.code));
        const nextUser = syncSessionUserFromProfile(profile);
        this.setData({ viewerHasPhone: !!nextUser?.phone });
      }
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '手机号授权失败', icon: 'none' });
      return;
    }
    return this.register();
  },
  openVenue() {
    const match = this.data.match || {};
    const latitude = Number(match.venueLatitude);
    const longitude = Number(match.venueLongitude);
    if (!latitude || !longitude) {
      wx.showToast({ title: '暂未设置场地位置', icon: 'none' });
      return;
    }
    wx.openLocation({
      latitude,
      longitude,
      name: match.venueName || '约球场地',
      address: match.venueAddress || match.venueName || ''
    });
  },
  copyOperatorWechat() {
    if (!this.data.operatorWechatId) {
      wx.showToast({ title: '暂未配置运营微信', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: this.data.operatorWechatId,
      success: () => wx.showToast({ title: '已复制运营微信', icon: 'none' })
    });
  },
  async cancelRegistration() {
    try {
      if (!this.data.canCancelRegistration) {
        wx.showToast({ title: '开始后不能取消报名', icon: 'none' });
        return;
      }
      await requireLogin({ reason: '管理你的报名' });
      await requestMatchSubscribe();
      const app = getApp();
      await requestWithRelogin(() => cancelMatchRegistration(this.data.match.id, app.globalData.userId));
      app.globalData.matchesDirty = true;
      app.globalData.myMatchesDirty = true;
      app.globalData.profileDirty = true;
      app.globalData.notificationsDirty = true;
      await this.loadDetail();
      const pages = getCurrentPages();
      const prevPage = pages[pages.length - 2];
      if (prevPage && typeof prevPage.loadData === 'function') {
        prevPage.loadData();
      }
      wx.showToast({ title: '已取消报名', icon: 'none' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '取消失败', icon: 'none' });
    }
  },
  onShareAppMessage() {
    const match = this.data.match || {};
    const payload = {
      title: match.title || '来一起打球',
      path: `/pages/match-detail/index?id=${this.data.matchId}`
    };
    payload.imageUrl = this.data.shareImageUrl || SHARE_FALLBACK_IMAGE;
    return payload;
  },
  async creatorMarkAttendance(event) {
    const { registrationId, status } = event.currentTarget.dataset;
    try {
      if (!this.data.match || !this.data.match.hasStarted || this.data.match.attendanceLocked || this.data.match.needsOperatorTakeover) {
        wx.showToast({ title: '当前还不能确认到场', icon: 'none' });
        return;
      }
      await requireLogin({ reason: '确认到场' });
      const app = getApp();
      await requestWithRelogin(() => creatorConfirmAttendance(this.data.match.id, registrationId, app.globalData.userId, status));
      await this.loadDetail();
      wx.showToast({ title: status === 'attended' ? '已确认到场' : '已标记缺席', icon: 'none' });
    } catch (error) {
      if (error.code === 'LOGIN_CANCELLED') return;
      wx.showToast({ title: error.message || '操作失败', icon: 'none' });
    }
  }
});
