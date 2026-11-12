const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { toMinutes, toTime, hhmm, nowInVietnam } = require('../utils/time');
const { isPhone } = require('../utils/validators');
const { qrSecret } = require('../config/env');
const realtime = require('../realtime');
const audit = require('./audit.service');
const configService = require('./config.service');
const courtService = require('./court.service');
const venueService = require('./venue.service');
const priceRuleService = require('./priceRule.service');
const availabilityService = require('./availability.service');
const invoiceService = require('./invoice.service');

const addDays = (date, n) => { const d = new Date(`${date}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
// Thời điểm (ms) của một mốc giờ trong ngày theo giờ Việt Nam
const vnTimestamp = (date, time) => Date.parse(`${date}T${time}:00+07:00`);

// FR05: mã đơn không lộ số thứ tự, VD PKB-261102-8F3A
const newBookingCode = (date) => `PKB-${date.slice(2, 4)}${date.slice(5, 7)}${date.slice(8, 10)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

// BR13: chữ ký HMAC của mã đơn, in trong mã QR check-in để chống làm giả vé
const signBookingCode = (code) => crypto.createHmac('sha256', qrSecret).update(code).digest('base64url').slice(0, 22);
const qrPayloadOf = (code) => `${code}.${signBookingCode(code)}`;

function toBooking(row, slots = []) {
  const first = slots[0];
  const last = slots[slots.length - 1];
  return {
    id: row.id,
    bookingCode: row.booking_code,
    venueId: row.venue_id,
    venueName: row.venue_name,
    bookingDate: row.booking_date,
    source: row.booking_source,
    customerId: row.customer_id,
    customerName: row.customer_name || row.guest_name,
    customerPhone: row.customer_phone || row.guest_phone,
    isGuest: !row.customer_id,
    createdBy: row.created_by,
    totalCourtAmount: row.total_court_amount,
    totalServiceAmount: row.total_service_amount,
    totalAmount: row.total_amount,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    checkinStatus: row.checkin_status,
    holdExpiresAt: row.hold_expires_at,
    holdSecondsLeft: row.hold_seconds_left !== undefined && row.hold_seconds_left !== null ? Math.max(0, row.hold_seconds_left) : null,
    checkedInAt: row.checked_in_at,
    cancelledAt: row.cancelled_at,
    cancelReason: row.cancel_reason,
    refundedAt: row.refunded_at,
    refundNote: row.refund_note,
    createdAt: row.created_at,
    courtId: first ? first.courtId : null,
    courtName: first ? first.courtName : null,
    startTime: first ? first.startTime : null,
    endTime: last ? last.endTime : null,
    slots,
    qrPayload: row.payment_status === 'PAID' ? qrPayloadOf(row.booking_code) : null,
  };
}

const BOOKING_SELECT = `
  SELECT b.*, v.name AS venue_name, u.full_name AS customer_name, u.phone AS customer_phone,
         TIMESTAMPDIFF(SECOND, NOW(), b.hold_expires_at) AS hold_seconds_left
    FROM bookings b JOIN venues v ON v.id = b.venue_id LEFT JOIN users u ON u.id = b.customer_id`;

async function slotsOf(bookingIds, db = pool) {
  if (!bookingIds.length) return new Map();
  const [rows] = await db.query(
    `SELECT s.booking_id, s.court_id, c.name AS court_name, s.start_time, s.end_time, s.price_snapshot, s.slot_status
       FROM booking_slots s JOIN courts c ON c.id = s.court_id
      WHERE s.booking_id IN (?) ORDER BY s.court_id, s.start_time`,
    [bookingIds],
  );
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.booking_id)) map.set(r.booking_id, []);
    map.get(r.booking_id).push({ courtId: r.court_id, courtName: r.court_name, startTime: hhmm(r.start_time), endTime: hhmm(r.end_time), price: r.price_snapshot, status: r.slot_status });
  }
  return map;
}

async function hydrate(rows, db = pool) {
  const slots = await slotsOf(rows.map((r) => r.id), db);
  return rows.map((r) => toBooking(r, slots.get(r.id) || []));
}

async function findByCode(code, db = pool) {
  const [rows] = await db.query(`${BOOKING_SELECT} WHERE b.booking_code = ?`, [code]);
  if (!rows[0]) throw new HttpError(404, 'BOOKING_NOT_FOUND', 'Không tìm thấy đơn đặt sân');
  return (await hydrate(rows, db))[0];
}

// Khách chỉ xem đơn của mình; nhân sự chỉ xem đơn thuộc cơ sở của mình; Admin xem tất cả
function assertCanView(booking, user) {
  if (user.role === 'ADMIN') return;
  if (user.role === 'CUSTOMER' && booking.customerId === user.id) return;
  if ((user.role === 'STAFF' || user.role === 'MANAGER') && booking.venueId === user.venueId) return;
  throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền xem đơn này');
}

// Kèm quy tắc đọc từ system_configs để giao diện không phải viết cứng (BR11, BR12)
async function withRules(bookings) {
  const [cancelDeadlineHours, checkinEarlyMinutes] = await Promise.all([
    configService.getNumber('ONLINE_CANCEL_DEADLINE_HOURS', 24),
    configService.getNumber('CHECKIN_EARLY_WINDOW_MINUTES', 30),
  ]);
  const ids = bookings.map((b) => b.id);
  const [invoices] = ids.length ? await pool.query("SELECT booking_id, invoice_no FROM invoices WHERE invoice_type = 'SALE' AND booking_id IN (?)", [ids]) : [[]];
  const invoiceNoOf = new Map(invoices.map((i) => [i.booking_id, i.invoice_no]));
  return bookings.map((b) => {
    const hoursLeft = b.startTime ? (vnTimestamp(b.bookingDate, b.startTime) - Date.now()) / 3600000 : 0;
    const paidInTime = b.paymentStatus === 'PAID' && b.checkinStatus === 'PENDING' && hoursLeft >= cancelDeadlineHours;
    return { ...b, invoiceNo: invoiceNoOf.get(b.id) ?? null, cancelDeadlineHours, checkinEarlyMinutes, canCancelOnline: b.paymentStatus === 'PENDING_PAYMENT' || paidInTime };
  });
}

async function getForUser(code, user) {
  const booking = await findByCode(code);
  assertCanView(booking, user);
  return (await withRules([booking]))[0];
}

async function listMine(user) {
  const [rows] = await pool.query(`${BOOKING_SELECT} WHERE b.customer_id = ? ORDER BY b.booking_date DESC, b.created_at DESC LIMIT 100`, [user.id]);
  return withRules(await hydrate(rows));
}

async function listByVenueDate(venueId, date) {
  const [rows] = await pool.query(`${BOOKING_SELECT} WHERE b.venue_id = ? AND b.booking_date = ? ORDER BY b.created_at`, [venueId, date]);
  const list = await hydrate(rows);
  return list.sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
}

// BR08: giữ chỗ quá hạn chưa thanh toán -> EXPIRED, giải phóng ô (active_slot_lock về NULL)
async function expireHolds(conn, { venueId, date } = {}) {
  const where = ["payment_status = 'PENDING_PAYMENT'", 'hold_expires_at <= NOW()'];
  const params = [];
  if (venueId) { where.push('venue_id = ?'); params.push(venueId); }
  if (date) { where.push('booking_date = ?'); params.push(date); }
  const [rows] = await conn.query(`SELECT id, booking_code, venue_id, booking_date FROM bookings WHERE ${where.join(' AND ')} FOR UPDATE`, params);
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  await conn.query("UPDATE bookings SET payment_status = 'EXPIRED' WHERE id IN (?)", [ids]);
  await conn.query("UPDATE booking_slots SET slot_status = 'CANCELLED' WHERE booking_id IN (?) AND slot_status = 'HELD'", [ids]);
  return rows.map((r) => ({ bookingCode: r.booking_code, venueId: r.venue_id, date: r.booking_date }));
}

// BR12: đơn đã thanh toán, quá giờ kết thúc mà chưa check-in -> NO_SHOW
async function markNoShows(conn) {
  const now = nowInVietnam();
  const [rows] = await conn.query(
    `SELECT b.id, b.booking_code, b.venue_id, b.booking_date FROM bookings b
      WHERE b.payment_status = 'PAID' AND b.checkin_status = 'PENDING'
        AND (b.booking_date < ? OR (b.booking_date = ? AND
             (SELECT MAX(s.end_time) FROM booking_slots s WHERE s.booking_id = b.id) <= ?))
      FOR UPDATE`,
    [now.date, now.date, `${now.time}:00`],
  );
  if (rows.length) await conn.query("UPDATE bookings SET checkin_status = 'NO_SHOW' WHERE id IN (?)", [rows.map((r) => r.id)]);
  return rows.map((r) => ({ bookingCode: r.booking_code, venueId: r.venue_id, date: r.booking_date }));
}

function notify(changes, reason) {
  const seen = new Set();
  for (const c of changes) {
    realtime.emitBookingChanged(c.bookingCode, c.status || reason);
    const key = `${c.venueId}_${c.date}`;
    if (!seen.has(key)) { seen.add(key); realtime.emitSlotsChanged(c.venueId, c.date, reason); }
  }
}

// Kiểm tra và chuẩn hóa thông tin khách vãng lai cho đơn tại quầy (G1, Q9)
async function resolvePosCustomer(body) {
  const guestName = typeof body.guestName === 'string' ? body.guestName.trim() : '';
  const guestPhone = typeof body.guestPhone === 'string' ? body.guestPhone.trim() : '';
  if (!guestName) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần nhập tên khách');
  if (!isPhone(guestPhone)) throw new HttpError(400, 'VALIDATION_ERROR', 'Số điện thoại khách phải gồm 10 chữ số, bắt đầu bằng 0');
  // Khách đã có tài khoản thì gắn đơn vào tài khoản để họ thấy trong lịch sử
  const [users] = await pool.query("SELECT id FROM users WHERE phone = ? AND role = 'CUSTOMER'", [guestPhone]);
  return { customerId: users[0] ? users[0].id : null, guestName, guestPhone };
}

// US-C04, G9: giữ chỗ một khung giờ liền nhau trên một sân.
// Khách đặt online -> giữ 10 phút chờ VietQR. Nhân sự đặt tại quầy -> tiền mặt xác nhận ngay hoặc VietQR.
// extra(conn, booking) cho phép bán kèm dịch vụ trong cùng transaction (màn POS).
async function createBooking(actor, body, { extra } = {}) {
  const courtId = Number(body.courtId);
  if (!Number.isInteger(courtId)) throw new HttpError(400, 'VALIDATION_ERROR', 'courtId là bắt buộc');
  const court = await courtService.getOrThrow(courtId);
  const venue = await venueService.getOrThrow(court.venueId);
  const isPos = actor.role !== 'CUSTOMER';
  if (!actor.permissions.includes(isPos ? 'pos.create' : 'booking.create')) {
    throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện chức năng này');
  }
  if (isPos && actor.role !== 'ADMIN' && actor.venueId !== court.venueId) {
    throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được đặt sân tại cơ sở của mình');
  }

  // Báo giá kiểm tra luôn sân đang hoạt động, giờ mở cửa, bội số 30 phút, thời lượng 60–180 phút
  const quote = await priceRuleService.quote(court, venue, { date: body.date, start: body.start, end: body.end });
  const now = nowInVietnam();
  if (vnTimestamp(quote.date, quote.slots[0].startTime) <= Date.now()) {
    throw new HttpError(400, 'SLOT_IN_PAST', 'Không thể đặt khung giờ đã qua');
  }
  // BR03: chỉ đặt trước tối đa N ngày (tính cả hôm nay)
  const maxDays = await configService.getNumber('MAX_ADVANCE_BOOKING_DAYS', 14);
  if (quote.date > addDays(now.date, maxDays - 1)) {
    throw new HttpError(400, 'TOO_FAR_AHEAD', `Chỉ nhận đặt trước tối đa ${maxDays} ngày`);
  }

  let customer = { customerId: actor.id, guestName: null, guestPhone: null };
  let paymentMethod = 'VIETQR';
  if (isPos) {
    customer = await resolvePosCustomer(body);
    paymentMethod = body.paymentMethod === 'VIETQR' ? 'VIETQR' : 'CASH';
  }
  const paidNow = isPos && paymentMethod === 'CASH';
  const holdMinutes = await configService.getNumber('HOLD_DURATION_MINUTES', 10);

  // Giải phóng các ô giữ chỗ đã quá hạn trong ngày này trước, để khóa UNIQUE không chặn nhầm.
  // Chạy ở transaction riêng: quét FOR UPDATE giữ khóa khoảng chỉ mục, để chung sẽ gây deadlock với các INSERT song song.
  const expired = await withTransaction((conn) => expireHolds(conn, { venueId: venue.id, date: quote.date }), { retries: 3 });

  const { code, changes } = await withTransaction(async (conn) => {
    let bookingId;
    let bookingCode;
    for (let attempt = 0; !bookingId; attempt++) {
      bookingCode = newBookingCode(quote.date);
      try {
        const [res] = await conn.query(
          `INSERT INTO bookings (booking_code, venue_id, booking_date, booking_source, customer_id, guest_name, guest_phone, created_by,
                                 total_court_amount, payment_method, payment_status, hold_expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${paidNow ? 'NULL' : 'DATE_ADD(NOW(), INTERVAL ? MINUTE)'})`,
          [bookingCode, venue.id, quote.date, isPos ? 'POS' : 'ONLINE', customer.customerId, customer.guestName, customer.guestPhone, actor.id,
            quote.totalAmount, paymentMethod, paidNow ? 'PAID' : 'PENDING_PAYMENT', ...(paidNow ? [] : [holdMinutes])],
        );
        bookingId = res.insertId;
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY' || attempt >= 4) throw err; // trùng mã đơn ngẫu nhiên thì sinh lại
      }
    }

    // G9, BR09: khóa UNIQUE active_slot_lock chặn tuyệt đối hai đơn cùng giữ một ô
    try {
      await conn.query(
        `INSERT INTO booking_slots (booking_id, venue_id, court_id, booking_date, start_time, end_time, price_snapshot, slot_status) VALUES ?`,
        [quote.slots.map((s) => [bookingId, venue.id, court.id, quote.date, s.startTime, s.endTime, s.price, paidNow ? 'CONFIRMED' : 'HELD'])],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'SLOT_TAKEN', 'Khung giờ này vừa có người giữ chỗ, vui lòng chọn khung khác');
      throw err;
    }

    if (paidNow) await conn.query('UPDATE bookings SET qr_signature = ? WHERE id = ?', [signBookingCode(bookingCode), bookingId]);
    if (extra) await extra(conn, { id: bookingId, bookingCode, venueId: venue.id, paymentMethod });
    if (paidNow) await invoiceService.issueForBooking(conn, bookingId, actor.id);
    if (isPos) {
      await audit.log(conn, { actorId: actor.id, venueId: venue.id, actionType: 'POS_BOOKING', entityType: 'BOOKING', entityId: bookingId, newValues: { bookingCode, paymentMethod, courtId: court.id, date: quote.date, start: body.start, end: body.end } });
    }
    return { code: bookingCode, changes: [...expired, { bookingCode, venueId: venue.id, date: quote.date, status: paidNow ? 'PAID' : 'PENDING_PAYMENT' }] };
  }, { retries: 3 });

  notify(changes, 'booking');
  return findByCode(code);
}

// BR11, US-C05: khách hủy đơn. Chưa thanh toán -> hủy ngay. Đã thanh toán -> chỉ hủy online trước giờ chơi >= 24 giờ, chờ hoàn tiền.
// Manager/Admin hủy được đơn đã thanh toán bất kỳ lúc nào trước khi nhận sân (cần lý do), đơn chuyển chờ hoàn tiền.
async function cancelBooking(code, user, { reason } = {}) {
  const deadlineHours = await configService.getNumber('ONLINE_CANCEL_DEADLINE_HOURS', 24);
  const result = await withTransaction(async (conn) => {
    const booking = await findByCode(code, conn);
    assertCanView(booking, user);
    if (!user.permissions.includes(user.role === 'CUSTOMER' ? 'booking.cancel_own' : 'booking.cancel')) {
      throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền hủy đơn, hãy báo Quản lý');
    }
    await conn.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [booking.id]);

    let newStatus;
    if (booking.paymentStatus === 'PENDING_PAYMENT') newStatus = 'CANCELLED';
    else if (booking.paymentStatus === 'PAID' && booking.checkinStatus === 'PENDING') {
      if (user.role === 'CUSTOMER') {
        const hoursLeft = (vnTimestamp(booking.bookingDate, booking.startTime) - Date.now()) / 3600000;
        if (hoursLeft < deadlineHours) {
          throw new HttpError(409, 'CANCEL_DEADLINE_PASSED', `Chỉ hủy online được trước giờ chơi ít nhất ${deadlineHours} giờ, vui lòng liên hệ cơ sở`);
        }
      } else if (typeof reason !== 'string' || !reason.trim()) {
        throw new HttpError(400, 'VALIDATION_ERROR', 'Cần nhập lý do hủy đơn đã thanh toán');
      }
      newStatus = 'REFUND_PENDING';
    } else {
      throw new HttpError(409, 'CANNOT_CANCEL', 'Đơn ở trạng thái hiện tại không hủy được');
    }

    const why = (reason && reason.trim()) || (user.role === 'CUSTOMER' ? 'Khách tự hủy' : 'Quản lý hủy');
    await conn.query(
      'UPDATE bookings SET payment_status = ?, cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ? WHERE id = ?',
      [newStatus, user.id, why.slice(0, 255), booking.id],
    );
    await conn.query("UPDATE booking_slots SET slot_status = 'CANCELLED' WHERE booking_id = ?", [booking.id]);
    await audit.log(conn, { actorId: user.id, venueId: booking.venueId, actionType: 'CANCEL_BOOKING', entityType: 'BOOKING', entityId: booking.id, oldValues: { paymentStatus: booking.paymentStatus }, newValues: { paymentStatus: newStatus }, reason: why });
    return { booking, newStatus };
  });
  notify([{ bookingCode: code, venueId: result.booking.venueId, date: result.booking.bookingDate, status: result.newStatus }], 'cancel');
  return findByCode(code);
}

// BR17: các đơn sắp tới trên sân sắp bảo trì, kèm những sân cùng cơ sở còn trống đủ mọi khung giờ của đơn
async function courtImpact(court) {
  const now = nowInVietnam();
  const [rows] = await pool.query(
    `${BOOKING_SELECT}
      WHERE b.payment_status IN ('PAID', 'PENDING_PAYMENT') AND b.id IN (
        SELECT s.booking_id FROM booking_slots s
         WHERE s.court_id = ? AND s.slot_status IN ('HELD', 'CONFIRMED')
           AND (s.booking_date > ? OR (s.booking_date = ? AND s.start_time >= ?)))
      ORDER BY b.booking_date, b.id`,
    [court.id, now.date, now.date, now.time],
  );
  const bookings = await hydrate(rows);
  const others = (await courtService.listByVenue(court.venueId)).filter((c) => c.id !== court.id && c.status === 'ACTIVE');
  const occupiedByDate = new Map();
  for (const date of new Set(bookings.map((b) => b.bookingDate))) {
    occupiedByDate.set(date, await availabilityService.occupiedSlots(court.venueId, date));
  }
  return bookings.map((b) => {
    const occupied = occupiedByDate.get(b.bookingDate);
    const free = (c) => b.slots.every((s) => !occupied.has(`${c.id}_${toMinutes(s.startTime)}`));
    return {
      bookingCode: b.bookingCode, customerName: b.customerName, customerPhone: b.customerPhone, bookingDate: b.bookingDate,
      startTime: b.startTime, endTime: b.endTime, paymentStatus: b.paymentStatus, alternatives: others.filter(free).map((c) => ({ id: c.id, name: c.name })),
    };
  });
}

// BR17: đổi đơn sang sân khác cùng cơ sở, giữ nguyên giá đã chốt. Khóa UNIQUE active_slot_lock chặn đổi vào ô đã có người.
async function moveBooking(code, { courtId }, actor) {
  const targetId = Number(courtId);
  if (!Number.isInteger(targetId)) throw new HttpError(400, 'VALIDATION_ERROR', 'courtId là bắt buộc');
  const booking = await withTransaction(async (conn) => {
    const current = await findByCode(code, conn);
    assertCanView(current, actor);
    await conn.query('SELECT id FROM bookings WHERE id = ? FOR UPDATE', [current.id]);
    await expireHolds(conn, { venueId: current.venueId, date: current.bookingDate });
    const fresh = await findByCode(code, conn);
    if (!['PENDING_PAYMENT', 'PAID'].includes(fresh.paymentStatus) || fresh.checkinStatus !== 'PENDING') {
      throw new HttpError(409, 'CANNOT_MOVE', 'Đơn ở trạng thái hiện tại không đổi sân được');
    }
    const target = await courtService.getOrThrow(targetId, conn);
    if (target.venueId !== fresh.venueId) throw new HttpError(400, 'VALIDATION_ERROR', 'Chỉ đổi sang sân cùng cơ sở');
    if (target.status !== 'ACTIVE') throw new HttpError(409, 'COURT_NOT_ACTIVE', `${target.name} không ở trạng thái hoạt động`);
    if (target.id === fresh.courtId) throw new HttpError(409, 'SAME_COURT', 'Đơn đang ở sân này');
    try {
      await conn.query("UPDATE booking_slots SET court_id = ? WHERE booking_id = ? AND slot_status IN ('HELD', 'CONFIRMED')", [target.id, fresh.id]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'SLOT_TAKEN', `${target.name} đã có người đặt trong khung giờ này`);
      throw err;
    }
    await audit.log(conn, { actorId: actor.id, venueId: fresh.venueId, actionType: 'MOVE_BOOKING', entityType: 'BOOKING', entityId: fresh.id, oldValues: { courtId: fresh.courtId }, newValues: { courtId: target.id } });
    return fresh;
  }, { retries: 3 });
  notify([{ bookingCode: code, venueId: booking.venueId, date: booking.bookingDate, status: booking.paymentStatus }], 'move');
  return findByCode(code);
}

// UC20, US-M10: Manager xác nhận đã hoàn tiền thủ công cho khách
async function confirmRefund(code, user, { note } = {}) {
  await withTransaction(async (conn) => {
    const booking = await findByCode(code, conn);
    assertCanView(booking, user);
    if (!['REFUND_PENDING', 'CONFLICT_REFUND_PENDING'].includes(booking.paymentStatus)) {
      throw new HttpError(409, 'NOT_REFUNDABLE', 'Đơn không ở trạng thái chờ hoàn tiền');
    }
    await invoiceService.issueCredit(conn, booking, user.id);
    const memo = (typeof note === 'string' && note.trim()) || 'Đã hoàn tiền';
    await conn.query("UPDATE bookings SET payment_status = 'REFUNDED', refunded_at = NOW(), refunded_by = ?, refund_note = ? WHERE id = ?", [user.id, memo.slice(0, 255), booking.id]);
    await audit.log(conn, { actorId: user.id, venueId: booking.venueId, actionType: 'CONFIRM_REFUND', entityType: 'BOOKING', entityId: booking.id, oldValues: { paymentStatus: booking.paymentStatus }, newValues: { paymentStatus: 'REFUNDED' }, reason: memo });
  });
  return findByCode(code);
}

// Danh sách đơn chờ hoàn tiền của một cơ sở (hoặc toàn chuỗi với Admin)
async function listRefunds(user, venueId) {
  const scope = user.role === 'ADMIN' ? (venueId ? Number(venueId) : null) : user.venueId;
  const [rows] = await pool.query(
    `${BOOKING_SELECT} WHERE b.payment_status IN ('REFUND_PENDING', 'CONFLICT_REFUND_PENDING') ${scope ? 'AND b.venue_id = ?' : ''} ORDER BY b.cancelled_at`,
    scope ? [scope] : [],
  );
  return hydrate(rows);
}

// Job nền: chạy định kỳ để hết hạn giữ chỗ và đánh dấu không đến
async function runHousekeeping() {
  const changes = await withTransaction(async (conn) => [...await expireHolds(conn), ...await markNoShows(conn)]);
  if (changes.length) notify(changes, 'housekeeping');
  return changes.length;
}

module.exports = {
  createBooking, cancelBooking, confirmRefund, moveBooking, courtImpact, getForUser, findByCode, listMine, listByVenueDate, listRefunds,
  runHousekeeping, expireHolds, signBookingCode, qrPayloadOf, assertCanView, vnTimestamp, toTime, toMinutes,
};
