const dows = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function parseDateTime(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  const matched = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (matched) {
    const [, year, month, day, hour, minute] = matched;
    const date = new Date(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), 0, 0);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatMatchType(value) {
  const text = String(value || '').trim().toLowerCase();
  if (text === 'single' || text === '单打') return '单打';
  if (text === 'double' || text === '双打') return '双打';
  return '约球';
}

function formatNtrpValue(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return '';
  return num.toFixed(1);
}

function formatNtrpRange(minValue, maxValue) {
  const min = formatNtrpValue(minValue);
  const max = formatNtrpValue(maxValue);
  if (min && max) return `${min}-${max}`;
  return min || max || '待定';
}

function formatClock(date) {
  if (!date) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatTimeRange(startRaw, endRaw) {
  const start = parseDateTime(startRaw);
  const end = parseDateTime(endRaw);
  if (!start) return '时间待定';
  const startClock = formatClock(start);
  const endClock = formatClock(end);
  return endClock ? `${startClock}-${endClock}` : startClock;
}

function formatDateLine(startRaw, endRaw) {
  const start = parseDateTime(startRaw);
  if (!start) return '时间待定';
  return `${start.getMonth() + 1}月${start.getDate()}日 ${dows[start.getDay()]} · ${formatTimeRange(startRaw, endRaw)}`;
}

function formatMonthDayParts(startRaw) {
  const date = parseDateTime(startRaw);
  if (!date) {
    return { monthText: '待定', dayText: '--', dowText: 'TBD' };
  }
  return {
    monthText: `${date.getMonth() + 1}月`,
    dayText: String(date.getDate()).padStart(2, '0'),
    dowText: dows[date.getDay()]
  };
}

function formatAaText({ estimatedCourtFee = 0, finalCourtFee = 0, activeCount = 0, targetHeadcount = 0 } = {}) {
  const finalFee = Number(finalCourtFee || 0);
  const estimatedFee = Number(estimatedCourtFee || 0);
  const settledCount = Number(activeCount || 0);
  const targetCount = Number(targetHeadcount || 0);
  if (finalFee > 0 && settledCount > 0) return `约 ¥${Math.ceil(finalFee / settledCount)}/人`;
  if (estimatedFee > 0 && targetCount > 0) return `约 ¥${Math.ceil(estimatedFee / targetCount)}/人`;
  return 'AA待定';
}

module.exports = {
  parseDateTime,
  formatMatchType,
  formatNtrpValue,
  formatNtrpRange,
  formatClock,
  formatTimeRange,
  formatDateLine,
  formatMonthDayParts,
  formatAaText
};
