// Kiểm thử Đợt 1: phiên cookie xoay vòng, CSRF, CORS, giới hạn tần suất, phân quyền theo mã chức năng, đổi sân khi bảo trì.
// Chạy khi server đang chạy, trên CSDL vừa khởi tạo lại (script chỉnh dữ liệu trực tiếp để giả lập thời gian):
//   DB_NAME=pickleball_booking_e2e ALLOWED_ORIGIN=http://localhost:5173 node scripts/security-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const { putOnDuty } = require('./lib/duty');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'http://localhost:5173';
const EVIL_ORIGIN = 'http://trang-gia-mao.example';
const PASSWORD = '12345678';
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const code = (r) => r.data?.error?.code;
const expectError = (name, r, status, errorCode) => check(name, r.status === status && code(r) === errorCode, `-> ${r.status} ${code(r)}`);

// Lấy giá trị cookie từ các dòng Set-Cookie
const cookiesOf = (res) => Object.fromEntries(res.headers.getSetCookie().map((c) => { const [pair] = c.split(';'); const i = pair.indexOf('='); return [pair.slice(0, i), pair.slice(i + 1)]; }));
const cookieHeader = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');

async function call(path, { method = 'GET', body, token, cookies, origin } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (cookies) headers.Cookie = cookieHeader(cookies);
  if (origin) headers.Origin = origin;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null), headers: res.headers, cookies: cookiesOf(res), setCookie: res.headers.getSetCookie() };
}
const login = (identifier, password = PASSWORD) => call('/auth/login', { method: 'POST', body: { identifier, password } });
const tokenOf = async (identifier, password) => (await login(identifier, password)).data.token;
const dayFrom = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

async function createStaffUser(admin, stamp, suffix, venueId = 1) {
  const r = await call('/admin/users', { method: 'POST', token: admin, body: { fullName: `Nhân sự thử ${suffix}`, email: `nv${stamp}${suffix}@test.vn`, phone: `07${stamp}${suffix}`, role: 'STAFF', venueId } });
  const newPassword = 'matkhaumoi123';
  const temp = await tokenOf(r.data.user.email, r.data.tempPassword);
  await call('/auth/change-password', { method: 'POST', token: temp, body: { currentPassword: r.data.tempPassword, newPassword } });
  return { id: r.data.user.id, email: r.data.user.email, password: newPassword };
}

async function testSessions(db) {
  console.log('\n--- Phiên đăng nhập bằng cookie');
  const first = await login('customer1@gmail.com');
  const access = first.setCookie.find((c) => c.startsWith('pkb_at='));
  const refresh = first.setCookie.find((c) => c.startsWith('pkb_rt='));
  check('Đăng nhập đặt cookie httpOnly SameSite=Lax', /HttpOnly/i.test(access) && /SameSite=Lax/i.test(access) && /HttpOnly/i.test(refresh), access);
  check('Refresh token chỉ gửi tới /api/auth', /Path=\/api\/auth/i.test(refresh));
  check('Chỉ có cookie vẫn gọi được API', (await call('/auth/me', { cookies: first.cookies })).status === 200);
  expectError('Không cookie, không token bị từ chối', await call('/auth/me'), 401, 'UNAUTHENTICATED');

  const rotated = await call('/auth/refresh', { method: 'POST', cookies: first.cookies });
  check('Làm mới phiên cấp cặp token mới', rotated.status === 200 && rotated.cookies.pkb_rt && rotated.cookies.pkb_rt !== first.cookies.pkb_rt);
  const within = await call('/auth/refresh', { method: 'POST', cookies: first.cookies });
  check('Hai tab cùng làm mới trong vài giây không bị đăng xuất', within.status === 200);

  await db.query('UPDATE refresh_tokens SET rotated_at = NOW() - INTERVAL 1 MINUTE WHERE rotated_at IS NOT NULL');
  expectError('Dùng lại token cũ sau thời gian chờ bị từ chối', await call('/auth/refresh', { method: 'POST', cookies: first.cookies }), 401, 'INVALID_REFRESH_TOKEN');
  expectError('Token bị dùng lại làm thu hồi cả họ token', await call('/auth/refresh', { method: 'POST', cookies: rotated.cookies }), 401, 'INVALID_REFRESH_TOKEN');

  const session = await login('customer1@gmail.com');
  await db.query("UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL 1 MINUTE WHERE revoked_at IS NULL");
  expectError('Refresh token hết hạn bị từ chối', await call('/auth/refresh', { method: 'POST', cookies: session.cookies }), 401, 'INVALID_REFRESH_TOKEN');

  const out = await login('customer1@gmail.com');
  check('Đăng xuất thành công', (await call('/auth/logout', { method: 'POST', cookies: out.cookies })).status === 200);
  expectError('Sau đăng xuất không làm mới được phiên', await call('/auth/refresh', { method: 'POST', cookies: out.cookies }), 401, 'INVALID_REFRESH_TOKEN');

  const [[{ matches }]] = await db.query('SELECT COUNT(*) AS matches FROM refresh_tokens WHERE token_hash = ?', [out.cookies.pkb_rt]);
  check('CSDL không lưu refresh token gốc', matches === 0);
}

async function testOriginAndHeaders() {
  console.log('\n--- CSRF, CORS, header bảo mật');
  const { cookies } = await login('staff.q7@pickleball.vn');
  const body = { currentPassword: 'sai', newPassword: 'khongquantrong1' };
  expectError('Request ghi kèm cookie từ nguồn lạ bị chặn', await call('/auth/change-password', { method: 'POST', cookies, origin: EVIL_ORIGIN, body }), 403, 'ORIGIN_NOT_ALLOWED');
  check('Nguồn được phép đi qua lớp kiểm tra', (await call('/auth/change-password', { method: 'POST', cookies, origin: ALLOWED_ORIGIN, body })).status === 401);

  const evil = await call('/health', { origin: EVIL_ORIGIN });
  check('CORS không mở cho nguồn lạ', !evil.headers.get('access-control-allow-origin'));
  const good = await call('/health', { origin: ALLOWED_ORIGIN });
  check('CORS mở cho frontend, kèm credentials', good.headers.get('access-control-allow-origin') === ALLOWED_ORIGIN && good.headers.get('access-control-allow-credentials') === 'true');
  check('Có header helmet', good.headers.get('x-content-type-options') === 'nosniff' && Boolean(good.headers.get('content-security-policy')));
  check('Không lộ Express', !good.headers.get('x-powered-by'));
}

async function testRateLimit(stamp) {
  console.log('\n--- Giới hạn đăng nhập sai');
  const identifier = `do-mat-khau-${stamp}@test.vn`;
  let last;
  for (let i = 0; i < 30; i++) {
    last = await login(identifier, 'saimatkhau');
    if (last.status === 429) break;
  }
  expectError('Đăng nhập sai liên tục bị khóa tạm', last, 429, 'RATE_LIMITED');
  check('Tài khoản khác không bị ảnh hưởng', (await login('customer1@gmail.com')).status === 200);
}

async function testRoles(db, stamp) {
  console.log('\n--- Phân quyền theo mã chức năng');
  const admin = await tokenOf('admin@pickleball.vn');
  const manager = await tokenOf('manager.q7@pickleball.vn');
  const staff = await tokenOf('staff.q7@pickleball.vn');
  const me = (await call('/auth/me', { token: staff })).data.user;
  check('Tài khoản trả về danh sách quyền', me.permissions.includes('pos.create') && !me.permissions.includes('booking.refund'));
  expectError('Lễ tân không xem được ma trận quyền', await call('/admin/roles', { token: staff }), 403, 'FORBIDDEN');
  expectError('Quản lý không xem được ma trận quyền', await call('/admin/roles', { token: manager }), 403, 'FORBIDDEN');

  const catalog = (await call('/admin/roles', { token: admin })).data;
  const roleOf = (c) => catalog.roles.find((r) => r.code === c);
  check('Có 4 vai trò hệ thống', ['ADMIN', 'MANAGER', 'STAFF', 'CUSTOMER'].every((c) => roleOf(c)?.isSystem));

  const roles = (body) => call('/admin/roles', { method: 'POST', token: admin, body });
  expectError('Vai trò tự tạo không được cấp phạm vi toàn chuỗi', await roles({ name: 'Thử cấp Admin', baseRole: 'ADMIN', permissions: [] }), 400, 'VALIDATION_ERROR');
  expectError('Không gán được quyền quản trị cho vai trò khác', await roles({ name: 'Thử quyền quản trị', baseRole: 'MANAGER', permissions: ['role.manage'] }), 403, 'PERMISSION_ADMIN_ONLY');
  expectError('Không gán được quyền không tồn tại', await roles({ name: 'Thử mã lạ', baseRole: 'STAFF', permissions: ['khong.ton.tai'] }), 400, 'VALIDATION_ERROR');
  expectError('Không cấp được quyền mình không có', await roles({ name: 'Thử leo thang', baseRole: 'STAFF', permissions: ['booking.create'] }), 403, 'CANNOT_GRANT_UNHELD');

  const created = await roles({ name: `Thu ngân ${stamp}`, baseRole: 'STAFF', permissions: ['pos.sell', 'service.view', 'report.shift', 'attendance.self'] });
  check('Tạo được vai trò Thu ngân', created.status === 201 && created.data.role.permissions.length === 4);
  const cashierRole = created.data.role;
  expectError('Trùng tên vai trò bị từ chối', await roles({ name: `Thu ngân ${stamp}`, baseRole: 'STAFF', permissions: [] }), 409, 'DUPLICATE_ROLE_NAME');

  const person = await createStaffUser(admin, stamp, '01');
  const assigned = await call(`/admin/users/${person.id}/role`, { method: 'PATCH', token: admin, body: { roleId: cashierRole.id } });
  check('Gán vai trò cho nhân sự', assigned.status === 200 && assigned.data.user.roleName === cashierRole.name && assigned.data.user.role === 'STAFF');

  const cashier = await tokenOf(person.email, person.password);
  const services = (await call('/venues/1/services', { token: cashier })).data.services;
  const sale = { items: [{ serviceId: services[0].id, quantity: 1 }], paymentMethod: 'CASH' };
  expectError('Thu ngân chưa vào ca thì chưa bán được', await call('/venues/1/service-orders', { method: 'POST', token: cashier, body: sale }), 403, 'NOT_ON_DUTY');
  await putOnDuty(BASE, { assignerToken: admin, userId: person.id, userToken: cashier, venueId: 1 });
  check('Thu ngân bán được dịch vụ', (await call('/venues/1/service-orders', { method: 'POST', token: cashier, body: sale })).status === 201);
  expectError('Thu ngân không đặt sân tại quầy được', await call('/bookings', { method: 'POST', token: cashier, body: { courtId: 1, date: dayFrom(3), start: '08:00', end: '09:00', guestName: 'Khách', guestPhone: '0912345678', paymentMethod: 'CASH' } }), 403, 'FORBIDDEN');
  expectError('Thu ngân không xem đơn cơ sở được', await call('/venues/1/bookings', { token: cashier }), 403, 'FORBIDDEN');
  expectError('Thu ngân vẫn bị giới hạn trong cơ sở của mình', await call('/venues/2/service-orders', { method: 'POST', token: cashier, body: sale }), 403, 'FORBIDDEN');

  await call(`/admin/roles/${cashierRole.id}`, { method: 'PUT', token: admin, body: { permissions: ['service.view'] } });
  expectError('Gỡ quyền có hiệu lực ngay với token đang dùng', await call('/venues/1/service-orders', { method: 'POST', token: cashier, body: sale }), 403, 'FORBIDDEN');

  expectError('Vai trò Admin không sửa được', await call(`/admin/roles/${roleOf('ADMIN').id}`, { method: 'PUT', token: admin, body: { permissions: [] } }), 409, 'SYSTEM_ROLE_LOCKED');
  expectError('Vai trò hệ thống không xóa được', await call(`/admin/roles/${roleOf('STAFF').id}`, { method: 'DELETE', token: admin }), 409, 'SYSTEM_ROLE_LOCKED');
  expectError('Vai trò đang dùng không xóa được', await call(`/admin/roles/${cashierRole.id}`, { method: 'DELETE', token: admin }), 409, 'ROLE_IN_USE');
  expectError('Không tự đổi vai trò của mình', await call('/admin/users/1/role', { method: 'PATCH', token: admin, body: { roleId: roleOf('STAFF').id, venueId: 1 } }), 409, 'CANNOT_CHANGE_OWN_ROLE');
  expectError('Không đổi vai trò của tài khoản khách', await call('/admin/users/4/role', { method: 'PATCH', token: admin, body: { roleId: roleOf('STAFF').id, venueId: 1 } }), 409, 'CUSTOMER_ROLE_FIXED');
  expectError('Quản lý đang phụ trách cơ sở không bị hạ vai trò', await call('/admin/users/2/role', { method: 'PATCH', token: admin, body: { roleId: roleOf('STAFF').id } }), 409, 'MANAGER_ASSIGNED');
  expectError('Lễ tân không tự cấp được vai trò', await call(`/admin/users/${me.id}/role`, { method: 'PATCH', token: staff, body: { roleId: roleOf('MANAGER').id } }), 403, 'FORBIDDEN');

  expectError('Không đổi vai trò người đang trong ca', await call(`/admin/users/${person.id}/role`, { method: 'PATCH', token: admin, body: { roleId: roleOf('STAFF').id } }), 409, 'USER_ON_DUTY');
  await new Promise((r) => setTimeout(r, 1100));
  const out = await call('/shifts/me/clock-out', { method: 'POST', token: cashier });
  check('Vai trò vừa bị gỡ quyền chấm công vẫn ra ca được', out.status === 200, JSON.stringify(out.data).slice(0, 200));
  await call(`/admin/users/${person.id}/role`, { method: 'PATCH', token: admin, body: { roleId: roleOf('STAFF').id } });
  check('Xóa được vai trò không còn ai dùng', (await call(`/admin/roles/${cashierRole.id}`, { method: 'DELETE', token: admin })).status === 200);

  const [logs] = await db.query("SELECT DISTINCT action_type FROM audit_logs WHERE action_type IN ('CREATE_ROLE', 'UPDATE_ROLE', 'DELETE_ROLE', 'ASSIGN_ROLE')");
  check('Mọi thay đổi quyền đều ghi nhật ký', logs.length === 4, JSON.stringify(logs));
}

async function testMoveBooking(db) {
  console.log('\n--- Bảo trì sân và đổi sân cho khách (BR17)');
  const customer = await tokenOf('customer1@gmail.com');
  const manager = await tokenOf('manager.q7@pickleball.vn');
  const staff = await tokenOf('staff.q7@pickleball.vn');
  await putOnDuty(BASE, { assignerToken: manager, userId: 3, userToken: staff });
  const date = dayFrom(4);
  const slot = { date, start: '10:00', end: '11:00' };

  const online = (await call('/bookings', { method: 'POST', token: customer, body: { courtId: 1, ...slot } })).data.booking;
  await call(`/payments/mock/${online.bookingCode}/pay`, { method: 'POST', token: customer });
  const paid = (await call(`/bookings/${online.bookingCode}`, { token: customer })).data.booking;
  await call('/bookings', { method: 'POST', token: staff, body: { courtId: 2, ...slot, guestName: 'Khách quầy', guestPhone: '0912000111', paymentMethod: 'CASH' } });

  const impact = await call('/courts/1/impact', { token: manager });
  const row = impact.data.bookings?.find((b) => b.bookingCode === online.bookingCode);
  check('Liệt kê đơn bị ảnh hưởng', impact.status === 200 && Boolean(row), JSON.stringify(impact.data));
  const names = row.alternatives.map((c) => c.id);
  check('Sân thay thế chỉ gồm sân trống đang hoạt động', names.includes(3) && !names.includes(2) && !names.includes(4), JSON.stringify(row.alternatives));
  expectError('Lễ tân không xem được danh sách ảnh hưởng', await call('/courts/1/impact', { token: staff }), 403, 'FORBIDDEN');

  const move = (courtId, token = manager) => call(`/bookings/${online.bookingCode}/move`, { method: 'POST', token, body: { courtId } });
  expectError('Lễ tân không đổi sân được', await move(3, staff), 403, 'FORBIDDEN');
  expectError('Khách không tự đổi sân được', await move(3, customer), 403, 'FORBIDDEN');
  expectError('Không đổi vào ô đã có người', await move(2), 409, 'SLOT_TAKEN');
  expectError('Không đổi sang sân bảo trì', await move(4), 409, 'COURT_NOT_ACTIVE');
  expectError('Không đổi sang sân cơ sở khác', await move(5), 400, 'VALIDATION_ERROR');
  expectError('Không đổi về đúng sân đang ở', await move(1), 409, 'SAME_COURT');

  const moved = await move(3);
  check('Đổi sân thành công', moved.status === 200 && moved.data.booking.courtId === 3, JSON.stringify(moved.data));
  check('Giữ nguyên số tiền và mã QR', moved.data.booking.totalAmount === paid.totalAmount && moved.data.booking.qrPayload === paid.qrPayload);
  const after = (await call(`/venues/1/availability?date=${date}`)).data.courts;
  const stateAt = (id) => after.find((c) => c.id === id).slots.find((s) => s.start === '10:00').state;
  check('Ô cũ trống lại, ô mới đã đặt', stateAt(1) === 'FREE' && stateAt(3) === 'BOOKED', `${stateAt(1)} ${stateAt(3)}`);
  check('Sân cũ không còn đơn ảnh hưởng', !(await call('/courts/1/impact', { token: manager })).data.bookings.some((b) => b.bookingCode === online.bookingCode));
  const [log] = await db.query("SELECT COUNT(*) AS n FROM audit_logs WHERE action_type = 'MOVE_BOOKING'");
  check('Đổi sân được ghi nhật ký', log[0].n === 1);

  console.log('\n--- Quy tắc hủy đơn (BR11)');
  check('Còn đủ thời gian thì khách hủy được', paid.canCancelOnline === true && paid.cancelDeadlineHours === 24, JSON.stringify(paid));
  await db.query("UPDATE system_configs SET config_value = '1000' WHERE config_key = 'ONLINE_CANCEL_DEADLINE_HOURS'");
  const late = (await call(`/bookings/${online.bookingCode}`, { token: customer })).data.booking;
  check('Sát giờ thì ẩn nút hủy, đọc theo cấu hình', late.canCancelOnline === false && late.cancelDeadlineHours === 1000, JSON.stringify(late));
  await db.query("UPDATE system_configs SET config_value = '24' WHERE config_key = 'ONLINE_CANCEL_DEADLINE_HOURS'");
  check('Đơn trả về mốc check-in theo cấu hình', paid.checkinEarlyMinutes === 30);
}

(async () => {
  const db = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME });
  const stamp = String(Date.now()).slice(-6);
  await testSessions(db);
  await testOriginAndHeaders();
  await testRateLimit(stamp);
  await testRoles(db, stamp);
  await testMoveBooking(db);
  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
