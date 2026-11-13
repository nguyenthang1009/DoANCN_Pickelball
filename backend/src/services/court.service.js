const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { nowInVietnam } = require('../utils/time');
const audit = require('./audit.service');

const COURT_TYPES = ['INDOOR', 'OUTDOOR'];
const STATUSES = ['ACTIVE', 'MAINTENANCE', 'INACTIVE'];

function toCourt(row) {
  return { id: row.id, venueId: row.venue_id, name: row.name, courtType: row.court_type, status: row.status };
}

async function listByVenue(venueId) {
  const [rows] = await pool.query('SELECT * FROM courts WHERE venue_id = ? ORDER BY name', [venueId]);
  return rows.map(toCourt);
}

// Đơn đã thanh toán đang diễn ra trên sân (đã tới giờ, chưa hết giờ), hoặc khách đã nhận sân mà chưa hết giờ chơi
async function activeBookingOn(courtId, db = pool) {
  const now = nowInVietnam();
  const t = `${now.time}:00`;
  const [rows] = await db.query(
    `SELECT b.booking_code, TIME_FORMAT(MIN(s.start_time), '%H:%i') AS start_time, TIME_FORMAT(MAX(s.end_time), '%H:%i') AS end_time, b.checkin_status
       FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
      WHERE s.court_id = ? AND s.booking_date = ? AND s.slot_status IN ('HELD', 'CONFIRMED') AND b.payment_status = 'PAID'
      GROUP BY b.id, b.booking_code, b.checkin_status
     HAVING MAX(s.end_time) > ? AND (MIN(s.start_time) <= ? OR b.checkin_status = 'CHECKED_IN')
      ORDER BY MIN(s.start_time) LIMIT 1`,
    [courtId, now.date, t, t],
  );
  const r = rows[0];
  return r ? { bookingCode: r.booking_code, startTime: r.start_time, endTime: r.end_time, checkedIn: r.checkin_status === 'CHECKED_IN' } : null;
}

async function getOrThrow(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM courts WHERE id = ?', [id]);
  if (!rows[0]) throw new HttpError(404, 'COURT_NOT_FOUND', 'Không tìm thấy sân');
  return toCourt(rows[0]);
}

function validateFields({ name, courtType }, partial) {
  if (!partial || name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'name là bắt buộc, tối đa 50 ký tự');
    }
  }
  if (courtType !== undefined && !COURT_TYPES.includes(courtType)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'courtType phải là INDOOR hoặc OUTDOOR');
  }
}

// US-M01: tên sân không trùng trong cùng cơ sở (UNIQUE venue_id, name)
function rethrowDuplicateName(err) {
  if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'DUPLICATE_COURT_NAME', 'Cơ sở đã có sân trùng tên');
  throw err;
}

// Thêm sân con; copyPriceFrom chép nguyên bảng giá của một sân cùng cơ sở để sân mới đặt được ngay
async function create(venueId, { name, courtType = 'OUTDOOR', copyPriceFrom }, actor) {
  validateFields({ name, courtType }, false);
  return withTransaction(async (conn) => {
    let result;
    try {
      [result] = await conn.query('INSERT INTO courts (venue_id, name, court_type) VALUES (?, ?, ?)', [venueId, name.trim(), courtType]);
    } catch (err) {
      rethrowDuplicateName(err);
    }
    const court = await getOrThrow(result.insertId, conn);
    if (copyPriceFrom !== undefined && copyPriceFrom !== null) {
      const source = await getOrThrow(copyPriceFrom, conn);
      if (source.venueId !== venueId) throw new HttpError(400, 'VALIDATION_ERROR', 'copyPriceFrom phải là sân cùng cơ sở');
      await conn.query(
        `INSERT INTO price_rules (court_id, day_type, start_time, end_time, price_per_hour, updated_by)
         SELECT ?, day_type, start_time, end_time, price_per_hour, ? FROM price_rules WHERE court_id = ?`,
        [court.id, actor.id, source.id],
      );
    }
    await audit.log(conn, { actorId: actor.id, venueId, actionType: 'CREATE_COURT', entityType: 'COURT', entityId: court.id, newValues: { ...court, copyPriceFrom: copyPriceFrom ?? null } });
    return court;
  });
}

async function update(court, { name, courtType }, actor) {
  validateFields({ name, courtType }, true);
  return withTransaction(async (conn) => {
    try {
      await conn.query('UPDATE courts SET name = ?, court_type = ? WHERE id = ?', [
        name !== undefined ? name.trim() : court.name, courtType ?? court.courtType, court.id,
      ]);
    } catch (err) {
      rethrowDuplicateName(err);
    }
    const updated = await getOrThrow(court.id, conn);
    await audit.log(conn, { actorId: actor.id, venueId: court.venueId, actionType: 'UPDATE_COURT', entityType: 'COURT', entityId: court.id, oldValues: court, newValues: updated });
    return updated;
  });
}

// BR16, BR17: đổi trạng thái sân. Khi sân ngừng nhận khách, các đơn sắp tới trên sân bị hủy:
// đơn đã thanh toán chuyển REFUND_PENDING (chờ Manager hoàn tiền), đơn đang giữ chỗ chuyển CANCELLED.
async function changeStatus(court, { status, reason }, actor) {
  if (!STATUSES.includes(status)) throw new HttpError(400, 'VALIDATION_ERROR', 'status phải là ACTIVE, MAINTENANCE hoặc INACTIVE');
  if (status !== 'ACTIVE' && (typeof reason !== 'string' || !reason.trim())) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Cần nhập lý do khi đóng sân');
  }
  if (status === court.status) throw new HttpError(409, 'STATUS_UNCHANGED', `${court.name} đã ở trạng thái ${status}`);

  return withTransaction(async (conn) => {
    await conn.query('SELECT id FROM courts WHERE id = ? FOR UPDATE', [court.id]);
    if (status !== 'ACTIVE') {
      const playing = await activeBookingOn(court.id, conn);
      if (playing) {
        throw new HttpError(409, 'COURT_IN_USE', `${court.name} đang có khách chơi tới ${playing.endTime} (đơn ${playing.bookingCode}). Chờ hết giờ chơi rồi mới đóng sân để không làm gián đoạn khách`);
      }
    }
    await conn.query('UPDATE courts SET status = ? WHERE id = ?', [status, court.id]);

    const affected = [];
    if (status !== 'ACTIVE') {
      const now = nowInVietnam();
      const [bookings] = await conn.query(
        `SELECT DISTINCT b.id, b.booking_code, b.payment_status
           FROM booking_slots s JOIN bookings b ON b.id = s.booking_id
          WHERE s.court_id = ? AND s.slot_status IN ('HELD', 'CONFIRMED')
            AND b.payment_status IN ('PAID', 'PENDING_PAYMENT')
            AND (s.booking_date > ? OR (s.booking_date = ? AND s.start_time >= ?))
          FOR UPDATE`,
        [court.id, now.date, now.date, now.time],
      );
      const cancelReason = `${court.name} ngừng nhận khách: ${reason.trim()}`.slice(0, 255);
      for (const b of bookings) {
        const newStatus = b.payment_status === 'PAID' ? 'REFUND_PENDING' : 'CANCELLED';
        await conn.query(
          'UPDATE bookings SET payment_status = ?, cancelled_at = NOW(), cancelled_by = ?, cancel_reason = ? WHERE id = ?',
          [newStatus, actor.id, cancelReason, b.id],
        );
        // Hủy mọi ô của đơn để active_slot_lock về NULL, trả lại lịch trống
        await conn.query("UPDATE booking_slots SET slot_status = 'CANCELLED' WHERE booking_id = ?", [b.id]);
        affected.push({ bookingCode: b.booking_code, oldStatus: b.payment_status, newStatus });
      }
    }

    const updated = await getOrThrow(court.id, conn);
    await audit.log(conn, {
      actorId: actor.id, venueId: court.venueId, actionType: 'COURT_STATUS', entityType: 'COURT', entityId: court.id,
      oldValues: { status: court.status }, newValues: { status, affectedBookings: affected }, reason: reason ? reason.trim() : null,
    });
    return { court: updated, affectedBookings: affected };
  });
}

// Chỉ xóa hẳn sân chưa từng có lịch đặt; sân đã có lịch sử thì chuyển INACTIVE
async function remove(court, actor) {
  return withTransaction(async (conn) => {
    const [[{ total }]] = await conn.query('SELECT COUNT(*) AS total FROM booking_slots WHERE court_id = ?', [court.id]);
    if (total > 0) {
      throw new HttpError(409, 'COURT_HAS_BOOKINGS', `${court.name} đã có lịch đặt, hãy chuyển sang INACTIVE thay vì xóa`);
    }
    await conn.query('DELETE FROM courts WHERE id = ?', [court.id]); // price_rules xóa theo ON DELETE CASCADE
    await audit.log(conn, { actorId: actor.id, venueId: court.venueId, actionType: 'DELETE_COURT', entityType: 'COURT', entityId: court.id, oldValues: court });
  });
}

module.exports = { listByVenue, getOrThrow, create, update, changeStatus, remove, activeBookingOn };
