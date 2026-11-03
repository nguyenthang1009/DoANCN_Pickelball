const crypto = require('crypto');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { nowInVietnam } = require('../utils/time');
const realtime = require('../realtime');
const audit = require('./audit.service');
const configService = require('./config.service');
const bookingService = require('./booking.service');

// Mã QR trên vé có dạng "<mã đơn>.<chữ ký HMAC>"; nhập tay chỉ cần mã đơn
function parseInput({ qr, code }) {
  if (typeof qr === 'string' && qr.trim()) {
    const [bookingCode, signature] = qr.trim().split('.');
    const expected = bookingCode ? bookingService.signBookingCode(bookingCode) : '';
    const valid = signature && signature.length === expected.length && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
    if (!valid) throw new HttpError(400, 'INVALID_QR', 'Mã QR không hợp lệ hoặc đã bị chỉnh sửa');
    return { bookingCode, method: 'QR' };
  }
  if (typeof code === 'string' && code.trim()) return { bookingCode: code.trim().toUpperCase(), method: 'MANUAL' };
  throw new HttpError(400, 'VALIDATION_ERROR', 'Cần quét mã QR hoặc nhập mã đơn');
}

// BR12: chỉ nhận sân cho đơn đã thanh toán, đúng ngày, trong khung [giờ bắt đầu - 30 phút, giờ kết thúc)
async function eligibility(booking) {
  const early = await configService.getNumber('CHECKIN_EARLY_WINDOW_MINUTES', 30);
  const now = nowInVietnam();
  const start = bookingService.vnTimestamp(booking.bookingDate, booking.startTime);
  const end = bookingService.vnTimestamp(booking.bookingDate, booking.endTime);
  const opensAt = new Date(start - early * 60000 + 7 * 3600e3).toISOString().slice(11, 16);
  if (booking.paymentStatus !== 'PAID') return { canCheckIn: false, reason: 'Đơn chưa thanh toán hoặc đã hủy' };
  if (booking.checkinStatus === 'CHECKED_IN') return { canCheckIn: false, reason: 'Đơn đã nhận sân rồi' };
  if (booking.checkinStatus === 'NO_SHOW') return { canCheckIn: false, reason: 'Đơn đã quá giờ, đánh dấu không đến' };
  if (booking.bookingDate !== now.date) return { canCheckIn: false, reason: `Đơn dành cho ngày ${booking.bookingDate}, không phải hôm nay` };
  if (Date.now() < start - early * 60000) return { canCheckIn: false, reason: `Chưa tới giờ nhận sân, mở check-in từ ${opensAt}` };
  if (Date.now() >= end) return { canCheckIn: false, reason: 'Đã quá giờ kết thúc' };
  return { canCheckIn: true, reason: null, opensAt };
}

function assertStaffOfVenue(booking, user) {
  if (user.role !== 'ADMIN' && booking.venueId !== user.venueId) {
    throw new HttpError(403, 'FORBIDDEN', 'Đơn thuộc cơ sở khác');
  }
}

async function lookup(input, user) {
  const { bookingCode, method } = parseInput(input);
  const booking = await bookingService.findByCode(bookingCode);
  assertStaffOfVenue(booking, user);
  return { booking, method, ...(await eligibility(booking)) };
}

// UC11: lễ tân xác nhận khách nhận sân
async function checkIn(code, user) {
  const booking = await bookingService.findByCode(code);
  assertStaffOfVenue(booking, user);
  const result = await withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT checkin_status FROM bookings WHERE id = ? FOR UPDATE', [booking.id]);
    const fresh = { ...booking, checkinStatus: rows[0].checkin_status };
    const check = await eligibility(fresh);
    if (!check.canCheckIn) throw new HttpError(409, 'CANNOT_CHECK_IN', check.reason);
    await conn.query("UPDATE bookings SET checkin_status = 'CHECKED_IN', checked_in_at = NOW(), checked_in_by = ? WHERE id = ?", [user.id, booking.id]);
    await audit.log(conn, { actorId: user.id, venueId: booking.venueId, actionType: 'CHECK_IN', entityType: 'BOOKING', entityId: booking.id, newValues: { checkinStatus: 'CHECKED_IN' } });
    return true;
  });
  if (result) realtime.emitBookingChanged(code, 'CHECKED_IN');
  return bookingService.findByCode(code);
}

module.exports = { lookup, checkIn, eligibility };
