// Tổng hợp bảng công từ giờ vào ca, ra ca. Hàm thuần, không đụng CSDL, để kiểm thử bằng số tính tay.
//
// Căn cứ:
// - Ngày làm việc bình thường không quá 8 giờ (khoản 1 Điều 105 Bộ luật Lao động 2019). Phần vượt là làm thêm.
// - Làm việc vào ngày nghỉ hằng tuần, ngày lễ thì toàn bộ là làm thêm (Điều 98, Điều 111, Điều 112).
// - Ban đêm từ 22 giờ đến 6 giờ sáng hôm sau (Điều 106).
// - Lễ trùng ngày nghỉ hằng tuần thì nghỉ bù vào ngày làm việc kế tiếp (khoản 3 Điều 112).
// - Làm thêm ban đêm: phần thêm 20% tính trên lương giờ ban ngày; ngày thường có làm thêm ban ngày thì lương giờ
//   ban ngày là mức làm thêm 150%, không có thì 100% (Điều 57 Nghị định 145/2020/NĐ-CP).
//
// Một lượt chấm công được tính cho ngày bắt đầu vào ca, kể cả khi ra ca sau nửa đêm.

const DAY_MS = 86400000;
const toDate = (ms) => new Date(ms).toISOString().slice(0, 10);
const dateMs = (date) => Date.parse(`${date}T00:00:00Z`);
const weekday = (date) => new Date(dateMs(date)).getUTCDay();
// 'YYYY-MM-DD HH:MM[:SS]' giờ Việt Nam -> số phút, coi như giờ UTC để cộng trừ không lệch múi giờ
const toMinute = (value) => Math.floor(Date.parse(`${value.replace(' ', 'T').slice(0, 16)}:00Z`) / 60000);

// Loại từng ngày trong tháng với một nhân viên: HOLIDAY (lễ, tết, nghỉ bù), REST (nghỉ hằng tuần), WORK
function classifyDays(month, restDay, holidays) {
  const start = dateMs(`${month}-01`);
  const [y, m] = month.split('-').map(Number);
  const end = Date.UTC(y, m, 0);
  const types = new Map();
  const names = new Map(holidays);
  // Lễ trùng ngày nghỉ hằng tuần: nghỉ bù vào ngày làm việc kế tiếp. Xét cả lễ cuối tháng trước.
  for (const [date, name] of [...holidays].sort(([a], [b]) => a.localeCompare(b))) {
    if (weekday(date) !== restDay) continue;
    let d = dateMs(date) + DAY_MS;
    while (names.has(toDate(d)) || weekday(toDate(d)) === restDay) d += DAY_MS;
    names.set(toDate(d), `Nghỉ bù ${name}`);
  }
  for (let d = start; d <= end; d += DAY_MS) {
    const date = toDate(d);
    // Lễ trùng ngày nghỉ hằng tuần vẫn là ngày lễ khi đi làm (300%), nhưng ngày được trả lương là ngày nghỉ bù
    if (names.has(date)) types.set(date, 'HOLIDAY');
    else types.set(date, weekday(date) === restDay ? 'REST' : 'WORK');
  }
  return { types, names };
}

// records: [{ clockIn, clockOut, shiftMinutes }] đã ra ca, giờ Việt Nam dạng 'YYYY-MM-DD HH:MM:SS'.
// shiftMinutes: độ dài ca theo lịch (null nếu làm ngoài lịch), dùng để quy ra số ca cho lương theo ca.
function summarize(records, { month, restDay = 0, holidays = new Map(), normalDailyMinutes = 480, unitMinutes = 480 }) {
  const { types, names } = classifyDays(month, restDay, holidays);
  const days = new Map();
  const dayOf = (date) => {
    if (!days.has(date)) days.set(date, { date, type: types.get(date), holiday: types.get(date) === 'HOLIDAY' ? names.get(date) : null, worked: 0, normal: 0, night: 0, ot: 0, otNight: 0, otDay: 0 });
    return days.get(date);
  };
  let units = 0;
  const sorted = [...records].sort((a, b) => a.clockIn.localeCompare(b.clockIn));
  for (const r of sorted) {
    const date = r.clockIn.slice(0, 10);
    if (!types.has(date)) continue; // lượt bắt đầu ngoài tháng tính cho tháng khác
    const day = dayOf(date);
    let recordNormal = 0;
    for (let t = toMinute(r.clockIn); t < toMinute(r.clockOut); t++) {
      const hour = Math.floor((((t % 1440) + 1440) % 1440) / 60);
      const night = hour >= 22 || hour < 6;
      const overtime = day.type !== 'WORK' || day.worked >= normalDailyMinutes;
      day.worked++;
      if (!overtime) {
        day.normal++;
        recordNormal++;
        if (night) day.night++;
      } else {
        day.ot++;
        if (night) day.otNight++;
        else day.otDay++;
      }
    }
    if (day.type === 'WORK') units += Math.min(1, recordNormal / (r.shiftMinutes || unitMinutes));
  }

  const list = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const sum = (filter, key) => list.filter(filter).reduce((s, d) => s + d[key], 0);
  const isWork = (d) => d.type === 'WORK';
  let paidHolidays = 0;
  for (const [date, type] of types) if (type === 'HOLIDAY' && weekday(date) !== restDay) paidHolidays++;
  return {
    workDays: list.filter((d) => isWork(d) && d.normal > 0).length,
    paidHolidays,
    normalMinutes: sum(isWork, 'normal'),
    units: Math.round(units * 100) / 100,
    nightMinutes: sum(isWork, 'night'),
    otWeekdayMinutes: sum(isWork, 'ot'),
    otWeekendMinutes: sum((d) => d.type === 'REST', 'ot'),
    otHolidayMinutes: sum((d) => d.type === 'HOLIDAY', 'ot'),
    nightOt: {
      weekdayPlain: sum((d) => isWork(d) && d.otDay === 0, 'otNight'),
      weekdayAfterDayOt: sum((d) => isWork(d) && d.otDay > 0, 'otNight'),
      weekend: sum((d) => d.type === 'REST', 'otNight'),
      holiday: sum((d) => d.type === 'HOLIDAY', 'otNight'),
    },
    days: list.map(({ date, type, holiday, worked, normal, night, ot, otNight }) => ({ date, type, holiday, worked, normal, night, ot, otNight })),
  };
}

module.exports = { classifyDays, summarize, toMinute };
