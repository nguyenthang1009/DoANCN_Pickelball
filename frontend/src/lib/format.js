// Tiền VND số nguyên: 270000 -> "270.000đ"
export const vnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')}đ`;

// Giá ô gọn trên ma trận: 90000 -> "90k"
export const shortPrice = (n) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));

// Ngày theo giờ Việt Nam, dạng YYYY-MM-DD
export const todayVN = () => new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);

export function addDays(date, n) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const LONG = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
const dow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

export const weekdayShort = (date) => SHORT[dow(date)];
export const isWeekendDate = (date) => [0, 6].includes(dow(date));
export const dayMonth = (date) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;
export const fullDate = (date) => `${LONG[dow(date)]}, ${dayMonth(date)}/${date.slice(0, 4)}`;

// Mốc thời gian từ API -> "02/11/2026 18:00" theo giờ Việt Nam.
// Cột TIMESTAMP được trả về dạng ISO UTC (có Z) nên cộng 7 giờ; chuỗi không có múi giờ coi là giờ Việt Nam.
export function dateTime(value) {
  if (!value) return '';
  let s = String(value);
  if (/[zZ]$|[+-]\d{2}:\d{2}$/.test(s)) s = new Date(Date.parse(s) + 7 * 3600 * 1000).toISOString();
  s = s.replace('T', ' ');
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)} ${s.slice(11, 16)}`;
}

export const minutesOf = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
