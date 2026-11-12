const HttpError = require('./httpError');

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)(:\d{2})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// 'HH:MM' hoặc 'HH:MM:SS' (kiểu TIME của MySQL) -> số phút từ 00:00
function toMinutes(value, field = 'time') {
  if (typeof value !== 'string' || !TIME_RE.test(value)) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} phải có dạng HH:MM`);
  }
  const [h, m] = value.split(':').map(Number);
  return h * 60 + m;
}

const toTime = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// Chuẩn hóa giá trị TIME từ CSDL về 'HH:MM'
const hhmm = (value) => toTime(toMinutes(value));

// BR01, BR02: mọi mốc giờ là bội số của 30 phút
function assertHalfHour(minutes, field) {
  if (minutes % 30 !== 0) throw new HttpError(400, 'VALIDATION_ERROR', `${field} phải là bội số của 30 phút`);
}

function assertDate(value, field = 'date') {
  const valid = typeof value === 'string' && DATE_RE.test(value)
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  if (!valid) throw new HttpError(400, 'VALIDATION_ERROR', `${field} phải có dạng YYYY-MM-DD`);
}

// BR05: Thứ Bảy và Chủ Nhật tính giá cuối tuần
const isWeekend = (date) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay());

// BR18: thời điểm hiện tại theo giờ Việt Nam (UTC+7), không phụ thuộc múi giờ máy chủ
function nowInVietnam() {
  const iso = new Date(Date.now() + 7 * 3600 * 1000).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16) };
}

module.exports = { toMinutes, toTime, hhmm, assertHalfHour, assertDate, isWeekend, nowInVietnam };
