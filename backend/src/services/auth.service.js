const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { jwt: jwtConfig, session, bcryptRounds } = require('../config/env');
const HttpError = require('../utils/httpError');
const { isEmail, isPhone, assertPassword, assertRequired } = require('../utils/validators');
const { findById, rethrowDuplicate, logAudit, INTERNAL_ROLES } = require('./user.service');
const sessionService = require('./session.service');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role, venueId: user.venueId },
    jwtConfig.secret,
    { expiresIn: `${session.accessMinutes}m` },
  );
}

// US-C01: khách tự đăng ký, luôn nhận vai trò CUSTOMER
async function register({ fullName, email, phone, password }) {
  assertRequired({ fullName, email, phone, password }, ['fullName', 'email', 'phone', 'password']);
  if (!isEmail(email)) throw new HttpError(400, 'VALIDATION_ERROR', 'Email không hợp lệ');
  if (!isPhone(phone)) throw new HttpError(400, 'VALIDATION_ERROR', 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0');
  assertPassword(password);

  const hash = await bcrypt.hash(password, bcryptRounds);
  try {
    const [result] = await pool.query(
      `INSERT INTO users (full_name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, 'CUSTOMER')`,
      [fullName.trim(), email.trim().toLowerCase(), phone, hash],
    );
    const user = await findById(result.insertId);
    return { token: signToken(user), user };
  } catch (err) {
    return rethrowDuplicate(err);
  }
}

// Đăng nhập bằng email hoặc số điện thoại
async function login({ identifier, password, ip }) {
  assertRequired({ identifier, password }, ['identifier', 'password']);
  const key = String(identifier).trim().toLowerCase();
  const [rows] = await pool.query(
    'SELECT id, full_name, email, phone, role, venue_id, is_active, must_change_password, created_at, password_hash FROM users WHERE email = ? OR phone = ? LIMIT 1',
    [key, key],
  );
  const row = rows[0];
  // Cùng một thông báo cho sai tài khoản và sai mật khẩu để không lộ tài khoản nào tồn tại
  if (!row || !(await bcrypt.compare(String(password), row.password_hash))) {
    // Tài khoản nội bộ bị nhập sai: ghi lại để Admin thấy dấu hiệu dò mật khẩu
    if (row && INTERNAL_ROLES.includes(row.role)) await logAudit(pool, { actorId: null, venueId: row.venue_id, actionType: 'LOGIN_FAILED', entityType: 'USER', entityId: row.id, newValues: { ip: ip ?? null } });
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Sai tài khoản hoặc mật khẩu');
  }
  // G7, US-A03: tài khoản bị khóa không được đăng nhập
  if (!row.is_active) throw new HttpError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa');

  const user = await findById(row.id);
  if (INTERNAL_ROLES.includes(row.role)) await logAudit(pool, { actorId: row.id, venueId: row.venue_id, actionType: 'LOGIN', entityType: 'USER', entityId: row.id, newValues: { ip: ip ?? null } });
  return { token: signToken(user), user };
}

// US-S10: đổi mật khẩu, đồng thời gỡ cờ bắt đổi mật khẩu lần đầu
async function changePassword(userId, { currentPassword, newPassword }) {
  assertRequired({ currentPassword, newPassword }, ['currentPassword', 'newPassword']);
  assertPassword(newPassword, 'newPassword');
  if (currentPassword === newPassword) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Mật khẩu mới phải khác mật khẩu hiện tại');
  }

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ?', [userId]);
  if (!rows[0] || !(await bcrypt.compare(String(currentPassword), rows[0].password_hash))) {
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Mật khẩu hiện tại không đúng');
  }

  const hash = await bcrypt.hash(newPassword, bcryptRounds);
  await pool.query(
    'UPDATE users SET password_hash = ?, must_change_password = FALSE, password_reset_token = NULL, password_reset_expires = NULL WHERE id = ?',
    [hash, userId],
  );
  await sessionService.revokeAllForUser(userId); // đăng xuất các thiết bị khác
  const user = await findById(userId);
  return { token: signToken(user), user };
}

module.exports = { register, login, changePassword, signToken };
