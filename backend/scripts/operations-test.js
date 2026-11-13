// Kiểm thử kiểm soát thao tác: Admin không đặt sân, bán hàng, check-in; nhân sự chỉ thao tác khi đang trong ca được
// phân công; tự kết thúc ca; nhật ký hoạt động, cảnh báo bất thường; ảnh món; sửa nhân sự; bảo vệ khách đang chơi
// (không bảo trì, hủy, đổi sân, tắt đèn khi khách đang chơi); xóa khung giá; xóa bảng lương nháp.
// Chạy trên CSDL vừa khởi tạo lại:
//   DB_NAME=pickleball_booking_e2e node scripts/operations-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { putOnDuty } = require('./lib/duty');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const ORIGIN = BASE.replace(/\/api$/, '');
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const expectError = (name, r, status, code) => check(name, r.status === status && r.data?.error?.code === code, `-> ${r.status} ${r.data?.error?.code} ${r.data?.error?.message ?? ''}`);
async function call(path, { method = 'GET', body, token, raw, type } = {}) {
  const headers = { ...(token && { Authorization: `Bearer ${token}` }), ...(raw ? { 'Content-Type': type } : body ? { 'Content-Type': 'application/json' } : {}) };
  const res = await fetch(`${BASE}${path}`, { method, headers, body: raw ?? (body && JSON.stringify(body)) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier, password = '12345678') => (await call('/auth/login', { method: 'POST', body: { identifier, password } })).data?.token;
const vnNow = () => new Date(Date.now() + 7 * 3600e3);
const vnDate = (offsetDays = 0) => new Date(vnNow().getTime() + offsetDays * 86400e3).toISOString().slice(0, 10);
const vnDateTime = (offsetMinutes = 0) => new Date(vnNow().getTime() + offsetMinutes * 60000).toISOString().slice(0, 19).replace('T', ' ');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

(async () => {
  const db = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME, dateStrings: true });
  const [admin, manager, staff, customer] = await Promise.all(['admin@pickleball.vn', 'manager.q7@pickleball.vn', 'staff.q7@pickleball.vn', 'customer1@gmail.com'].map((u) => login(u)));
  const pos = (token, extra = {}) => call('/bookings', { method: 'POST', token, body: { courtId: 1, date: vnDate(3), start: '08:00', end: '09:00', guestName: 'Khách quầy', guestPhone: '0912888777', paymentMethod: 'CASH', ...extra } });
  const services = (await call('/venues/1/services', { token: manager })).data.services;
  const sale = { items: [{ serviceId: services[0].id, quantity: 1 }], paymentMethod: 'CASH' };

  console.log('\n--- Admin chỉ giám sát, không thao tác tại quầy');
  const adminMe = (await call('/auth/me', { token: admin })).data.user;
  check('Admin không có quyền đặt tại quầy, bán hàng, check-in, chấm công', !['pos.create', 'pos.sell', 'checkin.perform', 'attendance.self'].some((p) => adminMe.permissions.includes(p)));
  expectError('Admin không đặt sân tại quầy', await pos(admin), 403, 'ADMIN_NO_FRONTLINE');
  expectError('Admin không bán dịch vụ', await call('/venues/1/service-orders', { method: 'POST', token: admin, body: sale }), 403, 'FORBIDDEN');
  expectError('Admin không check-in khách', await call('/checkin/lookup', { method: 'POST', token: admin, body: { code: 'PKB-X' } }), 403, 'FORBIDDEN');
  expectError('Admin không vào ca', await call('/shifts/me/clock-in', { method: 'POST', token: admin }), 403, 'FORBIDDEN');
  const role = await call('/admin/roles', { method: 'POST', token: admin, body: { name: `Lễ tân phụ ${Date.now() % 100000}`, baseRole: 'STAFF', permissions: ['pos.create', 'checkin.perform', 'attendance.self'] } });
  check('Admin vẫn cấp được quyền tại quầy cho vai trò của nhân sự', role.status === 201 || role.status === 200, JSON.stringify(role.data));
  const staffMe = (await call('/auth/me', { token: staff })).data.user;
  check('Tài khoản lễ tân biết quyền nào cần đang trong ca', ['pos.create', 'pos.sell', 'checkin.perform'].every((p) => staffMe.dutyPermissions.includes(p)));

  console.log('\n--- Chưa vào ca thì không thao tác tại quầy');
  expectError('Lễ tân chưa vào ca không đặt sân tại quầy được', await pos(staff), 403, 'NOT_ON_DUTY');
  expectError('Lễ tân chưa vào ca không bán dịch vụ được', await call('/venues/1/service-orders', { method: 'POST', token: staff, body: sale }), 403, 'NOT_ON_DUTY');
  expectError('Lễ tân chưa vào ca không check-in được', await call('/checkin/lookup', { method: 'POST', token: staff, body: { code: 'PKB-X' } }), 403, 'NOT_ON_DUTY');
  const online = await call('/bookings', { method: 'POST', token: customer, body: { courtId: 2, date: vnDate(3), start: '10:00', end: '11:00' } });
  check('Khách vẫn đặt online bình thường', online.status === 201, JSON.stringify(online.data));
  check('Khách vẫn tự thanh toán được', (await call(`/payments/mock/${online.data.booking.bookingCode}/pay`, { method: 'POST', token: customer })).status === 200);

  console.log('\n--- Chỉ vào ca theo lịch được phân công');
  const noShift = await call('/shifts/me/clock-in', { method: 'POST', token: staff });
  expectError('Chưa được xếp ca thì không vào ca được', noShift, 409, 'NO_ASSIGNED_SHIFT');
  const tpl = await call('/shifts/templates', { method: 'POST', token: manager, body: { name: 'Ca tối kiểm thử', start: '22:00', end: '23:00' } });
  const future = tpl.data.templates.find((t) => t.name === 'Ca tối kiểm thử');
  await call('/shifts/schedule', { method: 'POST', token: manager, body: { userId: 3, workDate: vnDate(1), templateId: future.id } });
  const early = await call('/shifts/me/clock-in', { method: 'POST', token: staff });
  check('Ca ngày mai: báo chưa tới giờ và giờ ca tới', early.status === 409 && early.data.error.code === 'NO_ASSIGNED_SHIFT' && early.data.error.message.includes('Ca tối kiểm thử'), JSON.stringify(early.data));
  const status = await putOnDuty(BASE, { assignerToken: manager, userId: 3, userToken: staff });
  check('Vào ca đúng ca đang diễn ra', status.onDuty === true && Boolean(status.dutyEndsAt), JSON.stringify(status).slice(0, 200));
  const booked = await pos(staff);
  check('Đang trong ca thì đặt tại quầy được', booked.status === 201, JSON.stringify(booked.data));
  check('Đang trong ca thì bán dịch vụ được', (await call('/venues/1/service-orders', { method: 'POST', token: staff, body: sale })).status === 201);

  console.log('\n--- Hết giờ ca: không thao tác được, ra ca không vượt giờ hết ca');
  const [[openRec]] = await db.query('SELECT r.id, r.assignment_id FROM attendance_records r WHERE r.user_id = 3 AND r.clock_out IS NULL');
  // Dời ca về hôm qua (đã hết giờ) để không trùng với ca xếp lại phía sau
  const endedAt = vnDateTime(-1320);
  await db.query('UPDATE shift_assignments SET work_date = ?, starts_at = ?, ends_at = ? WHERE id = ?', [vnDate(-1), vnDateTime(-1560), endedAt, openRec.assignment_id]);
  await db.query('UPDATE attendance_records SET clock_in = ? WHERE id = ?', [vnDateTime(-1550), openRec.id]);
  expectError('Ca vừa hết giờ (chưa ra ca) thì không đặt tại quầy được nữa', await pos(staff, { start: '09:00', end: '10:00' }), 403, 'NOT_ON_DUTY');
  await call('/shifts/me/clock-out', { method: 'POST', token: staff });
  const [[closed]] = await db.query('SELECT DATE_FORMAT(clock_out, "%Y-%m-%d %H:%i:%s") AS clock_out FROM attendance_records WHERE id = ?', [openRec.id]);
  check('Ra ca muộn chỉ tính tới giờ hết ca', closed.clock_out === endedAt, `-> ${closed.clock_out}, cần ${endedAt}`);

  // Quên ra ca: tác vụ nền tự kết thúc đúng giờ hết ca
  await putOnDuty(BASE, { assignerToken: admin, userId: 2, userToken: manager, venueId: 1 });
  const [[mRec]] = await db.query('SELECT id, assignment_id FROM attendance_records WHERE user_id = 2 AND clock_out IS NULL');
  const mEnd = vnDateTime(-1);
  await db.query('UPDATE shift_assignments SET starts_at = ?, ends_at = ? WHERE id = ?', [vnDateTime(-90), mEnd, mRec.assignment_id]);
  await db.query('UPDATE attendance_records SET clock_in = ? WHERE id = ?', [vnDateTime(-89), mRec.id]);
  const shifts = require('../src/services/shift.service');
  await shifts.autoClockOut();
  const [[auto]] = await db.query('SELECT DATE_FORMAT(clock_out, "%Y-%m-%d %H:%i:%s") AS clock_out, auto_closed FROM attendance_records WHERE id = ?', [mRec.id]);
  check('Quên ra ca: hệ thống tự kết thúc tại giờ hết ca', auto.clock_out === mEnd && auto.auto_closed === 1, JSON.stringify(auto));

  // Vào sớm không được tính lương: tính từ giờ bắt đầu ca
  const [tplRow] = await db.query("SELECT id FROM shift_templates WHERE venue_id = 1 AND name = 'Ca sáng'");
  const [a] = await db.query("INSERT INTO shift_assignments (venue_id, user_id, template_id, work_date, starts_at, ends_at, created_by) VALUES (1, 3, ?, '2026-10-20', '2026-10-20 08:00:00', '2026-10-20 16:00:00', 2)", [tplRow[0].id]);
  await db.query("INSERT INTO attendance_records (venue_id, user_id, assignment_id, clock_in, clock_out, source) VALUES (1, 3, ?, '2026-10-20 07:46:00', '2026-10-20 16:00:00', 'SELF')", [a.insertId]);
  const counted = (await shifts.closedRecords(3, '2026-10')).records.find((r) => r.clockOut === '2026-10-20 16:00:00');
  check('Vào ca sớm 14 phút: giờ công tính từ 08:00', counted?.clockIn === '2026-10-20 08:00:00', JSON.stringify(counted));

  console.log('\n--- Nhật ký hoạt động');
  const wrong = await call('/auth/login', { method: 'POST', body: { identifier: 'staff.q7@pickleball.vn', password: 'sai-mat-khau' } });
  check('Đăng nhập sai bị từ chối', wrong.status === 401);
  const log = await call(`/admin/activity?from=${vnDate(-1)}&to=${vnDate(1)}&pageSize=100`, { token: admin });
  const actions = new Set(log.data.items.map((i) => i.action));
  check('Ghi đủ vào ca, ra ca, tự kết thúc ca, đặt tại quầy, bán hàng, đăng nhập', ['CLOCK_IN', 'CLOCK_OUT', 'AUTO_CLOCK_OUT', 'POS_BOOKING', 'SELL_SERVICE', 'LOGIN', 'LOGIN_FAILED'].every((x) => actions.has(x)), [...actions].join(','));
  const posLog = log.data.items.find((i) => i.action === 'POS_BOOKING');
  check('Nhật ký đơn tại quầy có người thực hiện và mã đơn', posLog?.actor?.id === 3 && posLog.entityLabel === booked.data.booking.bookingCode, JSON.stringify(posLog));
  const byStaff = await call(`/admin/activity?from=${vnDate(-1)}&to=${vnDate(1)}&actorId=3&pageSize=100`, { token: admin });
  check('Lọc theo nhân sự', byStaff.data.items.length > 0 && byStaff.data.items.every((i) => i.actor?.id === 3));
  const byCode = await call(`/admin/activity?from=${vnDate(-1)}&to=${vnDate(1)}&q=${booked.data.booking.bookingCode}`, { token: admin });
  check('Tìm theo mã đơn', byCode.data.items.some((i) => i.entityLabel === booked.data.booking.bookingCode));
  expectError('Quản lý không xem được nhật ký hoạt động', await call('/admin/activity', { token: manager }), 403, 'FORBIDDEN');
  let blocked = false;
  try { await db.query('UPDATE audit_logs SET reason = ? LIMIT 1', ['sửa thử']); } catch { blocked = true; }
  let blockedDelete = false;
  try { await db.query('DELETE FROM audit_logs LIMIT 1'); } catch { blockedDelete = true; }
  check('Không ai sửa hay xóa được nhật ký, kể cả trực tiếp trong CSDL', blocked && blockedDelete);

  console.log('\n--- Cảnh báo bất thường');
  await putOnDuty(BASE, { assignerToken: manager, userId: 3, userToken: staff });
  const own = await pos(staff, { start: '10:00', end: '11:00', guestName: 'Người nhà', guestPhone: '0901000003' });
  check('Lễ tân đặt cho chính số điện thoại của mình', own.status === 201, JSON.stringify(own.data));
  await call(`/bookings/${booked.data.booking.bookingCode}/cancel`, { method: 'POST', token: manager, body: { reason: 'Khách đổi ý' } });
  const alerts = (await call(`/admin/activity/alerts?from=${vnDate(-1)}&to=${vnDate(1)}`, { token: admin })).data;
  check('Cảnh báo cao: đặt tại quầy cho số điện thoại của nhân sự', alerts.alerts.some((x) => x.rule === 'STAFF_PHONE' && x.severity === 'high' && x.bookingCode === own.data.booking.bookingCode), JSON.stringify(alerts.alerts.map((x) => x.rule)));
  check('Cảnh báo: đơn tại quầy đã thu tiền mặt bị hủy', alerts.alerts.some((x) => x.rule === 'POS_CANCELLED' && x.bookingCode === booked.data.booking.bookingCode));

  console.log('\n--- Ảnh món dịch vụ');
  const item = services[0];
  expectError('Lễ tân không đổi ảnh món được', await call(`/services/${item.id}/image`, { method: 'PUT', token: staff, raw: PNG, type: 'image/png' }), 403, 'FORBIDDEN');
  expectError('Không nhận file giả ảnh', await call(`/services/${item.id}/image`, { method: 'PUT', token: manager, raw: Buffer.from('<svg onload=alert(1)>'), type: 'image/png' }), 415, 'UNSUPPORTED_IMAGE');
  const up = await call(`/services/${item.id}/image`, { method: 'PUT', token: manager, raw: PNG, type: 'image/png' });
  check('Quản lý thêm ảnh món', up.status === 200 && up.data.item.imageUrl?.startsWith('/uploads/services/'), JSON.stringify(up.data));
  check('Ảnh món truy cập được', (await fetch(`${ORIGIN}${up.data.item.imageUrl}`)).status === 200);
  check('Màn bán hàng nhận được ảnh món', (await call('/venues/1/services', { token: staff })).data.services.find((s) => s.id === item.id).imageUrl === up.data.item.imageUrl);
  const rm = await call(`/services/${item.id}/image`, { method: 'DELETE', token: manager });
  check('Gỡ ảnh món', rm.status === 200 && rm.data.item.imageUrl === null);

  console.log('\n--- Quản trị nhân sự');
  expectError('Số điện thoại sai bị từ chối', await call('/admin/users/3/profile', { method: 'PATCH', token: admin, body: { phone: '123' } }), 400, 'VALIDATION_ERROR');
  expectError('Nhân sự đang trong ca thì chưa chuyển cơ sở được', await call('/admin/users/3/profile', { method: 'PATCH', token: admin, body: { venueId: 2 } }), 409, 'USER_ON_DUTY');
  const edited = await call('/admin/users/3/profile', { method: 'PATCH', token: admin, body: { fullName: 'Lê Lễ Tân Q7 (sửa)' } });
  check('Admin sửa họ tên nhân sự', edited.status === 200 && edited.data.user.fullName === 'Lê Lễ Tân Q7 (sửa)');
  expectError('Quản lý không sửa được thông tin nhân sự', await call('/admin/users/3/profile', { method: 'PATCH', token: manager, body: { fullName: 'x' } }), 403, 'FORBIDDEN');
  const reset = await call('/admin/users/3/reset-password', { method: 'POST', token: admin });
  check('Đặt lại mật khẩu trả về mật khẩu tạm', reset.status === 200 && Boolean(reset.data.tempPassword));
  check('Mật khẩu cũ hết hiệu lực', !(await login('staff.q7@pickleball.vn')));
  const temp = (await call('/auth/login', { method: 'POST', body: { identifier: 'staff.q7@pickleball.vn', password: reset.data.tempPassword } })).data;
  check('Đăng nhập bằng mật khẩu tạm phải đổi mật khẩu ngay', temp.user?.mustChangePassword === true);
  await call('/auth/change-password', { method: 'POST', token: temp.token, body: { currentPassword: reset.data.tempPassword, newPassword: '12345678a' } });

  console.log('\n--- Bảo vệ khách đang chơi');
  // Đơn đã thanh toán trên Sân 03, dời về khung đang diễn ra hôm nay (ô hiện tại và ô kế tiếp)
  const live = await call('/bookings', { method: 'POST', token: customer, body: { courtId: 3, date: vnDate(5), start: '08:00', end: '09:00' } });
  await call(`/payments/mock/${live.data.booking.bookingCode}/pay`, { method: 'POST', token: customer });
  const nowMin = vnNow().getUTCHours() * 60 + vnNow().getUTCMinutes();
  const f = Math.floor(nowMin / 30) * 30;
  const hm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}:00`;
  if (f + 60 > 24 * 60) {
    console.log('Bỏ qua phần khách đang chơi vì gần nửa đêm');
  } else {
    const [slotRows] = await db.query('SELECT id FROM booking_slots WHERE booking_id = (SELECT id FROM bookings WHERE booking_code = ?) ORDER BY start_time', [live.data.booking.bookingCode]);
    await db.query('UPDATE bookings SET booking_date = ? WHERE booking_code = ?', [vnDate(0), live.data.booking.bookingCode]);
    for (const [k, row] of slotRows.entries()) {
      await db.query('UPDATE booking_slots SET booking_date = ?, start_time = ?, end_time = ? WHERE id = ?', [vnDate(0), hm(f + k * 30), hm(f + k * 30 + 30), row.id]);
    }
    const code = live.data.booking.bookingCode;
    const impact = await call('/courts/3/impact', { token: manager });
    check('Xem trước bảo trì báo sân đang có khách', impact.data.playing?.bookingCode === code, JSON.stringify(impact.data.playing));
    expectError('Không đặt bảo trì khi khách đang chơi', await call('/courts/3/status', { method: 'PATCH', token: manager, body: { status: 'MAINTENANCE', reason: 'Sửa lưới' } }), 409, 'COURT_IN_USE');
    const [[still]] = await db.query('SELECT payment_status FROM bookings WHERE booking_code = ?', [code]);
    check('Đơn của khách đang chơi giữ nguyên', still.payment_status === 'PAID');
    expectError('Không ngừng sân khi khách đang chơi', await call('/courts/3/status', { method: 'PATCH', token: admin, body: { status: 'INACTIVE', reason: 'Ngừng' } }), 409, 'COURT_IN_USE');
    expectError('Không hủy đơn đã tới giờ chơi', await call(`/bookings/${code}/cancel`, { method: 'POST', token: manager, body: { reason: 'Thử' } }), 409, 'BOOKING_STARTED');
    expectError('Không đổi sân đơn đã tới giờ chơi', await call(`/bookings/${code}/move`, { method: 'POST', token: manager, body: { courtId: 4 } }), 409, 'BOOKING_STARTED');
    const dim = await call('/lighting/courts/3/mode', { method: 'PUT', token: manager, body: { mode: 'MANUAL', manualLevel: 0 } });
    const c3 = dim.data.courts.find((c) => c.courtId === 3);
    check('Tắt đèn tay khi khách đang chơi: đèn vẫn giữ mức Fuzzy', c3.manualLimited === true && c3.level > 0 && c3.level === c3.fuzzyLevel, JSON.stringify({ level: c3.level, fuzzy: c3.fuzzyLevel, limited: c3.manualLimited }));
    const bright = await call('/lighting/courts/3/mode', { method: 'PUT', token: manager, body: { mode: 'MANUAL', manualLevel: 100 } });
    check('Tăng sáng tay khi khách đang chơi vẫn được', bright.data.courts.find((c) => c.courtId === 3).level === 100);
    await call('/lighting/courts/3/mode', { method: 'PUT', token: manager, body: { mode: 'AUTO' } });
  }
  expectError('Không tạm ngừng cơ sở còn đơn sắp tới', await call('/venues/1', { method: 'PATCH', token: admin, body: { isActive: false } }), 409, 'VENUE_HAS_BOOKINGS');
  expectError('Không đổi giờ mở cửa làm đơn đã đặt nằm ngoài giờ', await call('/venues/1', { method: 'PATCH', token: admin, body: { openTime: '10:30' } }), 409, 'BOOKINGS_OUTSIDE_HOURS');
  const rules = (await call('/courts/2/price-rules')).data.rules.map(({ dayType, startTime, endTime, pricePerHour }) => ({ dayType, startTime, endTime, pricePerHour }));
  const saved = await call('/courts/2/price-rules', { method: 'PUT', token: manager, body: { rules: rules.map((r) => ({ ...r, pricePerHour: r.pricePerHour + 10000 })) } });
  check('Lưu bảng giá báo số ô đã đặt giữ giá cũ', saved.status === 200 && Number.isInteger(saved.data.keptSlots), JSON.stringify(saved.data).slice(0, 200));
  // Xóa khung: gộp khung cuối ngày thường vào khung liền trước, bảng giá vẫn phủ kín giờ mở cửa
  const weekday = rules.filter((r) => r.dayType === 'WEEKDAY');
  const mergedRules = [...rules.filter((r) => r.dayType !== 'WEEKDAY'), ...weekday.slice(0, -2), { ...weekday.at(-2), endTime: weekday.at(-1).endTime }];
  const removed = await call('/courts/2/price-rules', { method: 'PUT', token: manager, body: { rules: mergedRules } });
  check('Xóa một khung giờ (gộp vào khung liền trước)', removed.status === 200 && removed.data.rules.filter((r) => r.dayType === 'WEEKDAY').length === weekday.length - 1, JSON.stringify(removed.data).slice(0, 200));
  expectError('Xóa khung để hở giờ bị từ chối', await call('/courts/2/price-rules', { method: 'PUT', token: manager, body: { rules: [...rules.filter((r) => r.dayType !== 'WEEKDAY'), ...weekday.slice(0, -1)] } }), 400, 'INVALID_PRICE_RULES');
  const [[slotPrice]] = await db.query("SELECT price_snapshot FROM booking_slots s JOIN bookings b ON b.id = s.booking_id WHERE b.booking_code = ? LIMIT 1", [online.data.booking.bookingCode]);
  check('Đơn đã đặt giữ nguyên giá sau khi đổi bảng giá', slotPrice.price_snapshot === online.data.booking.slots[0].price, JSON.stringify(slotPrice));

  console.log('\n--- Nhân sự đang trong ca');
  const roleList = (await call('/admin/roles', { token: admin })).data.roles;
  const staffRole = roleList.find((r) => r.baseRole === 'STAFF' && r.isSystem) ?? roleList.find((r) => r.baseRole === 'STAFF');
  expectError('Không đổi vai trò người đang trong ca', await call('/admin/users/3/role', { method: 'PATCH', token: admin, body: { roleId: staffRole.id } }), 409, 'USER_ON_DUTY');
  const locked = await call('/admin/users/3', { method: 'PATCH', token: admin, body: { isActive: false } });
  const [[closedOnLock]] = await db.query('SELECT COUNT(*) AS n FROM attendance_records WHERE user_id = 3 AND clock_out IS NULL');
  check('Khóa tài khoản đang trong ca thì kết thúc ca ngay', locked.status === 200 && closedOnLock.n === 0, JSON.stringify(closedOnLock));
  await call('/admin/users/3', { method: 'PATCH', token: admin, body: { isActive: true } });

  console.log('\n--- Xóa bảng lương nháp');
  await call('/payroll/contracts/3', { method: 'PUT', token: manager, body: { position: 'Lễ tân', baseSalary: 6000000, allowance: 0, insuredSalary: 6000000, dependents: 0, wageRegion: 1, effectiveFrom: '2026-01-01' } });
  const period = (await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-09', standardDays: 26 } })).data.period;
  expectError('Lễ tân không xóa được bảng lương', await call(`/payroll/periods/${period.id}`, { method: 'DELETE', token: await login('staff.q7@pickleball.vn', '12345678a') }), 403, 'FORBIDDEN');
  check('Xóa bảng lương còn nháp', (await call(`/payroll/periods/${period.id}`, { method: 'DELETE', token: manager })).status === 200);
  const again = (await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-09', standardDays: 26 } })).data.period;
  await call(`/payroll/periods/${again.id}/approve`, { method: 'POST', token: admin });
  expectError('Bảng lương đã duyệt không xóa được', await call(`/payroll/periods/${again.id}`, { method: 'DELETE', token: manager }), 409, 'PAYROLL_LOCKED');

  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
