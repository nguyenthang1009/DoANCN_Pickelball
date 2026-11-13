const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { bcryptRounds } = require('../config/env');
const HttpError = require('../utils/httpError');
const { isEmail, isPhone, assertRequired } = require('../utils/validators');
// Ghi nhật ký trực tiếp (audit.service phụ thuộc vòng với file này qua auth)
const logAudit = (db, e) => db.query('INSERT INTO audit_logs (actor_id, venue_id, action_type, entity_type, entity_id, old_values, new_values, reason) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [e.actorId ?? null, e.venueId ?? null, e.actionType, e.entityType, e.entityId, e.oldValues ? JSON.stringify(e.oldValues) : null, e.newValues ? JSON.stringify(e.newValues) : null, e.reason ?? null]);

// Vai trò hiệu lực: vai trò tự tạo nếu có, nếu không là vai trò hệ thống trùng tên users.role
const USER_SELECT = `
  SELECT u.id, u.full_name, u.email, u.phone, u.role, u.venue_id, u.is_active, u.must_change_password, u.created_at,
         r.id AS role_id, r.name AS role_name
    FROM users u JOIN roles r ON r.id = u.custom_role_id OR (u.custom_role_id IS NULL AND r.code = u.role)`;
const INTERNAL_ROLES = ['ADMIN', 'MANAGER', 'STAFF'];

function toPublicUser(row) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    roleId: row.role_id,
    roleName: row.role_name,
    venueId: row.venue_id,
    isActive: Boolean(row.is_active),
    mustChangePassword: Boolean(row.must_change_password),
    createdAt: row.created_at,
  };
}

async function findById(id) {
  const [rows] = await pool.query(`${USER_SELECT} WHERE u.id = ?`, [id]);
  if (!rows[0]) return null;
  const [perms] = await pool.query(
    'SELECT rp.permission_code, p.requires_shift FROM role_permissions rp JOIN permissions p ON p.code = rp.permission_code WHERE rp.role_id = ?',
    [rows[0].role_id],
  );
  return {
    ...toPublicUser(rows[0]),
    permissions: perms.map((p) => p.permission_code),
    dutyPermissions: perms.filter((p) => p.requires_shift).map((p) => p.permission_code), // chỉ dùng được khi đang trong ca
  };
}

async function listUsers({ role, venueId } = {}) {
  const where = [];
  const params = [];
  if (role) { where.push('u.role = ?'); params.push(role); }
  if (venueId) { where.push('u.venue_id = ?'); params.push(venueId); }
  const sql = `${USER_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY u.id`;
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
async function createInternalUser({ fullName, email, phone, role, venueId }, actor = null) {
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
    await logAudit(pool, { actorId: actor?.id, venueId: venue, actionType: 'CREATE_USER', entityType: 'USER', entityId: result.insertId, newValues: { fullName: fullName.trim(), email: email.trim().toLowerCase(), phone, role, venueId: venue } });
    return { user: await findById(result.insertId), tempPassword };
  } catch (err) {
    return rethrowDuplicate(err);
  }
}

// Admin sửa thông tin nhân sự: họ tên, số điện thoại, cơ sở làm việc. Email là tên đăng nhập nên không đổi.
async function updateProfile(id, { fullName, phone, venueId }, actor) {
  const user = await findById(id);
  if (!user || !INTERNAL_ROLES.includes(user.role)) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản nhân sự');
  const next = { fullName: fullName === undefined ? user.fullName : String(fullName).trim(), phone: phone === undefined ? user.phone : String(phone).trim(), venueId: venueId === undefined ? user.venueId : Number(venueId) || null };
  if (!next.fullName || next.fullName.length > 100) throw new HttpError(400, 'VALIDATION_ERROR', 'Họ tên từ 1 đến 100 ký tự');
  if (!isPhone(next.phone)) throw new HttpError(400, 'VALIDATION_ERROR', 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');
  if (user.role === 'ADMIN') next.venueId = null;
  else {
    if (!next.venueId) throw new HttpError(400, 'VALIDATION_ERROR', 'Quản lý và lễ tân bắt buộc thuộc một cơ sở');
    const [venues] = await pool.query('SELECT id FROM venues WHERE id = ?', [next.venueId]);
    if (!venues.length) throw new HttpError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở');
    if (next.venueId !== user.venueId) {
      const [open] = await pool.query('SELECT id FROM attendance_records WHERE user_id = ? AND clock_out IS NULL', [id]);
      if (open.length) throw new HttpError(409, 'USER_ON_DUTY', 'Nhân sự đang trong ca, chờ ra ca rồi mới chuyển cơ sở');
    }
  }
  try {
    await pool.query('UPDATE users SET full_name = ?, phone = ?, venue_id = ? WHERE id = ?', [next.fullName, next.phone, next.venueId, id]);
  } catch (err) {
    rethrowDuplicate(err);
  }
  await logAudit(pool, { actorId: actor.id, venueId: next.venueId, actionType: 'UPDATE_USER', entityType: 'USER', entityId: id, oldValues: { fullName: user.fullName, phone: user.phone, venueId: user.venueId }, newValues: next });
  return findById(id);
}

// Admin đặt lại mật khẩu khi nhân viên quên: mật khẩu tạm hiện một lần, đăng nhập phải đổi ngay, các phiên cũ bị đăng xuất
async function resetPassword(id, actor) {
  if (id === actor.id) throw new HttpError(409, 'CANNOT_RESET_SELF', 'Tự đổi mật khẩu của mình ở trang Đổi mật khẩu');
  const user = await findById(id);
  if (!user || !INTERNAL_ROLES.includes(user.role)) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản nhân sự');
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  await pool.query('UPDATE users SET password_hash = ?, must_change_password = TRUE WHERE id = ?', [await bcrypt.hash(tempPassword, bcryptRounds), id]);
  await require('./session.service').revokeAllForUser(id);
  await logAudit(pool, { actorId: actor.id, venueId: user.venueId, actionType: 'RESET_PASSWORD', entityType: 'USER', entityId: id });
  return { user: await findById(id), tempPassword };
}

// Hệ thống luôn còn ít nhất một Admin đang hoạt động ngoài tài khoản sắp bị khóa hoặc đổi vai trò
async function assertAnotherAdmin(userId, db = pool) {
  const [[{ total }]] = await db.query("SELECT COUNT(*) AS total FROM users WHERE role = 'ADMIN' AND is_active = TRUE AND id <> ?", [userId]);
  if (!total) throw new HttpError(409, 'LAST_ADMIN', 'Hệ thống phải còn ít nhất một Admin');
}

// G7, US-A03: Admin khóa / mở khóa tài khoản; không tự khóa chính mình
async function setActive(id, isActive, actor) {
  if (typeof isActive !== 'boolean') throw new HttpError(400, 'VALIDATION_ERROR', 'isActive phải là true hoặc false');
  if (id === actor.id) throw new HttpError(409, 'CANNOT_LOCK_SELF', 'Không thể tự khóa tài khoản của mình');
  const user = await findById(id);
  if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
  if (!isActive && user.role === 'ADMIN') await assertAnotherAdmin(id);
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive, id]);
  let closedAttendance = 0;
  if (!isActive) {
    // Đang trong ca mà bị khóa: kết thúc lượt chấm công ngay để không tiếp tục tính công
    const now = require('./shift.service').nowVN();
    const [res] = await pool.query(
      `UPDATE attendance_records r LEFT JOIN shift_assignments a ON a.id = r.assignment_id
          SET r.clock_out = GREATEST(r.clock_in + INTERVAL 1 SECOND, LEAST(?, COALESCE(a.ends_at, ?))), r.note = 'Kết thúc ca do tài khoản bị khóa'
        WHERE r.user_id = ? AND r.clock_out IS NULL`,
      [now, now, id],
    );
    closedAttendance = res.affectedRows;
  }
  await pool.query(
    'INSERT INTO audit_logs (actor_id, venue_id, action_type, entity_type, entity_id, old_values, new_values) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [actor.id, user.venueId, isActive ? 'UNLOCK_USER' : 'LOCK_USER', 'USER', id, JSON.stringify({ isActive: user.isActive }), JSON.stringify({ isActive, ...(closedAttendance && { closedAttendance }) })],
  );
  return findById(id);
}

module.exports = { toPublicUser, findById, listUsers, createInternalUser, updateProfile, resetPassword, setActive, rethrowDuplicate, assertAnotherAdmin, logAudit, INTERNAL_ROLES };
