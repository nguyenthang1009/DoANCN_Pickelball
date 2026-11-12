const pool = require('../config/db');
const { toMinutes, toTime, assertDate, nowInVietnam } = require('../utils/time');
const priceRuleService = require('./priceRule.service');
const configService = require('./config.service');

// Giới hạn đặt sân hiển thị cho giao diện (đọc từ system_configs)
async function bookingLimits() {
  const [maxAdvanceDays, minMinutes, maxMinutes, holdMinutes, cancelDeadlineHours] = await Promise.all([
    configService.getNumber('MAX_ADVANCE_BOOKING_DAYS', 14),
    configService.getNumber('MIN_BOOKING_MINUTES', 60),
    configService.getNumber('MAX_BOOKING_MINUTES', 180),
    configService.getNumber('HOLD_DURATION_MINUTES', 10),
    configService.getNumber('ONLINE_CANCEL_DEADLINE_HOURS', 24),
  ]);
  return { maxAdvanceDays, minMinutes, maxMinutes, holdMinutes, cancelDeadlineHours };
}

// Ô đang bị chiếm: đã xác nhận, hoặc đang giữ chỗ mà chưa hết hạn
async function occupiedSlots(venueId, date, db = pool) {
  const [rows] = await db.query(
    `SELECT s.court_id, s.start_time, s.slot_status
       FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
      WHERE s.venue_id = ? AND s.booking_date = ?
        AND (s.slot_status = 'CONFIRMED' OR (s.slot_status = 'HELD' AND b.hold_expires_at > NOW()))`,
    [venueId, date],
  );
  return new Map(rows.map((r) => [`${r.court_id}_${toMinutes(r.start_time)}`, r.slot_status]));
}

// Ma trận lịch của một cơ sở trong một ngày: mỗi sân x mỗi ô 30 phút từ giờ mở đến giờ đóng cửa
async function getAvailability(venue, date) {
  assertDate(date);
  const [{ dayType, holiday }, limits, occupied] = await Promise.all([
    priceRuleService.resolveDayType(date), bookingLimits(), occupiedSlots(venue.id, date),
  ]);
  const [courtRows] = await pool.query(
    "SELECT id, name, court_type, status FROM courts WHERE venue_id = ? AND status <> 'INACTIVE' ORDER BY name",
    [venue.id],
  );
  const open = toMinutes(venue.openTime);
  const close = toMinutes(venue.closeTime);
  const now = nowInVietnam();
  const nowMin = toMinutes(now.time);

  const courts = await Promise.all(courtRows.map(async (c) => {
    const rules = (await priceRuleService.listByCourt(c.id)).filter((r) => r.dayType === dayType);
    const slots = [];
    for (let m = open; m < close; m += 30) {
      const rule = rules.find((r) => toMinutes(r.startTime) <= m && m + 30 <= toMinutes(r.endTime));
      const taken = occupied.get(`${c.id}_${m}`);
      let state = 'FREE';
      if (c.status !== 'ACTIVE') state = 'MAINTENANCE';
      else if (taken) state = taken === 'CONFIRMED' ? 'BOOKED' : 'HELD';
      else if (date < now.date || (date === now.date && m <= nowMin)) state = 'PAST';
      else if (!rule) state = 'UNPRICED';
      slots.push({ start: toTime(m), end: toTime(m + 30), state, price: rule ? rule.pricePerSlot : null });
    }
    return { id: c.id, name: c.name, courtType: c.court_type, status: c.status, slots };
  }));

  return { venue, date, dayType, holiday, now, limits, courts };
}

module.exports = { getAvailability, bookingLimits, occupiedSlots };
