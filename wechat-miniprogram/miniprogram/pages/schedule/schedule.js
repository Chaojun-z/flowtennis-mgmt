const { loginWithWechat, loadCoachWorkbench, saveCoachFeedback, USER_KEY } = require('../../utils/api');
const { buildWeekDays, formatScheduleItem, weekRangeText, buildTimetableDays, classBlockStyle, workbenchTodoState } = require('../../utils/schedule');

const timetableHours = Array.from({ length: 16 }, (_, i) => `${String(i + 7).padStart(2, '0')}:00`);
const avatarClasses = ['avatar-warm', 'avatar-teal', 'avatar-green', 'avatar-purple'];

function statusClass(item) {
  return String(item.statusText || '').includes('待') ? 'tag-danger' : 'tag-green';
}

function adaptSchedule(raw = [], feedbacks = []) {
  const feedbackScheduleIds = new Set((feedbacks || []).map(item => String(item.scheduleId || '')).filter(Boolean));
  return raw.map((item) => {
    const formatted = formatScheduleItem({
      ...item,
      hasFeedback: item.hasFeedback || feedbackScheduleIds.has(String(item.id || ''))
    });
    const block = classBlockStyle(formatted);
    return {
      ...formatted,
      type: formatted.title,
      student: formatted.studentText,
      loc: formatted.locationText,
      status: formatted.statusText,
      hasFeedback: !!formatted.hasFeedback,
      feedbackPending: !formatted.hasFeedback,
      statusClass: statusClass(formatted),
      blockStyle: `top:${block.top}rpx;height:${block.height}rpx`
    };
  });
}

function decorateTimetableDays(days = []) {
  return days.map((item) => ({
    ...item,
    headClass: item.isToday ? 'tt-day-head-active' : '',
    columnClass: item.isToday ? 'tt-day-column-active' : ''
  }));
}

function decorateWorkbenchClass(item, now = new Date()) {
  const state = workbenchTodoState(item, now);
  if (!state) return item;
  return {
    ...item,
    status: state.label,
    statusClass: state.className
  };
}

function buildWeekTodoGroups(days = [], now = new Date()) {
  return days
    .map(day => ({
      ...day,
      items: (day.items || [])
        .map(item => {
          const state = workbenchTodoState(item, now);
          if (!state) return null;
          return {
            ...item,
            todoLabel: state.label,
            todoClass: state.className,
            shortMeta: `${item.timeText} · ${item.studentText}`,
            shortLocation: item.locationText
          };
        })
        .filter(Boolean)
    }))
    .filter(day => day.items.length)
    .map(day => ({
      key: day.key,
      label: day.label,
      countText: `${day.items.length} 节`,
      items: day.items
    }));
}

function buildReminderItems({ todayCount = 0, nextClass = null, todoCount = 0, pendingCount = 0 }) {
  const items = [];
  if (todayCount > 0) items.push({ label: '今日', value: `${todayCount} 节`, itemClass: '' });
  if (nextClass) items.push({ label: '下一节', value: `${nextClass.timeText} · ${nextClass.locationText}`, itemClass: '' });
  if (todoCount > 0) items.push({ label: '本周待办', value: `${todoCount} 节`, itemClass: '' });
  if (pendingCount > 0) items.push({ label: '待反馈', value: `${pendingCount} 节`, itemClass: 'is-danger' });
  return items;
}

function studentIdsOf(item = {}) {
  return Array.isArray(item.studentIds) ? item.studentIds.filter(Boolean) : [];
}

function currentCoachName() {
  const user = wx.getStorageSync(USER_KEY) || {};
  return String(user.coachName || user.name || '').trim();
}

function avatarText(name = '') {
  return String(name || '').trim().slice(0, 1).toUpperCase() || '学';
}

function buildStudentCards(students = [], classes = [], schedule = [], coachName = '') {
  return (students || []).map((student, index) => {
    const relatedClasses = (classes || []).filter(item => studentIdsOf(item).includes(student.id));
    const relatedSchedule = (schedule || []).filter(item => {
      const ids = studentIdsOf(item);
      return ids.includes(student.id) || (!ids.length && String(item.studentName || '').trim() === String(student.name || '').trim());
    });
    const activeClass = relatedClasses.find(item => String(item.status || '') !== '已结束' && String(item.status || '') !== '已取消') || relatedClasses[0] || null;
    return {
      id: student.id,
      name: student.name || '未命名学员',
      avatarText: avatarText(student.name),
      avatarClass: avatarClasses[index % avatarClasses.length],
      type: String(student.primaryCoach || '').trim() === coachName ? '负责学员' : '代上学员',
      cumulative: relatedSchedule.filter(item => String(item.status || '') !== '已取消').length,
      progress: activeClass ? `${parseInt(activeClass.usedLessons, 10) || 0} / ${parseInt(activeClass.totalLessons, 10) || 0}` : '',
      showProgress: !!activeClass
    };
  }).sort((a, b) => {
    if (a.type !== b.type) return a.type === '负责学员' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN');
  });
}

function classStatusMeta(status = '') {
  if (status === '已结束' || status === '已结课') return { label: '已结束', className: 'tag-gray' };
  if (status === '已取消') return { label: '已取消', className: 'tag-gray' };
  return { label: '进行中', className: 'tag-green' };
}

function buildShiftCards(classes = [], students = []) {
  const studentMap = new Map((students || []).map(item => [String(item.id), item.name || item.id]));
  return (classes || []).map((item) => {
    const statusMeta = classStatusMeta(item.status);
    const names = studentIdsOf(item).map(id => studentMap.get(String(id)) || id).filter(Boolean);
    return {
      id: item.id,
      name: item.className || item.classNo || '未命名班次',
      student: names.join('、') || '暂无学员',
      progress: `${parseInt(item.usedLessons, 10) || 0} / ${parseInt(item.totalLessons, 10) || 0}`,
      status: statusMeta.label,
      statusClass: statusMeta.className
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'));
}

function buildStudentStats(students = [], coachName = '') {
  const visibleCount = students.length;
  const ownerCount = students.filter(item => String(item.primaryCoach || '').trim() === coachName).length;
  return { visibleCount, ownerCount };
}

function buildShiftStats(shifts = []) {
  const totalCount = shifts.length;
  const activeCount = shifts.filter(item => item.status === '进行中').length;
  const totalLessons = shifts.reduce((sum, item) => sum + (parseInt(String(item.progress).split('/')[1], 10) || 0), 0);
  const usedLessons = shifts.reduce((sum, item) => sum + (parseInt(String(item.progress).split('/')[0], 10) || 0), 0);
  return { totalCount, activeCount, totalLessons, usedLessons, remainingLessons: Math.max(0, totalLessons - usedLessons) };
}

function findFeedbackByScheduleId(feedbacks = [], scheduleId = '') {
  return (feedbacks || []).find(item => String(item.scheduleId) === String(scheduleId)) || null;
}

Page({
  data: {
    loading: true,
    error: '',
    hasLoaded: false,
    activeTab: 'dashboard',
    isDashboard: true,
    isTimetable: false,
    isStudents: false,
    isShifts: false,
    isCurrentWeek: true,
    weekOffset: 0,
    weekTitle: '本周',
    weekRange: '',
    todayLabel: '',
    days: [],
    timetableDays: [],
    timetableHours,
    schedule: [],
    feedbacks: [],
    visibleClasses: [],
    dashboardClasses: [],
    weekTodoGroups: [],
    reminderItems: [],
    studentsList: [],
    studentStats: { visibleCount: 0, ownerCount: 0 },
    shiftsList: [],
    shiftStats: { totalCount: 0, activeCount: 0, totalLessons: 0, usedLessons: 0, remainingLessons: 0 },
    feedbackForm: { practicedToday: '' },
    savingFeedback: false,
    stats: { month: 0, week: 0, today: 0, feedback: 0, pending: 0, conversion: '0%', nextTime: '暂无', nextText: '暂无', todo: 0 },
    selectedClass: null,
    showDetail: false,
    showFeedback: false,
    showPoster: false,
    detailSheetClass: '',
    feedbackSheetClass: '',
    dashboardTabClass: 'active',
    timetableTabClass: '',
    studentsTabClass: '',
    shiftsTabClass: '',
    posterStyle: '蓝绿对角',
    posterStyles: ['蓝绿对角', '极简墨绿', '对角球场', '线框蓝图', '极简白框', '活力绿']
  },

  onLoad() {
    this.load();
  },

  onShow() {
    if (this.data.hasLoaded) this.load({ keepLoading: true });
  },

  onPullDownRefresh() {
    this.load({ stopPullDown: true });
  },

  async load(options = {}) {
    if (!options.keepLoading) this.setData({ loading: true, error: '' });
    try {
      await loginWithWechat();
      const data = await loadCoachWorkbench();
      const coachName = currentCoachName();
      const schedule = adaptSchedule(data.schedule || [], data.feedbacks || []);
      const studentsList = buildStudentCards(data.students || [], data.classes || [], schedule, coachName);
      const shiftsList = buildShiftCards(data.classes || [], data.students || []);
      this.setData({
        schedule,
        feedbacks: data.feedbacks || [],
        studentsList,
        studentStats: buildStudentStats(data.students || [], coachName),
        shiftsList,
        shiftStats: buildShiftStats(shiftsList),
        loading: false,
        hasLoaded: true
      });
      this.renderWeek();
    } catch (err) {
      this.setData({ loading: false, hasLoaded: true, error: err.message || '请先进入完整教练端登录并绑定微信' });
    } finally {
      if (options.stopPullDown) wx.stopPullDownRefresh();
    }
  },

  renderWeek() {
    const { weekOffset, schedule } = this.data;
    const now = new Date();
    const days = buildWeekDays(schedule, weekOffset);
    const visibleClasses = days.reduce((all, day) => all.concat(day.items.map(item => ({ ...item, dayKey: day.key }))), []);
    const today = days.find(day => day.isToday);
    const dashboardClasses = today ? today.items.map(item => decorateWorkbenchClass(item, now)) : [];
    const weekTodoGroups = buildWeekTodoGroups(days, now);
    const todoItems = weekTodoGroups.reduce((all, day) => all.concat(day.items), []);
    const pending = todoItems.filter(item => item.todoLabel === '待反馈').length;
    const nextClass = visibleClasses
      .filter(item => {
        const state = workbenchTodoState(item, now);
        return state && state.label === '待上课';
      })
      .sort((a, b) => String(a.startTime || '').localeCompare(String(b.startTime || '')))[0];
    const todayCount = today ? today.items.length : 0;
    const reminderItems = buildReminderItems({
      todayCount,
      nextClass,
      todoCount: todoItems.length,
      pendingCount: pending
    });
    this.setData({
      weekTitle: weekOffset === 0 ? '本周' : (weekOffset > 0 ? `后 ${weekOffset} 周` : `前 ${Math.abs(weekOffset)} 周`),
      weekRange: weekRangeText(weekOffset),
      todayLabel: today ? today.label.replace(' ', '　') : '',
      isCurrentWeek: weekOffset === 0,
      days,
      timetableDays: decorateTimetableDays(buildTimetableDays(visibleClasses, weekOffset)),
      visibleClasses,
      dashboardClasses,
      weekTodoGroups,
      reminderItems,
      stats: {
        month: schedule.length,
        week: visibleClasses.length,
        today: todayCount,
        feedback: visibleClasses.filter(item => item.hasFeedback).length,
        pending,
        conversion: '0%',
        nextTime: nextClass ? nextClass.timeText : '暂无',
        nextText: nextClass ? `${nextClass.timeText} · ${nextClass.locationText}` : '暂无',
        todo: todoItems.length
      }
    });
  },

  switchTab(event) {
    const activeTab = event.currentTarget.dataset.tab || 'timetable';
    this.setData({
      activeTab,
      isDashboard: activeTab === 'dashboard',
      isTimetable: activeTab === 'timetable',
      isStudents: activeTab === 'students',
      isShifts: activeTab === 'shifts',
      dashboardTabClass: activeTab === 'dashboard' ? 'active' : '',
      timetableTabClass: activeTab === 'timetable' ? 'active' : '',
      studentsTabClass: activeTab === 'students' ? 'active' : '',
      shiftsTabClass: activeTab === 'shifts' ? 'active' : ''
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
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (selectedClass) this.setData({ selectedClass, showDetail: true, detailSheetClass: 'sheet-show' });
  },

  closeSheets() {
    this.setData({
      showDetail: false,
      showFeedback: false,
      showPoster: false,
      detailSheetClass: '',
      feedbackSheetClass: '',
      feedbackForm: { practicedToday: '' }
    });
  },

  openFeedback() {
    if (!this.data.selectedClass) return;
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, this.data.selectedClass.id);
    this.setData({
      showDetail: false,
      showFeedback: true,
      detailSheetClass: '',
      feedbackSheetClass: 'sheet-show',
      feedbackForm: {
        practicedToday: currentFeedback ? (currentFeedback.practicedToday || '') : ''
      }
    });
  },

  openFeedbackById(event) {
    const id = event.currentTarget.dataset.id;
    if (!id) return;
    const selectedClass = this.data.schedule.find(item => String(item.id) === String(id));
    if (selectedClass) {
      const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
      this.setData({
        selectedClass,
        showDetail: false,
        showFeedback: true,
        detailSheetClass: '',
        feedbackSheetClass: 'sheet-show',
        feedbackForm: {
          practicedToday: currentFeedback ? (currentFeedback.practicedToday || '') : ''
        }
      });
    }
  },

  onFeedbackInput(event) {
    this.setData({
      feedbackForm: {
        ...this.data.feedbackForm,
        practicedToday: event.detail.value
      }
    });
  },

  async saveFeedback() {
    const selectedClass = this.data.selectedClass;
    if (!selectedClass || this.data.savingFeedback) return;
    const practicedToday = String(this.data.feedbackForm.practicedToday || '').trim();
    if (!practicedToday) {
      wx.showToast({ title: '请填写今天练习了', icon: 'none' });
      return;
    }
    const currentFeedback = findFeedbackByScheduleId(this.data.feedbacks, selectedClass.id);
    this.setData({ savingFeedback: true });
    try {
      await saveCoachFeedback({
        id: currentFeedback ? currentFeedback.id : '',
        scheduleId: selectedClass.id,
        studentId: selectedClass.studentIds && selectedClass.studentIds[0] ? selectedClass.studentIds[0] : '',
        studentIds: selectedClass.studentIds || [],
        studentName: selectedClass.student,
        coach: currentCoachName(),
        startTime: selectedClass.startTime,
        campus: selectedClass.campus || '',
        venue: selectedClass.venue || selectedClass.loc || '',
        lessonCount: selectedClass.lessonCount || 1,
        isTrial: !!selectedClass.isTrial,
        practicedToday
      });
      wx.showToast({ title: '反馈已保存', icon: 'success' });
      this.closeSheets();
      await this.load({ keepLoading: true });
    } catch (err) {
      wx.showToast({ title: err.message || '保存失败', icon: 'none' });
    } finally {
      this.setData({ savingFeedback: false });
    }
  },

  openPoster() {
    this.setData({ showPoster: true });
  },

  closePoster() {
    this.setData({ showPoster: false });
  },

  selectPosterStyle(event) {
    this.setData({ posterStyle: event.currentTarget.dataset.style });
  },

  stopMove() {},

  openWebview() {
    wx.navigateTo({ url: '/pages/webview/webview' });
  }
});
