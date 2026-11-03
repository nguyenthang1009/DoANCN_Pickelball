const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { toMinutes, hhmm, assertHalfHour } = require('../utils/time');
const { assertRequired } = require('../utils/validators');
const priceRuleService = require('./priceRule.service');
const audit = require('./audit.service');

function toVenue(row) {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    openTime: hhmm(row.open_time),
    closeTime: hhmm(row.close_time),
    managerId: row.manager_id,
    isActive: Boolean(row.is_active),
  };
}

async function list({ includeInactive = false } = {}) {
  const [rows] = await pool.query(`SELECT * FROM venues ${includeInactive ? '' : 'WHERE is_active = TRUE'} ORDER BY id`);
  return rows.map(toVenue);
}

async function getOrThrow(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM venues WHERE id = ?', [id]);
  if (!rows[0]) throw new HttpError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở');
  return toVenue(rows[0]);
}

// BR01: giờ mở/đóng là bội số 30 phút, giờ đóng sau giờ mở
function validateHours(openTime, closeTime) {
  const open = toMinutes(openTime, 'openTime');
  const close = toMinutes(closeTime, 'closeTime');
  assertHalfHour(open, 'openTime');
  assertHalfHour(close, 'closeTime');
  if (close <= open) throw new HttpError(400, 'VALIDATION_ERROR', 'closeTime phải sau openTime');
  return { open, close };
}

async function create({ name, address, openTime = '06:00', closeTime = '22:00' }, actor) {
  assertRequired({ name, address }, ['name', 'address']);
  validateHours(openTime, closeTime);
  return withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO venues (name, address, open_time, close_time) VALUES (?, ?, ?, ?)',
      [name.trim(), address.trim(), openTime, closeTime],
    );
    const venue = await getOrThrow(result.insertId, conn);
    await audit.log(conn, { actorId: actor.id, venueId: venue.id, actionType: 'CREATE_VENUE', entityType: 'VENUE', entityId: venue.id, newValues: venue });
    return venue;
  });
}

async function update(id, patch, actor) {
  return withTransaction(async (conn) => {
    const old = await getOrThrow(id, conn);
    const next = {
      name: patch.name !== undefined ? String(patch.name).trim() : old.name,
      address: patch.address !== undefined ? String(patch.address).trim() : old.address,
      openTime: patch.openTime !== undefined ? patch.openTime : old.openTime,
      closeTime: patch.closeTime !== undefined ? patch.closeTime : old.closeTime,
      isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : old.isActive,
      managerId: patch.managerId !== undefined ? patch.managerId : old.managerId,
    };
    if (!next.name || !next.address) throw new HttpError(400, 'VALIDATION_ERROR', 'name và address không được rỗng');
    const { open, close } = validateHours(next.openTime, next.closeTime);

    // Đổi giờ mở cửa thì bảng giá của từng sân vẫn phải phủ kín giờ mới
    if (open !== toMinutes(old.openTime) || close !== toMinutes(old.closeTime)) {
      const [courts] = await conn.query('SELECT id, name FROM courts WHERE venue_id = ?', [id]);
      for (const court of courts) {
        const rules = await priceRuleService.listByCourt(court.id, conn);
        if (!rules.length) continue;
        const error = priceRuleService.coverageError(
          rules.map((r) => ({ dayType: r.dayType, start: toMinutes(r.startTime), end: toMinutes(r.endTime) })), open, close,
        );
        if (error) throw new HttpError(409, 'PRICE_RULES_MISMATCH', `Cập nhật bảng giá ${court.name} trước khi đổi giờ (${error})`);
      }
    }

    // US-A01: gán Manager cho cơ sở; UNIQUE(manager_id) đảm bảo một Manager chỉ quản lý một cơ sở
    if (next.managerId !== null && next.managerId !== old.managerId) {
      const [users] = await conn.query('SELECT id, role FROM users WHERE id = ?', [next.managerId]);
      if (!users[0] || users[0].role !== 'MANAGER') throw new HttpError(400, 'VALIDATION_ERROR', 'managerId phải là tài khoản có vai trò MANAGER');
      await conn.query('UPDATE users SET venue_id = ? WHERE id = ?', [id, next.managerId]);
    }

    try {
      await conn.query(
        'UPDATE venues SET name = ?, address = ?, open_time = ?, close_time = ?, is_active = ?, manager_id = ? WHERE id = ?',
        [next.name, next.address, next.openTime, next.closeTime, next.isActive, next.managerId, id],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'MANAGER_ALREADY_ASSIGNED', 'Manager này đang quản lý cơ sở khác');
      throw err;
    }
    const venue = await getOrThrow(id, conn);
    await audit.log(conn, { actorId: actor.id, venueId: id, actionType: 'UPDATE_VENUE', entityType: 'VENUE', entityId: id, oldValues: old, newValues: venue });
    return venue;
  });
}

module.exports = { list, getOrThrow, create, update };
