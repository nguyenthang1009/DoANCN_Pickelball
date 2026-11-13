const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { toMinutes, toTime, hhmm, assertHalfHour, assertDate, isWeekend, nowInVietnam } = require('../utils/time');
const { assertRequired } = require('../utils/validators');
const configService = require('./config.service');
const audit = require('./audit.service');

const DAY_TYPES = ['WEEKDAY', 'WEEKEND'];

function toRule(row) {
  return {
    id: row.id,
    dayType: row.day_type,
    startTime: hhmm(row.start_time),
    endTime: hhmm(row.end_time),
    pricePerHour: row.price_per_hour,
    pricePerSlot: row.price_per_hour / 2, // BR06: giá một ô 30 phút
  };
}

async function listByCourt(courtId, db = pool) {
  const [rows] = await db.query(
    'SELECT id, day_type, start_time, end_time, price_per_hour FROM price_rules WHERE court_id = ? ORDER BY day_type, start_time',
    [courtId],
  );
  return rows.map(toRule);
}

// Mỗi loại ngày phải phủ kín giờ mở cửa: liền mạch, không hở, không chồng lấn.
// rules: [{ dayType, start, end }] với start/end là số phút. Trả về thông báo lỗi hoặc null.
function coverageError(rules, openMin, closeMin) {
  for (const dayType of DAY_TYPES) {
    const list = rules.filter((r) => r.dayType === dayType).sort((a, b) => a.start - b.start);
    if (!list.length) return `Thiếu bảng giá ${dayType}`;
    let cursor = openMin;
    for (const r of list) {
      if (r.start !== cursor) {
        return r.start > cursor
          ? `${dayType}: khung ${toTime(cursor)}–${toTime(r.start)} chưa có giá`
          : `${dayType}: khung ${toTime(r.start)}–${toTime(r.end)} chồng lấn khung trước`;
      }
      cursor = r.end;
    }
    if (cursor !== closeMin) return `${dayType}: bảng giá phải kết thúc đúng giờ đóng cửa ${toTime(closeMin)}`;
  }
  return null;
}

function normalizeRules(input) {
  if (!Array.isArray(input) || !input.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'rules phải là mảng khung giá không rỗng');
  }
  return input.map((r, i) => {
    const label = `rules[${i}]`;
    if (!DAY_TYPES.includes(r.dayType)) throw new HttpError(400, 'VALIDATION_ERROR', `${label}.dayType phải là WEEKDAY hoặc WEEKEND`);
    const start = toMinutes(r.startTime, `${label}.startTime`);
    const end = toMinutes(r.endTime, `${label}.endTime`);
    assertHalfHour(start, `${label}.startTime`);
    assertHalfHour(end, `${label}.endTime`);
    if (end <= start) throw new HttpError(400, 'VALIDATION_ERROR', `${label}: giờ kết thúc phải sau giờ bắt đầu`);
    // BR18: VND số nguyên; bội số 1.000 để giá mỗi ô (nửa giờ) vẫn là số nguyên
    if (!Number.isInteger(r.pricePerHour) || r.pricePerHour <= 0 || r.pricePerHour % 1000 !== 0) {
      throw new HttpError(400, 'VALIDATION_ERROR', `${label}.pricePerHour phải là số nguyên dương, bội số của 1.000 VND`);
    }
    return { dayType: r.dayType, start, end, pricePerHour: r.pricePerHour };
  });
}

// US-M04: thay toàn bộ bảng giá của một sân trong một transaction
async function replaceForCourt(court, venue, input, actor) {
  const rules = normalizeRules(input);
  const error = coverageError(rules, toMinutes(venue.openTime), toMinutes(venue.closeTime));
  if (error) throw new HttpError(400, 'INVALID_PRICE_RULES', error);

  return withTransaction(async (conn) => {
    const oldRules = await listByCourt(court.id, conn);
    await conn.query('DELETE FROM price_rules WHERE court_id = ?', [court.id]);
    await conn.query(
      'INSERT INTO price_rules (court_id, day_type, start_time, end_time, price_per_hour, updated_by) VALUES ?',
      [rules.map((r) => [court.id, r.dayType, toTime(r.start), toTime(r.end), r.pricePerHour, actor.id])],
    );
    const newRules = await listByCourt(court.id, conn);
    const now = nowInVietnam();
    const [[{ kept }]] = await conn.query(
      `SELECT COUNT(*) AS kept FROM booking_slots WHERE court_id = ? AND slot_status IN ('HELD', 'CONFIRMED')
          AND (booking_date > ? OR (booking_date = ? AND end_time > ?))`,
      [court.id, now.date, now.date, `${now.time}:00`],
    );
    await audit.log(conn, {
      actorId: actor.id, venueId: court.venueId, actionType: 'UPDATE_PRICE', entityType: 'COURT', entityId: court.id,
      oldValues: oldRules.map(({ id, ...r }) => r), newValues: newRules.map(({ id, ...r }) => r),
    });
    return { rules: newRules, keptSlots: Number(kept) };
  });
}

// BR05: Thứ Bảy, Chủ Nhật và ngày lễ tính giá cuối tuần
async function resolveDayType(date, db = pool) {
  const [holidays] = await db.query('SELECT name FROM holidays WHERE holiday_date = ?', [date]);
  const holiday = holidays[0] ? holidays[0].name : null;
  return { dayType: holiday || isWeekend(date) ? 'WEEKEND' : 'WEEKDAY', holiday };
}

// Báo giá một khung giờ: tách thành ô 30 phút, mỗi ô lấy giá theo loại ngày và khung giờ chứa nó
async function quote(court, venue, { date, start, end }) {
  assertRequired({ date, start, end }, ['date', 'start', 'end']);
  assertDate(date);
  const s = toMinutes(start, 'start');
  const e = toMinutes(end, 'end');
  assertHalfHour(s, 'start');
  assertHalfHour(e, 'end');
  if (e <= s) throw new HttpError(400, 'VALIDATION_ERROR', 'end phải sau start');

  if (!venue.isActive || court.status !== 'ACTIVE') {
    throw new HttpError(409, 'COURT_UNAVAILABLE', `${court.name} hiện không nhận đặt sân`);
  }
  if (s < toMinutes(venue.openTime) || e > toMinutes(venue.closeTime)) {
    throw new HttpError(400, 'OUTSIDE_OPENING_HOURS', `Cơ sở mở cửa ${venue.openTime}–${venue.closeTime}`);
  }

  // BR02: thời lượng đặt tối thiểu / tối đa
  const [minMinutes, maxMinutes] = await Promise.all([
    configService.getNumber('MIN_BOOKING_MINUTES', 60),
    configService.getNumber('MAX_BOOKING_MINUTES', 180),
  ]);
  const duration = e - s;
  if (duration < minMinutes || duration > maxMinutes) {
    throw new HttpError(400, 'INVALID_DURATION', `Thời lượng đặt phải từ ${minMinutes} đến ${maxMinutes} phút`);
  }

  const { dayType, holiday } = await resolveDayType(date);
  const rules = (await listByCourt(court.id)).filter((r) => r.dayType === dayType);
  const slots = [];
  for (let m = s; m < e; m += 30) {
    const rule = rules.find((r) => toMinutes(r.startTime) <= m && m + 30 <= toMinutes(r.endTime));
    if (!rule) throw new HttpError(409, 'PRICE_NOT_CONFIGURED', `${court.name} chưa có giá cho ô ${toTime(m)} (${dayType})`);
    slots.push({ startTime: toTime(m), endTime: toTime(m + 30), price: rule.pricePerSlot });
  }

  return {
    courtId: court.id,
    venueId: court.venueId,
    date,
    dayType,
    holiday,
    durationMinutes: duration,
    slots,
    totalAmount: slots.reduce((sum, slot) => sum + slot.price, 0),
  };
}

module.exports = { listByCourt, coverageError, replaceForCourt, resolveDayType, quote };
