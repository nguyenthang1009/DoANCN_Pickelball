const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { assertDate } = require('../utils/time');
const configService = require('./config.service');

// Nhật ký hoạt động cho Admin: ai làm gì, lúc nào, ở cơ sở nào, giá trị trước và sau.
// Thời điểm lưu kiểu TIMESTAMP; đọc ra số giây UTC rồi đổi sang giờ Việt Nam để không phụ thuộc múi giờ của MySQL.
const VN_OFFSET = 7 * 3600;
const toVN = (unix) => new Date((Number(unix) + VN_OFFSET) * 1000).toISOString().slice(0, 19).replace('T', ' ');
const vnDateToUnix = (date, endOfDay = false) => Date.parse(`${date}T${endOfDay ? '23:59:59' : '00:00:00'}+07:00`) / 1000;
const parse = (v) => (v == null ? null : typeof v === 'string' ? JSON.parse(v) : v);

function period({ from, to } = {}) {
  const today = new Date(Date.now() + VN_OFFSET * 1000).toISOString().slice(0, 10);
  const end = to || today;
  const start = from || new Date(Date.parse(`${end}T00:00:00Z`) - 29 * 86400000).toISOString().slice(0, 10);
  assertDate(start, 'from');
  assertDate(end, 'to');
  if (end < start) throw new HttpError(400, 'VALIDATION_ERROR', 'Ngày kết thúc phải sau ngày bắt đầu');
  return { start, end, fromUnix: vnDateToUnix(start), toUnix: vnDateToUnix(end, true) };
}

async function list(query = {}) {
  const { fromUnix, toUnix, start, end } = period(query);
  const page = Math.max(1, Number(query.page) || 1);
  const size = Math.min(100, Math.max(10, Number(query.pageSize) || 30));
  const where = ['UNIX_TIMESTAMP(l.created_at) BETWEEN ? AND ?'];
  const params = [fromUnix, toUnix];
  if (query.actorId) { where.push('l.actor_id = ?'); params.push(Number(query.actorId)); }
  if (query.venueId) { where.push('l.venue_id = ?'); params.push(Number(query.venueId)); }
  if (query.action) { where.push('l.action_type IN (?)'); params.push(String(query.action).split(',').map((s) => s.trim()).filter(Boolean)); }
  if (query.system === '1') where.push('l.actor_id IS NULL');
  if (query.q) {
    const q = `%${String(query.q).trim().slice(0, 50)}%`;
    where.push('(b.booking_code LIKE ? OR CAST(l.new_values AS CHAR) LIKE ? OR CAST(l.old_values AS CHAR) LIKE ? OR l.reason LIKE ?)');
    params.push(q, q, q, q);
  }
  const from = `FROM audit_logs l
    LEFT JOIN users a ON a.id = l.actor_id
    LEFT JOIN venues v ON v.id = l.venue_id
    LEFT JOIN bookings b ON l.entity_type = 'BOOKING' AND b.id = l.entity_id
    LEFT JOIN users tu ON l.entity_type = 'USER' AND tu.id = l.entity_id
    LEFT JOIN courts c ON l.entity_type = 'COURT' AND c.id = l.entity_id
    LEFT JOIN services sv ON l.entity_type = 'SERVICE' AND sv.id = l.entity_id
    WHERE ${where.join(' AND ')}`;
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total ${from}`, params);
  const [rows] = await pool.query(
    `SELECT l.id, l.actor_id, a.full_name AS actor_name, a.role AS actor_role, l.venue_id, v.name AS venue_name, l.action_type, l.entity_type, l.entity_id,
            l.old_values, l.new_values, l.reason, UNIX_TIMESTAMP(l.created_at) AS at, b.booking_code, tu.full_name AS target_user, c.name AS court_name, sv.name AS service_name
       ${from} ORDER BY l.id DESC LIMIT ? OFFSET ?`,
    [...params, size, (page - 1) * size],
  );
  return {
    from: start, to: end, page, pageSize: size, total: Number(total),
    items: rows.map((r) => ({
      id: r.id, at: toVN(r.at), action: r.action_type, entityType: r.entity_type, entityId: r.entity_id,
      entityLabel: r.booking_code || r.target_user || r.court_name || r.service_name || null,
      actor: r.actor_id ? { id: r.actor_id, name: r.actor_name, role: r.actor_role } : null,
      venue: r.venue_id ? { id: r.venue_id, name: r.venue_name } : null,
      oldValues: parse(r.old_values), newValues: parse(r.new_values), reason: r.reason,
    })),
  };
}

// Danh sách người và loại thao tác để làm bộ lọc
async function filters() {
  const [actors] = await pool.query("SELECT id, full_name, role, venue_id FROM users WHERE role IN ('ADMIN', 'MANAGER', 'STAFF') ORDER BY role, full_name");
  const [actions] = await pool.query('SELECT action_type, COUNT(*) AS n FROM audit_logs GROUP BY action_type ORDER BY action_type');
  return {
    actors: actors.map((a) => ({ id: a.id, name: a.full_name, role: a.role, venueId: a.venue_id })),
    actions: actions.map((a) => ({ code: a.action_type, count: Number(a.n) })),
  };
}

// Cảnh báo bất thường: các dấu hiệu nhân sự lách quy trình, cần Admin xem lại.
// Đây là dấu hiệu để kiểm tra, không phải kết luận vi phạm.
async function alerts(query = {}) {
  const { fromUnix, toUnix, start, end } = period(query);
  const venue = query.venueId ? Number(query.venueId) : null;
  const vb = venue ? 'AND b.venue_id = ?' : '';
  const vl = venue ? 'AND l.venue_id = ?' : '';
  const vp = venue ? [venue] : [];
  const grace = await configService.getNumber('LATE_GRACE_MINUTES', 5);
  const out = [];
  const push = (severity, rule, title, detail, extra = {}) => out.push({ severity, rule, title, detail, ...extra });

  // 1. Đơn tại quầy cho đúng số điện thoại của một nhân sự: có thể đặt cho chính mình hoặc người nhà
  const [ownPhone] = await pool.query(
    `SELECT b.booking_code, b.guest_name, b.guest_phone, b.payment_status, b.total_amount, UNIX_TIMESTAMP(b.created_at) AS at,
            cr.full_name AS creator, st.full_name AS staff_name, v.name AS venue_name
       FROM bookings b JOIN users st ON st.phone = b.guest_phone AND st.role IN ('ADMIN', 'MANAGER', 'STAFF')
       JOIN users cr ON cr.id = b.created_by JOIN venues v ON v.id = b.venue_id
      WHERE b.booking_source = 'POS' AND UNIX_TIMESTAMP(b.created_at) BETWEEN ? AND ? ${vb} ORDER BY b.created_at DESC`,
    [fromUnix, toUnix, ...vp],
  );
  for (const r of ownPhone) {
    push('high', 'STAFF_PHONE', 'Đặt sân tại quầy cho số điện thoại của nhân sự',
      `${r.creator} đặt đơn ${r.booking_code} cho số ${r.guest_phone} (trùng số của ${r.staff_name}), ${Number(r.total_amount).toLocaleString('vi-VN')}đ, trạng thái ${r.payment_status}`,
      { at: toVN(r.at), actor: r.creator, venue: r.venue_name, bookingCode: r.booking_code });
  }

  // 2. Đơn tại quầy bị hủy hoặc hoàn tiền: đặc biệt khi chính người tạo hủy, hoặc hủy ngay trong ngày tạo
  const [cancelled] = await pool.query(
    `SELECT b.booking_code, b.payment_status, b.payment_method, b.total_amount, b.cancel_reason, UNIX_TIMESTAMP(b.cancelled_at) AS at,
            b.created_by = b.cancelled_by AS same_person, DATE(b.created_at) = DATE(b.cancelled_at) AS same_day,
            cr.full_name AS creator, ca.full_name AS canceller, v.name AS venue_name
       FROM bookings b JOIN users cr ON cr.id = b.created_by LEFT JOIN users ca ON ca.id = b.cancelled_by JOIN venues v ON v.id = b.venue_id
      WHERE b.booking_source = 'POS' AND b.cancelled_at IS NOT NULL AND UNIX_TIMESTAMP(b.cancelled_at) BETWEEN ? AND ? ${vb}
        AND b.payment_status IN ('CANCELLED', 'REFUND_PENDING', 'REFUNDED') ORDER BY b.cancelled_at DESC`,
    [fromUnix, toUnix, ...vp],
  );
  for (const r of cancelled) {
    const paidCash = r.payment_method === 'CASH' && r.payment_status !== 'CANCELLED';
    const severity = r.same_person || (paidCash && r.same_day) ? 'high' : 'medium';
    push(severity, 'POS_CANCELLED', paidCash ? 'Đơn tại quầy đã thu tiền mặt rồi bị hủy, hoàn tiền' : 'Đơn tại quầy bị hủy',
      `Đơn ${r.booking_code} do ${r.creator} tạo, ${r.canceller || 'hệ thống'} hủy${r.same_person ? ' (cùng một người)' : ''}${r.same_day ? ' ngay trong ngày' : ''}. Lý do: ${r.cancel_reason || 'không ghi'}`,
      { at: toVN(r.at), actor: r.canceller || r.creator, venue: r.venue_name, bookingCode: r.booking_code });
  }

  // 3. Một nhân sự đặt tại quầy nhiều lần cho cùng một khách: khách quen của nhân viên, cần xem có được ưu đãi trái quy định không
  const [repeat] = await pool.query(
    `SELECT cr.full_name AS creator, b.guest_phone, MAX(b.guest_name) AS guest_name, COUNT(*) AS n, SUM(b.total_amount) AS amount, MAX(UNIX_TIMESTAMP(b.created_at)) AS at, MAX(v.name) AS venue_name
       FROM bookings b JOIN users cr ON cr.id = b.created_by JOIN venues v ON v.id = b.venue_id
      WHERE b.booking_source = 'POS' AND b.guest_phone IS NOT NULL AND UNIX_TIMESTAMP(b.created_at) BETWEEN ? AND ? ${vb}
      GROUP BY b.created_by, b.guest_phone HAVING n >= 3 ORDER BY n DESC`,
    [fromUnix, toUnix, ...vp],
  );
  for (const r of repeat) {
    push('medium', 'REPEAT_GUEST', 'Một nhân sự đặt nhiều lần cho cùng một khách',
      `${r.creator} đặt ${r.n} đơn tại quầy cho ${r.guest_name || 'khách'} (${r.guest_phone}), tổng ${Number(r.amount).toLocaleString('vi-VN')}đ`,
      { at: toVN(r.at), actor: r.creator, venue: r.venue_name });
  }

  // 4. Quên ra ca nhiều lần: hệ thống phải tự kết thúc ca
  const [autoOut] = await pool.query(
    `SELECT u.full_name, COUNT(*) AS n, MAX(UNIX_TIMESTAMP(l.created_at)) AS at, MAX(v.name) AS venue_name
       FROM audit_logs l JOIN users u ON u.id = JSON_UNQUOTE(JSON_EXTRACT(l.new_values, '$.userId')) LEFT JOIN venues v ON v.id = l.venue_id
      WHERE l.action_type = 'AUTO_CLOCK_OUT' AND UNIX_TIMESTAMP(l.created_at) BETWEEN ? AND ? ${vl} GROUP BY u.id HAVING n >= 2`,
    [fromUnix, toUnix, ...vp],
  );
  for (const r of autoOut) push('medium', 'AUTO_CLOCK_OUT', 'Quên ra ca nhiều lần', `${r.full_name} để hệ thống tự kết thúc ca ${r.n} lần`, { at: toVN(r.at), actor: r.full_name, venue: r.venue_name });

  // 5. Vào ca trễ quá thời gian cho phép
  const [late] = await pool.query(
    `SELECT u.full_name, COUNT(*) AS n, MAX(CAST(JSON_EXTRACT(l.new_values, '$.lateMinutes') AS UNSIGNED)) AS worst, MAX(UNIX_TIMESTAMP(l.created_at)) AS at, MAX(v.name) AS venue_name
       FROM audit_logs l JOIN users u ON u.id = l.actor_id LEFT JOIN venues v ON v.id = l.venue_id
      WHERE l.action_type = 'CLOCK_IN' AND CAST(JSON_EXTRACT(l.new_values, '$.lateMinutes') AS UNSIGNED) > ? AND UNIX_TIMESTAMP(l.created_at) BETWEEN ? AND ? ${vl}
      GROUP BY u.id`,
    [grace, fromUnix, toUnix, ...vp],
  );
  for (const r of late) push(r.n >= 3 ? 'medium' : 'low', 'LATE_CLOCK_IN', 'Vào ca trễ', `${r.full_name} vào ca trễ ${r.n} lần, trễ nhất ${r.worst} phút`, { at: toVN(r.at), actor: r.full_name, venue: r.venue_name });

  // 6. Quản lý ghi bù hoặc sửa giờ chấm công: ảnh hưởng trực tiếp tiền lương
  const [edits] = await pool.query(
    `SELECT l.action_type, a.full_name AS actor, l.reason, l.old_values, l.new_values, UNIX_TIMESTAMP(l.created_at) AS at, v.name AS venue_name
       FROM audit_logs l JOIN users a ON a.id = l.actor_id LEFT JOIN venues v ON v.id = l.venue_id
      WHERE l.action_type IN ('ADD_ATTENDANCE', 'EDIT_ATTENDANCE') AND UNIX_TIMESTAMP(l.created_at) BETWEEN ? AND ? ${vl} ORDER BY l.id DESC`,
    [fromUnix, toUnix, ...vp],
  );
  for (const r of edits) {
    const nv = parse(r.new_values) || {};
    push('low', 'ATTENDANCE_EDIT', r.action_type === 'ADD_ATTENDANCE' ? 'Quản lý ghi bù chấm công' : 'Quản lý sửa giờ chấm công',
      `${r.actor}: ${nv.clockIn || ''} → ${nv.clockOut || ''}. Lý do: ${r.reason || 'không ghi'}`, { at: toVN(r.at), actor: r.actor, venue: r.venue_name });
  }

  // 7. Đăng nhập sai nhiều lần vào tài khoản nội bộ
  const [failed] = await pool.query(
    `SELECT u.full_name, COUNT(*) AS n, MAX(UNIX_TIMESTAMP(l.created_at)) AS at FROM audit_logs l JOIN users u ON u.id = l.entity_id
      WHERE l.action_type = 'LOGIN_FAILED' AND UNIX_TIMESTAMP(l.created_at) BETWEEN ? AND ? GROUP BY u.id HAVING n >= 5`,
    [fromUnix, toUnix],
  );
  for (const r of failed) push('medium', 'LOGIN_FAILED', 'Đăng nhập sai nhiều lần', `Tài khoản ${r.full_name} bị nhập sai mật khẩu ${r.n} lần`, { at: toVN(r.at), actor: r.full_name });

  const order = { high: 0, medium: 1, low: 2 };
  out.sort((a, b) => order[a.severity] - order[b.severity] || String(b.at).localeCompare(String(a.at)));
  return {
    from: start, to: end, alerts: out,
    summary: { high: out.filter((a) => a.severity === 'high').length, medium: out.filter((a) => a.severity === 'medium').length, low: out.filter((a) => a.severity === 'low').length },
  };
}

module.exports = { list, filters, alerts };
