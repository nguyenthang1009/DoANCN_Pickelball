const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { assertDate, toMinutes, nowInVietnam } = require('../utils/time');

// Doanh thu chỉ tính đơn đã thanh toán (kể cả đã nhận sân hoặc không đến); dịch vụ kèm đơn chưa thanh toán không tính
const PAID = "('PAID')";

// RBAC doanh thu: Staff xem ca của mình, Manager xem cơ sở mình, Admin xem toàn hệ thống (hoặc lọc một cơ sở)
function scopeOf(user, venueId) {
  if (user.role === 'ADMIN') return { venueId: venueId ? Number(venueId) : null, staffId: null };
  if (user.role === 'MANAGER') return { venueId: user.venueId, staffId: null };
  return { venueId: user.venueId, staffId: user.id };
}

// BR14, US-S08: doanh thu ca trực trong một ngày: đơn tạo tại quầy + dịch vụ bán tại quầy
async function shift(user, { date, venueId } = {}) {
  const day = date || nowInVietnam().date;
  assertDate(day);
  const scope = scopeOf(user, venueId);
  const where = (alias, staffCol) => [
    scope.venueId ? `${alias}.venue_id = ${pool.escape(scope.venueId)}` : '1=1',
    scope.staffId ? `${alias}.${staffCol} = ${pool.escape(scope.staffId)}` : '1=1',
  ].join(' AND ');

  const [courtRows] = await pool.query(
    `SELECT b.booking_code AS code, b.created_at AS at, b.total_court_amount AS amount, b.payment_method AS method, u.full_name AS staff,
            COALESCE(c.full_name, b.guest_name) AS customer
       FROM bookings b JOIN users u ON u.id = b.created_by LEFT JOIN users c ON c.id = b.customer_id
      WHERE b.booking_source = 'POS' AND b.payment_status IN ${PAID} AND DATE(b.created_at) = ? AND ${where('b', 'created_by')}
      ORDER BY b.created_at`,
    [day],
  );
  const [serviceRows] = await pool.query(
    `SELECT o.id, o.created_at AS at, o.total_service_amount AS amount, o.payment_method AS method, u.full_name AS staff, b.booking_code AS code
       FROM service_orders o JOIN users u ON u.id = o.sold_by LEFT JOIN bookings b ON b.id = o.booking_id
      WHERE DATE(o.created_at) = ? AND (o.booking_id IS NULL OR b.payment_status IN ${PAID}) AND ${where('o', 'sold_by')}
      ORDER BY o.created_at`,
    [day],
  );
  const lines = [
    ...courtRows.map((r) => ({ type: 'COURT', label: `Tiền sân ${r.code} · ${r.customer}`, at: r.at, amount: r.amount, method: r.method, staff: r.staff })),
    ...serviceRows.map((r) => ({ type: 'SERVICE', label: r.code ? `Dịch vụ kèm ${r.code}` : `Bán lẻ dịch vụ #${r.id}`, at: r.at, amount: r.amount, method: r.method, staff: r.staff })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const sum = (f) => lines.filter(f).reduce((s, l) => s + l.amount, 0);
  return {
    date: day,
    scope: user.role === 'STAFF' ? 'Ca của tôi' : scope.venueId ? `Cơ sở #${scope.venueId}` : 'Toàn hệ thống',
    totals: {
      court: sum((l) => l.type === 'COURT'),
      service: sum((l) => l.type === 'SERVICE'),
      cash: sum((l) => l.method === 'CASH'),
      transfer: sum((l) => l.method === 'VIETQR'),
      all: sum(() => true),
      count: lines.length,
    },
    lines,
  };
}

const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

// Dashboard Manager/Admin: doanh thu theo ngày, tỷ lệ lấp đầy theo sân, giờ cao điểm, đơn chờ hoàn tiền
async function revenue(user, { from, to, venueId } = {}) {
  if (!user.permissions.includes('report.revenue')) throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền xem báo cáo này');
  const end = to || nowInVietnam().date;
  const start = from || addDays(end, -6);
  assertDate(start, 'from');
  assertDate(end, 'to');
  if (start > end) throw new HttpError(400, 'VALIDATION_ERROR', 'from phải trước to');
  const days = Math.round((Date.parse(end) - Date.parse(start)) / 86400e3) + 1;
  if (days > 92) throw new HttpError(400, 'VALIDATION_ERROR', 'Khoảng thời gian tối đa 92 ngày');
  const { venueId: scopeVenue } = scopeOf(user, venueId);
  const v = (alias) => (scopeVenue ? `AND ${alias}.venue_id = ${pool.escape(scopeVenue)}` : '');

  const [court] = await pool.query(
    `SELECT b.booking_date AS d, SUM(b.total_court_amount) AS amount, COUNT(*) AS bookings
       FROM bookings b WHERE b.payment_status IN ${PAID} AND b.booking_date BETWEEN ? AND ? ${v('b')} GROUP BY b.booking_date`,
    [start, end],
  );
  const [service] = await pool.query(
    `SELECT DATE_FORMAT(o.created_at, '%Y-%m-%d') AS d, SUM(o.total_service_amount) AS amount
       FROM service_orders o LEFT JOIN bookings b ON b.id = o.booking_id
      WHERE DATE(o.created_at) BETWEEN ? AND ? AND (o.booking_id IS NULL OR b.payment_status IN ${PAID}) ${v('o')}
      GROUP BY DATE_FORMAT(o.created_at, '%Y-%m-%d')`,
    [start, end],
  );
  const daily = Array.from({ length: days }, (_, i) => {
    const d = addDays(start, i);
    const c = court.find((r) => r.d === d);
    const s = service.find((r) => r.d === d);
    return { date: d, court: Number(c?.amount || 0), service: Number(s?.amount || 0), bookings: Number(c?.bookings || 0) };
  });

  // Tỷ lệ lấp đầy = số ô đã xác nhận / tổng ô mở cửa trong khoảng ngày (sân không ngừng hoạt động)
  const [courts] = await pool.query(
    `SELECT c.id, c.name, c.status, v.name AS venue_name, v.open_time, v.close_time,
            (SELECT COUNT(*) FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
              WHERE s.court_id = c.id AND s.slot_status = 'CONFIRMED' AND b.payment_status IN ${PAID}
                AND s.booking_date BETWEEN ? AND ?) AS used
       FROM courts c JOIN venues v ON v.id = c.venue_id
      WHERE c.status <> 'INACTIVE' ${v('c')} ORDER BY v.id, c.name`,
    [start, end],
  );
  const occupancy = courts.map((c) => {
    const capacity = ((toMinutes(c.close_time) - toMinutes(c.open_time)) / 30) * days;
    return { courtId: c.id, court: c.name, venue: c.venue_name, status: c.status, usedSlots: Number(c.used), capacity, rate: capacity ? Number(c.used) / capacity : 0 };
  });

  const [hours] = await pool.query(
    `SELECT TIME_FORMAT(s.start_time, '%H:00') AS hour, COUNT(*) AS slots
       FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
      WHERE s.slot_status = 'CONFIRMED' AND b.payment_status IN ${PAID} AND s.booking_date BETWEEN ? AND ? ${v('s')}
      GROUP BY TIME_FORMAT(s.start_time, '%H:00') ORDER BY hour`,
    [start, end],
  );
  const [[refund]] = await pool.query(
    `SELECT COUNT(*) AS n, COALESCE(SUM(b.total_amount), 0) AS amount FROM bookings b
      WHERE b.payment_status IN ('REFUND_PENDING', 'CONFLICT_REFUND_PENDING') ${v('b')}`,
  );
  let byVenue = [];
  if (user.role === 'ADMIN' && !scopeVenue) {
    const [rows] = await pool.query(
      `SELECT v.id, v.name, COALESCE(SUM(b.total_amount), 0) AS amount, COUNT(b.id) AS bookings
         FROM venues v LEFT JOIN bookings b ON b.venue_id = v.id AND b.payment_status IN ${PAID} AND b.booking_date BETWEEN ? AND ?
        GROUP BY v.id, v.name ORDER BY v.id`,
      [start, end],
    );
    byVenue = rows.map((r) => ({ venueId: r.id, venue: r.name, amount: Number(r.amount), bookings: Number(r.bookings) }));
  }

  const totalCourt = daily.reduce((s, d) => s + d.court, 0);
  const totalService = daily.reduce((s, d) => s + d.service, 0);
  const used = occupancy.filter((o) => o.status === 'ACTIVE');
  return {
    from: start,
    to: end,
    venueId: scopeVenue,
    totals: {
      revenue: totalCourt + totalService,
      court: totalCourt,
      service: totalService,
      bookings: daily.reduce((s, d) => s + d.bookings, 0),
      occupancyRate: used.length ? used.reduce((s, o) => s + o.usedSlots, 0) / used.reduce((s, o) => s + o.capacity, 0) : 0,
      refundPending: Number(refund.n),
      refundPendingAmount: Number(refund.amount),
    },
    daily,
    occupancy,
    peakHours: hours.map((h) => ({ hour: h.hour, slots: Number(h.slots) })),
    byVenue,
  };
}

module.exports = { shift, revenue };
