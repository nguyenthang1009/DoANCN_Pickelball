const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { assertDate, toMinutes, hhmm } = require('../utils/time');
const audit = require('./audit.service');
const configService = require('./config.service');

const DT = (col) => `DATE_FORMAT(${col}, '%Y-%m-%d %H:%i:%s')`;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2} ([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;
// Được vào ca sớm tối đa bao nhiêu phút trước giờ bắt đầu, và trễ quá bao nhiêu phút thì ghi đi trễ (đọc từ system_configs)
const earlyMinutes = () => configService.getNumber('CLOCK_IN_EARLY_MINUTES', 15);
const lateGraceMinutes = () => configService.getNumber('LATE_GRACE_MINUTES', 5);
const EARLY_CLOCK_IN_MINUTES = 15; // chỉ dùng để tìm ca khi quản lý ghi bù

// Giờ Việt Nam hiện tại dạng 'YYYY-MM-DD HH:MM:SS', không phụ thuộc múi giờ máy chủ
const nowVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const addMinutes = (datetime, minutes) => new Date(Date.parse(`${datetime.replace(' ', 'T')}Z`) + minutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
const minutesBetween = (a, b) => Math.round((Date.parse(`${b.replace(' ', 'T')}Z`) - Date.parse(`${a.replace(' ', 'T')}Z`)) / 60000);
const normalizeDateTime = (value, field) => {
  if (typeof value !== 'string' || !DATETIME_RE.test(value.trim())) throw new HttpError(400, 'VALIDATION_ERROR', `${field} phải có dạng YYYY-MM-DD HH:MM`);
  const v = value.trim();
  assertDate(v.slice(0, 10), field);
  return v.length === 16 ? `${v}:00` : v;
};

const scopeVenue = (user, venueId) => {
  const id = user.role === 'ADMIN' ? Number(venueId) : user.venueId;
  if (!id) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần chọn cơ sở');
  return id;
};
const assertVenue = (user, venueId) => {
  if (user.role !== 'ADMIN' && user.venueId !== venueId) throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được thao tác trên cơ sở của mình');
};

async function staffOf(userId, db = pool) {
  const [rows] = await db.query("SELECT id, full_name, role, venue_id, is_active FROM users WHERE id = ? AND role IN ('MANAGER', 'STAFF')", [userId]);
  if (!rows[0] || !rows[0].is_active || !rows[0].venue_id) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy nhân sự đang làm việc');
  return rows[0];
}

// Bảng lương tháng đó đã duyệt thì chấm công tháng đó bị khóa, sửa sẽ lệch với số đã ghi sổ
async function assertMonthOpen(db, venueId, datetime) {
  const [rows] = await db.query("SELECT status FROM payroll_periods WHERE venue_id = ? AND period_month = ? AND status <> 'DRAFT'", [venueId, datetime.slice(0, 7)]);
  if (rows[0]) throw new HttpError(409, 'PAYROLL_LOCKED', `Bảng lương tháng ${datetime.slice(0, 7)} đã duyệt, không sửa chấm công được`);
}

// ---------- Mẫu ca ----------
const toTemplate = (r) => ({ id: r.id, venueId: r.venue_id, name: r.name, start: hhmm(r.start_time), end: hhmm(r.end_time), active: Boolean(r.is_active), overnight: r.end_time <= r.start_time });

async function listTemplates(user, venueId) {
  const [rows] = await pool.query('SELECT * FROM shift_templates WHERE venue_id = ? ORDER BY is_active DESC, start_time', [scopeVenue(user, venueId)]);
  return rows.map(toTemplate);
}

async function saveTemplate(user, body, id = null) {
  const { name, start, end, active = true } = body;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 50) throw new HttpError(400, 'VALIDATION_ERROR', 'Tên ca từ 1 đến 50 ký tự');
  const s = toMinutes(start, 'start');
  const e = toMinutes(end, 'end');
  if (s === e) throw new HttpError(400, 'VALIDATION_ERROR', 'Giờ bắt đầu và kết thúc phải khác nhau');
  let venueId;
  if (id) {
    const [rows] = await pool.query('SELECT venue_id FROM shift_templates WHERE id = ?', [id]);
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy mẫu ca');
    venueId = rows[0].venue_id;
    assertVenue(user, venueId);
  } else venueId = scopeVenue(user, body.venueId);
  try {
    if (id) await pool.query('UPDATE shift_templates SET name = ?, start_time = ?, end_time = ?, is_active = ? WHERE id = ?', [name.trim(), start, end, Boolean(active), id]);
    else [{ insertId: id }] = await pool.query('INSERT INTO shift_templates (venue_id, name, start_time, end_time) VALUES (?, ?, ?, ?)', [venueId, name.trim(), start, end]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'DUPLICATE_NAME', 'Cơ sở đã có ca trùng tên');
    throw err;
  }
  await audit.log(pool, { actorId: user.id, venueId, actionType: 'SAVE_SHIFT_TEMPLATE', entityType: 'SHIFT_TEMPLATE', entityId: id, newValues: { name: name.trim(), start, end, active: Boolean(active) } });
  return { templates: await listTemplates(user, venueId) };
}

// ---------- Lịch ca ----------
function assertRange(from, to) {
  assertDate(from, 'from');
  assertDate(to, 'to');
  if (to < from || (Date.parse(to) - Date.parse(from)) / 86400000 > 62) throw new HttpError(400, 'VALIDATION_ERROR', 'Khoảng ngày tối đa 62 ngày');
}

const toAssignment = (r) => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, templateId: r.template_id, shiftName: r.shift_name, workDate: r.work_date,
  startsAt: r.starts_at, endsAt: r.ends_at, clockIn: r.clock_in ?? null, clockOut: r.clock_out ?? null,
});

const ASSIGNMENT_SELECT = `
  SELECT a.id, a.user_id, u.full_name, a.template_id, t.name AS shift_name, a.work_date, ${DT('a.starts_at')} AS starts_at, ${DT('a.ends_at')} AS ends_at,
         ${DT('MIN(r.clock_in)')} AS clock_in, ${DT('MAX(r.clock_out)')} AS clock_out
    FROM shift_assignments a JOIN users u ON u.id = a.user_id JOIN shift_templates t ON t.id = a.template_id
    LEFT JOIN attendance_records r ON r.assignment_id = a.id`;

async function schedule(user, { venueId, from, to }) {
  const venue = scopeVenue(user, venueId);
  assertRange(from, to);
  const [staff] = await pool.query("SELECT id, full_name, role FROM users WHERE venue_id = ? AND role IN ('MANAGER', 'STAFF') AND is_active = TRUE ORDER BY role, id", [venue]);
  const [rows] = await pool.query(`${ASSIGNMENT_SELECT} WHERE a.venue_id = ? AND a.work_date BETWEEN ? AND ? GROUP BY a.id ORDER BY a.work_date, a.starts_at`, [venue, from, to]);
  return { venueId: venue, staff: staff.map((s) => ({ userId: s.id, fullName: s.full_name, role: s.role })), templates: await listTemplates(user, venue), assignments: rows.map(toAssignment) };
}

async function assign(user, { userId, workDate, templateId }) {
  assertDate(workDate, 'workDate');
  const person = await staffOf(Number(userId));
  assertVenue(user, person.venue_id);
  const [templates] = await pool.query('SELECT * FROM shift_templates WHERE id = ? AND venue_id = ? AND is_active = TRUE', [Number(templateId), person.venue_id]);
  if (!templates[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy mẫu ca của cơ sở này');
  const t = templates[0];
  const startsAt = `${workDate} ${hhmm(t.start_time)}:00`;
  const length = (toMinutes(t.end_time) - toMinutes(t.start_time) + 1440) % 1440;
  const endsAt = addMinutes(startsAt, length);
  return withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [person.id]); // xếp ca cho cùng một người lần lượt
    const [overlap] = await conn.query('SELECT id FROM shift_assignments WHERE user_id = ? AND starts_at < ? AND ends_at > ?', [person.id, endsAt, startsAt]);
    if (overlap[0]) throw new HttpError(409, 'SHIFT_OVERLAP', `${person.full_name} đã có ca trùng giờ`);
    const [res] = await conn.query(
      'INSERT INTO shift_assignments (venue_id, user_id, template_id, work_date, starts_at, ends_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [person.venue_id, person.id, t.id, workDate, startsAt, endsAt, user.id],
    );
    await audit.log(conn, { actorId: user.id, venueId: person.venue_id, actionType: 'ASSIGN_SHIFT', entityType: 'SHIFT', entityId: res.insertId, newValues: { userId: person.id, workDate, shift: t.name } });
    return { id: res.insertId };
  });
}

async function unassign(user, id) {
  return withTransaction(async (conn) => {
    const [rows] = await conn.query('SELECT * FROM shift_assignments WHERE id = ? FOR UPDATE', [id]);
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy ca');
    assertVenue(user, rows[0].venue_id);
    const [used] = await conn.query('SELECT id FROM attendance_records WHERE assignment_id = ? LIMIT 1', [id]);
    if (used[0]) throw new HttpError(409, 'SHIFT_HAS_ATTENDANCE', 'Ca đã có chấm công, không xóa được');
    await conn.query('DELETE FROM shift_assignments WHERE id = ?', [id]);
    await audit.log(conn, { actorId: user.id, venueId: rows[0].venue_id, actionType: 'UNASSIGN_SHIFT', entityType: 'SHIFT', entityId: id, oldValues: { userId: rows[0].user_id, workDate: rows[0].work_date } });
    return { ok: true };
  });
}

// ---------- Vào ca, ra ca ----------
// Giờ được tính công: tự chấm theo ca thì tính từ giờ bắt đầu ca (vào sớm không tính) tới lúc ra ca (không quá giờ hết ca).
// Quản lý ghi bù hoặc sửa thì tính đúng giờ đã ghi, vì đó là phần làm thêm đã được duyệt kèm lý do.
const countedStart = (r) => (r.source === 'SELF' && r.starts_at && r.clock_in < r.starts_at ? r.starts_at : r.clock_in);
const toRecord = (r) => ({
  id: r.id, userId: r.user_id, fullName: r.full_name, assignmentId: r.assignment_id, shiftName: r.shift_name ?? null,
  shiftStart: r.starts_at ?? null, shiftEnd: r.ends_at ?? null,
  clockIn: r.clock_in, clockOut: r.clock_out, minutes: r.clock_out ? Math.max(0, minutesBetween(countedStart(r), r.clock_out)) : null,
  lateMinutes: r.source === 'SELF' && r.starts_at ? Math.max(0, minutesBetween(r.starts_at, r.clock_in)) : 0,
  autoClosed: Boolean(r.auto_closed), source: r.source, note: r.note,
});
const RECORD_SELECT = `
  SELECT r.id, r.user_id, u.full_name, r.assignment_id, t.name AS shift_name, ${DT('r.clock_in')} AS clock_in, ${DT('r.clock_out')} AS clock_out,
         ${DT('a.starts_at')} AS starts_at, ${DT('a.ends_at')} AS ends_at, r.source, r.auto_closed, r.note
    FROM attendance_records r JOIN users u ON u.id = r.user_id
    LEFT JOIN shift_assignments a ON a.id = r.assignment_id LEFT JOIN shift_templates t ON t.id = a.template_id`;

async function openRecord(userId, db = pool) {
  const [rows] = await db.query(`${RECORD_SELECT} WHERE r.user_id = ? AND r.clock_out IS NULL`, [userId]);
  return rows[0] ? toRecord(rows[0]) : null;
}

// Đang trong ca hợp lệ: có lượt chưa ra ca, gắn với ca được phân công tại đúng cơ sở, và ca chưa hết giờ.
// Kiểm tra cả giờ hết ca, không chờ tác vụ nền tự kết thúc ca.
async function activeDuty(user, db = pool) {
  const [rows] = await db.query(
    `SELECT r.id, ${DT('a.ends_at')} AS ends_at, t.name AS shift_name FROM attendance_records r
       JOIN shift_assignments a ON a.id = r.assignment_id JOIN shift_templates t ON t.id = a.template_id
      WHERE r.user_id = ? AND r.venue_id = ? AND r.clock_out IS NULL AND a.ends_at > ?`,
    [user.id, user.venueId ?? 0, nowVN()],
  );
  return rows[0] ?? null;
}

async function assertOnDuty(user) {
  if (user.role === 'ADMIN') throw new HttpError(403, 'ADMIN_NO_FRONTLINE', 'Tài khoản quản trị không đặt sân, bán hàng hay check-in. Việc này do nhân sự cơ sở làm trong ca trực.');
  if (!(await activeDuty(user))) {
    throw new HttpError(403, 'NOT_ON_DUTY', 'Bạn chưa vào ca trực nên chưa thao tác được. Vào trang Chấm công để vào ca theo lịch đã được phân công.');
  }
}

// Ca sắp tới gần nhất chưa chấm công, để báo cho nhân viên khi chưa vào ca được
async function nextShift(userId, now, db = pool) {
  const [rows] = await db.query(
    `SELECT t.name, ${DT('a.starts_at')} AS starts_at, ${DT('a.ends_at')} AS ends_at FROM shift_assignments a
       JOIN shift_templates t ON t.id = a.template_id LEFT JOIN attendance_records r ON r.assignment_id = a.id
      WHERE a.user_id = ? AND a.ends_at > ? AND r.id IS NULL ORDER BY a.starts_at LIMIT 1`,
    [userId, now],
  );
  return rows[0] ?? null;
}

async function clockIn(user) {
  if (!user.venueId) throw new HttpError(409, 'NO_VENUE', 'Tài khoản chưa được gán cơ sở');
  const now = nowVN();
  const early = await earlyMinutes();
  try {
    await withTransaction(async (conn) => {
      await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [user.id]);
      if (await openRecord(user.id, conn)) throw new HttpError(409, 'ALREADY_CLOCKED_IN', 'Bạn đang trong ca, cần ra ca trước');
      // Chỉ vào ca theo lịch được phân công tại đúng cơ sở của mình, trong khung giờ ca (cho phép sớm vài phút).
      // Không có ca thì không vào được: tránh làm thay người khác hay tự ý vào ca để tính lương.
      const [shifts] = await conn.query(
        `SELECT a.id, ${DT('a.starts_at')} AS starts_at, t.name FROM shift_assignments a JOIN shift_templates t ON t.id = a.template_id
           LEFT JOIN attendance_records r ON r.assignment_id = a.id
          WHERE a.user_id = ? AND a.venue_id = ? AND a.starts_at <= ? AND a.ends_at > ? AND r.id IS NULL ORDER BY a.starts_at LIMIT 1`,
        [user.id, user.venueId, addMinutes(now, early), now],
      );
      if (!shifts[0]) {
        const next = await nextShift(user.id, now, conn);
        throw new HttpError(409, 'NO_ASSIGNED_SHIFT', next
          ? `Chưa tới giờ vào ca. Ca tới của bạn: ${next.name} ${next.starts_at.slice(8, 10)}/${next.starts_at.slice(5, 7)} lúc ${next.starts_at.slice(11, 16)}, được vào sớm tối đa ${early} phút.`
          : 'Bạn không có ca nào được phân công lúc này. Liên hệ quản lý để được xếp ca.');
      }
      const late = minutesBetween(shifts[0].starts_at, now);
      const [res] = await conn.query('INSERT INTO attendance_records (venue_id, user_id, assignment_id, clock_in, source) VALUES (?, ?, ?, ?, ?)', [user.venueId, user.id, shifts[0].id, now, 'SELF']);
      await audit.log(conn, {
        actorId: user.id, venueId: user.venueId, actionType: 'CLOCK_IN', entityType: 'ATTENDANCE', entityId: res.insertId,
        newValues: { shift: shifts[0].name, shiftStart: shifts[0].starts_at, clockIn: now, lateMinutes: late > 0 ? late : 0 },
      });
    });
  } catch (err) {
    // Bấm hai lần cùng lúc: ràng buộc một lượt đang mở chặn lượt thứ hai
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'ALREADY_CLOCKED_IN', 'Bạn đang trong ca, cần ra ca trước');
    throw err;
  }
  return myStatus(user);
}

async function clockOut(user) {
  const now = nowVN();
  await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT r.id, r.venue_id, ${DT('r.clock_in')} AS clock_in, ${DT('a.ends_at')} AS ends_at FROM attendance_records r
         LEFT JOIN shift_assignments a ON a.id = r.assignment_id WHERE r.user_id = ? AND r.clock_out IS NULL FOR UPDATE`,
      [user.id],
    );
    if (!rows[0]) throw new HttpError(409, 'NOT_CLOCKED_IN', 'Bạn chưa vào ca');
    // Ra ca muộn hơn giờ hết ca không được tính thêm: làm thêm phải được quản lý ghi nhận kèm lý do
    if (now <= rows[0].clock_in) throw new HttpError(409, 'TOO_SOON', 'Vừa vào ca, hãy thử lại sau ít giây');
    // Ca bị dời giờ sau khi đã vào ca thì đóng lượt ngay sau giờ vào (không tính công), không để kẹt lượt mở
    const capped = rows[0].ends_at && rows[0].ends_at < now ? rows[0].ends_at : now;
    const out = capped > rows[0].clock_in ? capped : addMinutes(rows[0].clock_in, 1 / 60);
    await conn.query('UPDATE attendance_records SET clock_out = ? WHERE id = ?', [out, rows[0].id]);
    await audit.log(conn, { actorId: user.id, venueId: rows[0].venue_id, actionType: 'CLOCK_OUT', entityType: 'ATTENDANCE', entityId: rows[0].id, newValues: { clockOut: out } });
  });
  return myStatus(user);
}

// Tác vụ nền: hết giờ ca mà chưa ra ca thì tự kết thúc đúng tại giờ hết ca, để không tính lương sai
async function autoClockOut() {
  const now = nowVN();
  const [rows] = await pool.query(
    `SELECT r.id, r.user_id, r.venue_id, ${DT('GREATEST(a.ends_at, r.clock_in + INTERVAL 1 SECOND)')} AS ends_at FROM attendance_records r
       JOIN shift_assignments a ON a.id = r.assignment_id WHERE r.clock_out IS NULL AND a.ends_at <= ?`,
    [now],
  );
  for (const r of rows) {
    const [res] = await pool.query("UPDATE attendance_records SET clock_out = ?, auto_closed = TRUE, note = 'Hệ thống tự kết thúc khi hết giờ ca' WHERE id = ? AND clock_out IS NULL", [r.ends_at, r.id]);
    if (res.affectedRows) await audit.log(pool, { actorId: null, venueId: r.venue_id, actionType: 'AUTO_CLOCK_OUT', entityType: 'ATTENDANCE', entityId: r.id, newValues: { userId: r.user_id, clockOut: r.ends_at } });
  }
  return rows.length;
}

// Trạng thái của chính mình: lượt đang mở, lịch ca 7 ngày tới, tổng giờ trong tháng
async function myStatus(user) {
  const now = nowVN();
  const today = now.slice(0, 10);
  const weekEnd = addMinutes(`${today} 00:00:00`, 7 * 1440).slice(0, 10);
  const [shifts] = await pool.query(`${ASSIGNMENT_SELECT} WHERE a.user_id = ? AND a.work_date BETWEEN ? AND ? GROUP BY a.id ORDER BY a.starts_at`, [user.id, today, weekEnd]);
  const [records] = await pool.query(`${RECORD_SELECT} WHERE r.user_id = ? AND r.clock_in >= ? ORDER BY r.clock_in DESC`, [user.id, `${today.slice(0, 7)}-01 00:00:00`]);
  const list = records.map(toRecord);
  const duty = await activeDuty(user);
  return {
    now, open: list.find((r) => !r.clockOut) ?? null, onDuty: Boolean(duty), dutyEndsAt: duty?.ends_at ?? null,
    nextShift: duty ? null : await nextShift(user.id, now), earlyMinutes: await earlyMinutes(), lateGraceMinutes: await lateGraceMinutes(),
    shifts: shifts.map(toAssignment), records: list, monthMinutes: list.reduce((s, r) => s + (r.minutes ?? 0), 0),
  };
}

// Ai đang trong ca: lượt chưa ra ca của cơ sở
async function onDuty(user, venueId) {
  const venue = scopeVenue(user, venueId);
  const [rows] = await pool.query(`${RECORD_SELECT} WHERE r.venue_id = ? AND r.clock_out IS NULL ORDER BY r.clock_in`, [venue]);
  const now = nowVN();
  return rows.map((r) => ({ ...toRecord(r), minutes: minutesBetween(r.clock_in, now) }));
}

// ---------- Quản lý sửa chấm công ----------
async function listAttendance(user, { venueId, month }) {
  const venue = scopeVenue(user, venueId);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError(400, 'VALIDATION_ERROR', 'month phải có dạng YYYY-MM');
  const [rows] = await pool.query(`${RECORD_SELECT} WHERE r.venue_id = ? AND r.clock_in >= ? AND r.clock_in < DATE_ADD(?, INTERVAL 1 MONTH) ORDER BY r.clock_in DESC`, [venue, `${month}-01`, `${month}-01`]);
  return rows.map(toRecord);
}

async function writeRecord(conn, user, person, { clockIn, clockOut }, excludeId) {
  if (clockOut && clockOut <= clockIn) throw new HttpError(400, 'VALIDATION_ERROR', 'Giờ ra phải sau giờ vào');
  if (clockOut && minutesBetween(clockIn, clockOut) > 24 * 60) throw new HttpError(400, 'VALIDATION_ERROR', 'Một lượt chấm công không quá 24 giờ');
  if (clockIn > nowVN() || (clockOut && clockOut > nowVN())) throw new HttpError(400, 'VALIDATION_ERROR', 'Không ghi giờ trong tương lai');
  await assertMonthOpen(conn, person.venue_id, clockIn);
  const [overlap] = await conn.query(
    'SELECT id FROM attendance_records WHERE user_id = ? AND id <> ? AND clock_in < ? AND COALESCE(clock_out, ?) > ?',
    [person.id, excludeId ?? 0, clockOut ?? '9999-12-31 00:00:00', '9999-12-31 00:00:00', clockIn],
  );
  if (overlap[0]) throw new HttpError(409, 'ATTENDANCE_OVERLAP', 'Trùng giờ với lượt chấm công khác');
}

// Quản lý ghi bù lượt quên chấm. Không tự ghi cho mình vì ảnh hưởng trực tiếp tới lương của mình.
async function addAttendance(user, body) {
  const person = await staffOf(Number(body.userId));
  assertVenue(user, person.venue_id);
  if (person.id === user.id) throw new HttpError(409, 'CANNOT_EDIT_OWN_ATTENDANCE', 'Không được tự sửa chấm công của mình');
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần ghi lý do');
  const clockIn = normalizeDateTime(body.clockIn, 'clockIn');
  const clockOut = normalizeDateTime(body.clockOut, 'clockOut');
  return withTransaction(async (conn) => {
    await conn.query('SELECT id FROM users WHERE id = ? FOR UPDATE', [person.id]);
    await writeRecord(conn, user, person, { clockIn, clockOut });
    const [shifts] = await conn.query('SELECT id FROM shift_assignments WHERE user_id = ? AND starts_at <= ? AND ends_at > ? LIMIT 1', [person.id, addMinutes(clockIn, EARLY_CLOCK_IN_MINUTES), clockIn]);
    const [res] = await conn.query(
      'INSERT INTO attendance_records (venue_id, user_id, assignment_id, clock_in, clock_out, source, note, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [person.venue_id, person.id, shifts[0]?.id ?? null, clockIn, clockOut, 'MANAGER', note, user.id],
    );
    await audit.log(conn, { actorId: user.id, venueId: person.venue_id, actionType: 'ADD_ATTENDANCE', entityType: 'ATTENDANCE', entityId: res.insertId, newValues: { userId: person.id, clockIn, clockOut }, reason: note });
    return { id: res.insertId };
  });
}

async function updateAttendance(user, id, body) {
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  if (!note) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần ghi lý do');
  return withTransaction(async (conn) => {
    const [rows] = await conn.query(`SELECT id, user_id, venue_id, ${DT('clock_in')} AS clock_in, ${DT('clock_out')} AS clock_out FROM attendance_records WHERE id = ? FOR UPDATE`, [id]);
    if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy lượt chấm công');
    const old = rows[0];
    assertVenue(user, old.venue_id);
    if (old.user_id === user.id) throw new HttpError(409, 'CANNOT_EDIT_OWN_ATTENDANCE', 'Không được tự sửa chấm công của mình');
    const person = await staffOf(old.user_id, conn);
    const clockIn = body.clockIn === undefined ? old.clock_in : normalizeDateTime(body.clockIn, 'clockIn');
    const clockOut = body.clockOut === undefined ? old.clock_out : body.clockOut === null ? null : normalizeDateTime(body.clockOut, 'clockOut');
    await assertMonthOpen(conn, old.venue_id, old.clock_in);
    await writeRecord(conn, user, person, { clockIn, clockOut }, id);
    await conn.query("UPDATE attendance_records SET clock_in = ?, clock_out = ?, note = ?, source = 'MANAGER', updated_by = ? WHERE id = ?", [clockIn, clockOut, note, user.id, id]);
    await audit.log(conn, { actorId: user.id, venueId: old.venue_id, actionType: 'EDIT_ATTENDANCE', entityType: 'ATTENDANCE', entityId: id, oldValues: { clockIn: old.clock_in, clockOut: old.clock_out }, newValues: { clockIn, clockOut }, reason: note });
    return { ok: true };
  });
}

// ---------- Ngày lễ ----------
async function listHolidays(year) {
  const y = Number(year) || Number(nowVN().slice(0, 4));
  const [rows] = await pool.query("SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date, name, legal_ref FROM public_holidays WHERE YEAR(holiday_date) = ? ORDER BY holiday_date", [y]);
  return rows.map((r) => ({ date: r.date, name: r.name, legalRef: r.legal_ref }));
}

async function addHoliday(user, { date, name, legalRef }) {
  assertDate(date, 'date');
  if (typeof name !== 'string' || !name.trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần tên ngày lễ');
  if (typeof legalRef !== 'string' || !legalRef.trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần ghi căn cứ pháp lý');
  try {
    await pool.query('INSERT INTO public_holidays (holiday_date, name, legal_ref, updated_by) VALUES (?, ?, ?, ?)', [date, name.trim(), legalRef.trim(), user.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'HOLIDAY_EXISTS', 'Ngày này đã là ngày lễ');
    throw err;
  }
  await audit.log(pool, { actorId: user.id, actionType: 'ADD_HOLIDAY', entityType: 'HOLIDAY', entityId: 0, newValues: { date, name: name.trim() }, reason: legalRef.trim() });
  return { holidays: await listHolidays(date.slice(0, 4)) };
}

async function removeHoliday(user, date) {
  assertDate(date, 'date');
  const [res] = await pool.query('DELETE FROM public_holidays WHERE holiday_date = ?', [date]);
  if (!res.affectedRows) throw new HttpError(404, 'NOT_FOUND', 'Không có ngày lễ này');
  await audit.log(pool, { actorId: user.id, actionType: 'REMOVE_HOLIDAY', entityType: 'HOLIDAY', entityId: 0, oldValues: { date } });
  return { holidays: await listHolidays(date.slice(0, 4)) };
}

// Ngày lễ quanh một tháng (lấy thêm 7 ngày trước để xét nghỉ bù của lễ cuối tháng trước)
async function holidaysAround(month, db = pool) {
  const [rows] = await db.query(
    "SELECT DATE_FORMAT(holiday_date, '%Y-%m-%d') AS date, name FROM public_holidays WHERE holiday_date >= DATE_SUB(?, INTERVAL 7 DAY) AND holiday_date < DATE_ADD(?, INTERVAL 1 MONTH)",
    [`${month}-01`, `${month}-01`],
  );
  return new Map(rows.map((r) => [r.date, r.name]));
}

// Các lượt đã ra ca của một người bắt đầu trong tháng, kèm độ dài ca theo lịch
async function closedRecords(userId, month, db = pool) {
  const [rows] = await db.query(
    `SELECT ${DT('r.clock_in')} AS clock_in, ${DT('r.clock_out')} AS clock_out, ${DT('a.starts_at')} AS starts_at, r.source,
            TIMESTAMPDIFF(MINUTE, a.starts_at, a.ends_at) AS shift_minutes
       FROM attendance_records r LEFT JOIN shift_assignments a ON a.id = r.assignment_id
      WHERE r.user_id = ? AND r.clock_out IS NOT NULL AND r.clock_in >= ? AND r.clock_in < DATE_ADD(?, INTERVAL 1 MONTH)`,
    [userId, `${month}-01`, `${month}-01`],
  );
  const [[{ open }]] = await db.query('SELECT COUNT(*) AS open FROM attendance_records WHERE user_id = ? AND clock_out IS NULL AND clock_in < DATE_ADD(?, INTERVAL 1 MONTH)', [userId, `${month}-01`]);
  return { records: rows.map((r) => ({ clockIn: countedStart(r), clockOut: r.clock_out, shiftMinutes: r.shift_minutes })), open: Number(open) };
}

module.exports = {
  listTemplates, saveTemplate, schedule, assign, unassign, clockIn, clockOut, myStatus, onDuty, assertOnDuty, autoClockOut,
  listAttendance, addAttendance, updateAttendance, listHolidays, addHoliday, removeHoliday, holidaysAround, closedRecords, nowVN,
};
