const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { bcryptRounds } = require('../config/env');
const HttpError = require('../utils/httpError');
const { isEmail, isPhone, assertRequired } = require('../utils/validators');

const PUBLIC_COLUMNS = 'id, full_name, email, phone, role, venue_id, is_active, must_change_password, created_at';
const INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];

function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    venueId: row.venue_id,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

async function findById(id) {
  const [rows] = await pool.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = ?`, [id]);
  return rows[0] ? toPublicUser(rows[0]) : null;
}

async function listUsers({ role, venueId } = {}) {
  const where = [];
  const params = [];
  if (role) { where.push('role = ?'); params.push(role); }
  if (venueId) { where.push('venue_id = ?'); params.push(venueId); }
  const sql = `SELECT ${PUBLIC_COLUMNS} FROM users ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id`;
  const [rows] = await pool.query(sql, params);
  return rows.map(toPublicUser);
}

// Lỗi 1062 của MySQL: trùng UNIQUE (email hoặc phone)
function rethrowDuplicate(err) {
  if (err.code === 'ER_DUP_ENTRY') {
    const field = err.message.includes('phone') ? 'Số điện thoại' : 'Email';
    throw new HttpError(409, 'DUPLICATE_ACCOUNT', `${field} đã được đăng ký`);
  }
  throw err;
}

// US-A02, US-S10: Admin tạo tài khoản nội bộ, mật khẩu tạm buộc đổi ở lần đăng nhập đầu
async function createInternalUser({ fullName, email, phone, role, venueId }) {
  assertRequired({ fullName, email, phone, role }, ['fullName', 'email', 'phone', 'role']);
  if (!INTERNAL_ROLES.includes(role)) throw new HttpError(400, 'VALIDATION_ERROR', 'role phải là ADMIN, MANAGER hoặc STAFF');
  if (!isEmail(email)) throw new HttpError(400, 'VALIDATION_ERROR', 'Email không hợp lệ');
  if (!isPhone(phone)) throw new HttpError(400, 'VALIDATION_ERROR', 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');

  // BR15: Manager và Staff phải thuộc đúng một cơ sở đang tồn tại
  let venue = null;
  if (role !== 'ADMIN') {
    if (!venueId) throw new HttpError(400, 'VALIDATION_ERROR', 'MANAGER và STAFF bắt buộc có venueId');
    const [venues] = await pool.query('SELECT id FROM venues WHERE id = ?', [venueId]);
    if (!venues.length) throw new HttpError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở');
    venue = venueId;
  }

  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const hash = await bcrypt.hash(tempPassword, bcryptRounds);
  try {
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role, venue_id, must_change_password)
       VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
      [fullName.trim(), email.trim().toLowerCase(), phone, hash, role, venue],
    );
    return { user: await findById(result.insertId), tempPassword };
  } catch (err) {
    return rethrowDuplicate(err);
  }
}

// G7, US-A03: Admin khóa / mở khóa tài khoản; không tự khóa chính mình
async function setActive(id, isActive, actor) {
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'isActive phải là true hoặc false');
  if (id === actor.id) throw new HttpError(409, 'CANNOT_LOCK_SELF', 'Không thể tự khóa tài khoản của mình');
  const user = await findById(id);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
  await pool.query(
    'INSERT INTO audit_logs (actor_id, venue_id, action_type, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [actor.id, user.venueId, isActive ? 'UNLOCK_USER' : 'LOCK_USER', 'USER', id, JSON.stringify({ isActive: user.isActive }), JSON.stringify({ isActive })],
  );
  return findById(id);
}

module.exports = { toPublicUser, findById, listUsers, createInternalUser, setActive, rethrowDuplicate };
