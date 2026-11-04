const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const audit = require('./audit.service');
const userService = require('./user.service');

// Vai trò tự tạo chỉ có phạm vi trong một cơ sở; toàn chuỗi dành riêng cho Admin
const CUSTOM_BASE_ROLES = ['MANAGER', 'STAFF'];

function toRole(row, permissions = []) {
  return { id: row.id, code: row.code, name: row.name, baseRole: row.base_role, isSystem: Boolean(row.is_system), userCount: Number(row.user_count ?? 0), permissions };
}

async function permissionsByRole(db = pool) {
  const [rows] = await db.query('SELECT role_id, permission_code FROM role_permissions ORDER BY permission_code');
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.role_id)) map.set(r.role_id, []);
    map.get(r.role_id).push(r.permission_code);
  }
  return map;
}

const ROLE_SELECT = `
  SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.custom_role_id = r.id OR (u.custom_role_id IS NULL AND u.role = r.code)) AS user_count
    FROM roles r`;

// Danh mục quyền và ma trận vai trò cho màn phân quyền
async function catalog() {
  const [[permissions], [roles], byRole] = await Promise.all([
    pool.query('SELECT code, module, description, admin_only FROM permissions ORDER BY sort_order'),
    pool.query(`${ROLE_SELECT} ORDER BY r.is_system DESC, r.id`),
    permissionsByRole(),
  ]);
  return {
    permissions: permissions.map((p) => ({ code: p.code, module: p.module, description: p.description, adminOnly: Boolean(p.admin_only) })),
    roles: roles.map((r) => toRole(r, byRole.get(r.id) || [])),
  };
}

async function getOrThrow(id, db = pool) {
  const [rows] = await db.query(`${ROLE_SELECT} WHERE r.id = ?`, [id]);
  if (!rows[0]) throw new HttpError(404, 'ROLE_NOT_FOUND', 'Không tìm thấy vai trò');
  const [perms] = await db.query('SELECT permission_code FROM role_permissions WHERE role_id = ?', [id]);
  return toRole(rows[0], perms.map((p) => p.permission_code));
}

function assertName(name) {
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 100) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Tên vai trò là bắt buộc, tối đa 100 ký tự');
  }
}

// Chốt chặn leo thang đặc quyền: chỉ được thêm hoặc gỡ những quyền mình đang có,
// và quyền quản trị (admin_only) không gán được cho vai trò khác ngoài Admin
async function assertGrantable(codes, previous, actor, db) {
  if (!Array.isArray(codes) || codes.some((c) => typeof c !== 'string')) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'permissions phải là danh sách mã quyền');
  }
  const unique = [...new Set(codes)];
  const [known] = unique.length ? await db.query('SELECT code, admin_only FROM permissions WHERE code IN (?)', [unique]) : [[]];
  if (known.length !== unique.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Có mã quyền không tồn tại');
  if (known.some((p) => p.admin_only)) throw new HttpError(403, 'PERMISSION_ADMIN_ONLY', 'Quyền quản trị chỉ dành cho Admin');
  const changed = [...unique.filter((c) => !previous.includes(c)), ...previous.filter((c) => !unique.includes(c))];
  if (changed.some((c) => !actor.permissions.includes(c))) {
    throw new HttpError(403, 'CANNOT_GRANT_UNHELD', 'Bạn chỉ được cấp hoặc gỡ những quyền mình đang có');
  }
  return unique;
}

async function replacePermissions(conn, roleId, codes) {
  await conn.query('DELETE FROM role_permissions WHERE role_id = ?', [roleId]);
  if (codes.length) await conn.query('INSERT INTO role_permissions (role_id, permission_code) VALUES ?', [codes.map((c) => [roleId, c])]);
}

function rethrowDuplicateName(err) {
  if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'DUPLICATE_ROLE_NAME', 'Đã có vai trò trùng tên');
  throw err;
}

async function create({ name, baseRole, permissions = [] }, actor) {
  assertName(name);
  if (!CUSTOM_BASE_ROLES.includes(baseRole)) throw new HttpError(400, 'VALIDATION_ERROR', 'baseRole phải là MANAGER hoặc STAFF');
  return withTransaction(async (conn) => {
    const codes = await assertGrantable(permissions, [], actor, conn);
    const code = `CUSTOM_${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    let result;
    try {
      [result] = await conn.query('INSERT INTO roles (code, name, base_role, created_by) VALUES (?, ?, ?, ?)', [code, name.trim(), baseRole, actor.id]);
    } catch (err) {
      rethrowDuplicateName(err);
    }
    await replacePermissions(conn, result.insertId, codes);
    await audit.log(conn, { actorId: actor.id, actionType: 'CREATE_ROLE', entityType: 'ROLE', entityId: result.insertId, newValues: { name: name.trim(), baseRole, permissions: codes } });
    return getOrThrow(result.insertId, conn);
  });
}

async function update(id, { name, permissions }, actor) {
  return withTransaction(async (conn) => {
    const role = await getOrThrow(id, conn);
    if (role.code === 'ADMIN') throw new HttpError(409, 'SYSTEM_ROLE_LOCKED', 'Vai trò Admin không được sửa');
    if (role.id === actor.roleId) throw new HttpError(409, 'CANNOT_EDIT_OWN_ROLE', 'Không được tự sửa vai trò của chính mình');
    if (name !== undefined) {
      if (role.isSystem) throw new HttpError(409, 'SYSTEM_ROLE_LOCKED', 'Vai trò hệ thống không đổi được tên');
      assertName(name);
      try {
        await conn.query('UPDATE roles SET name = ? WHERE id = ?', [name.trim(), id]);
      } catch (err) {
        rethrowDuplicateName(err);
      }
    }
    if (permissions !== undefined) {
      const codes = await assertGrantable(permissions, role.permissions, actor, conn);
      await replacePermissions(conn, id, codes);
    }
    const updated = await getOrThrow(id, conn);
    await audit.log(conn, { actorId: actor.id, actionType: 'UPDATE_ROLE', entityType: 'ROLE', entityId: id, oldValues: { name: role.name, permissions: role.permissions }, newValues: { name: updated.name, permissions: updated.permissions } });
    return updated;
  });
}

async function remove(id, actor) {
  await withTransaction(async (conn) => {
    const role = await getOrThrow(id, conn);
    if (role.isSystem) throw new HttpError(409, 'SYSTEM_ROLE_LOCKED', 'Vai trò hệ thống không xóa được');
    if (role.userCount > 0) throw new HttpError(409, 'ROLE_IN_USE', `Vai trò đang được ${role.userCount} tài khoản sử dụng`);
    await conn.query('DELETE FROM roles WHERE id = ?', [id]);
    await audit.log(conn, { actorId: actor.id, actionType: 'DELETE_ROLE', entityType: 'ROLE', entityId: id, oldValues: { name: role.name, permissions: role.permissions } });
  });
}

// Đổi vai trò của tài khoản nội bộ. users.role luôn theo base_role để logic phạm vi cơ sở (BR15) giữ nguyên.
async function assignToUser(userId, { roleId, venueId }, actor) {
  if (userId === actor.id) throw new HttpError(409, 'CANNOT_CHANGE_OWN_ROLE', 'Không được tự đổi vai trò của chính mình');
  await withTransaction(async (conn) => {
    const target = await userService.findById(userId);
    if (!target) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy tài khoản');
    if (target.role === 'CUSTOMER') throw new HttpError(409, 'CUSTOMER_ROLE_FIXED', 'Tài khoản khách hàng không đổi sang vai trò nội bộ');
    const role = await getOrThrow(Number(roleId), conn);
    if (role.baseRole === 'CUSTOMER') throw new HttpError(400, 'VALIDATION_ERROR', 'Không gán vai trò khách hàng cho nhân sự');
    if (role.permissions.some((c) => !actor.permissions.includes(c))) {
      throw new HttpError(403, 'CANNOT_GRANT_UNHELD', 'Vai trò này có quyền mà bạn không có');
    }

    let venue = null;
    if (role.baseRole !== 'ADMIN') {
      venue = venueId ? Number(venueId) : target.venueId;
      if (!venue) throw new HttpError(400, 'VALIDATION_ERROR', 'Vai trò theo cơ sở bắt buộc chọn cơ sở');
      const [venues] = await conn.query('SELECT id FROM venues WHERE id = ?', [venue]);
      if (!venues.length) throw new HttpError(404, 'VENUE_NOT_FOUND', 'Không tìm thấy cơ sở');
    }
    if (target.role === 'ADMIN' && role.baseRole !== 'ADMIN') await userService.assertAnotherAdmin(userId, conn);
    // venues.manager_id trỏ tới tài khoản này: phải đổi người quản lý cơ sở trước
    if (target.role === 'MANAGER' && (role.baseRole !== 'MANAGER' || venue !== target.venueId)) {
      const [managed] = await conn.query('SELECT id FROM venues WHERE manager_id = ?', [userId]);
      if (managed.length) throw new HttpError(409, 'MANAGER_ASSIGNED', 'Tài khoản đang là quản lý cơ sở, hãy đổi quản lý cơ sở trước');
    }

    await conn.query('UPDATE users SET role = ?, custom_role_id = ?, venue_id = ? WHERE id = ?', [role.baseRole, role.isSystem ? null : role.id, venue, userId]);
    await audit.log(conn, { actorId: actor.id, venueId: venue, actionType: 'ASSIGN_ROLE', entityType: 'USER', entityId: userId, oldValues: { role: target.roleName, venueId: target.venueId }, newValues: { role: role.name, venueId: venue } });
  });
  return userService.findById(userId);
}

module.exports = { catalog, create, update, remove, assignToUser };
