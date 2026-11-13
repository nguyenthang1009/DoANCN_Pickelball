// Kiểm thử chiếu sáng thông minh: bộ suy luận mờ (số tính tay), trạng thái theo lịch đặt, phân quyền, khóa thiết bị,
// giao thức đèn Yeelight (đèn giả lập trên 127.0.0.1:55443), ước tính điện năng.
// Chạy khi server đang chạy với IOT_DEVICE_KEY, trên CSDL vừa khởi tạo lại:
//   DB_NAME=pickleball_booking_e2e IOT_DEVICE_KEY=khoa-thu node scripts/lighting-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const net = require('net');
const mysql = require('mysql2/promise');
const { putOnDuty } = require('./lib/duty');
const { infer, RULES } = require('../src/utils/fuzzy');
const lighting = require('../src/services/lighting.service');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const DEVICE_KEY = process.env.IOT_DEVICE_KEY;
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const near = (name, actual, expected, tolerance = 0.01) => check(name, Math.abs(actual - expected) <= tolerance, `-> ${actual}, cần ${expected}`);
const same = (name, actual, expected) => check(name, actual === expected, `-> ${JSON.stringify(actual)}, cần ${JSON.stringify(expected)}`);
const expectError = (name, r, status, code) => check(name, r.status === status && r.data?.error?.code === code, `-> ${r.status} ${r.data?.error?.code}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...headers }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier) => (await call('/auth/login', { method: 'POST', body: { identifier, password: '12345678' } })).data.token;
const day = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);

function testEngine() {
  console.log('\n--- Bộ suy luận mờ (số tính tay)');
  near('Tối + khách chưa tới: tam giác 10-25-40, trọng tâm 25', infer('ACTIVE', 20, 0).centroid, 25);
  near('Tối + nghỉ giữa hiệp: trọng tâm 50', infer('ACTIVE', 20, 2.5).centroid, 50);
  near('Tối + thi đấu: hình thang 80-95-100, trọng tâm 93', infer('ACTIVE', 20, 8).centroid, 93, 1e-9);
  near('Chạng vạng + thi đấu: bù sáng 60', infer('ACTIVE', 250, 8).centroid, 60);
  same('Đủ sáng tự nhiên thì tắt (dưới ngưỡng 5%)', infer('ACTIVE', 700, 8).level, 0);
  same('Sắp tới giờ, trời tối: dẫn đường 25%', infer('PREPARING', 20, 0).level, 25);
  same('Không có đơn, sân trống: tắt', infer('IDLE', 20, 0).level, 0);
  const intruder = infer('IDLE', 20, 8);
  check('Không có đơn mà có người: sáng mờ 15% và cảnh báo', intruder.level === 15 && intruder.warning);
  check('Không có đơn, sân trống: không cảnh báo', !infer('IDLE', 20, 0).warning);

  // Lux 125: Tối 0,25 và Chạng vạng 0,1667 cùng kích hoạt, kết quả phải nằm giữa hai mức
  const mixed = infer('ACTIVE', 125, 8);
  near('Hai luật cùng kích hoạt: độ thuộc Tối = 0,25', mixed.memberships.lux.TOI, 0.25);
  near('Hai luật cùng kích hoạt: độ thuộc Chạng vạng = 1/6', mixed.memberships.lux.CHANG_VANG, 1 / 6, 1e-9);
  check('Kết quả nằm giữa bù sáng và tối đa', mixed.centroid > 60 && mixed.centroid < 93, `-> ${mixed.centroid}`);

  let gaps = 0;
  for (const state of Object.keys(RULES)) for (let lux = 0; lux <= 1000; lux += 5) for (let a = 0; a <= 10.001; a += 0.1) if (!infer(state, lux, a).fired.length) gaps++;
  same('Mọi điểm trên lưới đều có luật áp dụng (không có lỗ hổng)', gaps, 0);

  let rising = 0;
  let prev = infer('ACTIVE', 0, 8).centroid;
  for (let lux = 5; lux <= 1000; lux += 5) { const c = infer('ACTIVE', lux, 8).centroid; if (c > prev + 1e-9) rising++; prev = c; }
  same('Khi thi đấu, trời càng sáng thì đèn không bao giờ sáng hơn', rising, 0);
  let falling = 0;
  prev = infer('ACTIVE', 20, 0).centroid;
  for (let a = 0.1; a <= 10.001; a += 0.1) { const c = infer('ACTIVE', 20, a).centroid; if (c < prev - 1e-9) falling++; prev = c; }
  same('Trời tối, hoạt động càng nhiều thì đèn không bao giờ tối đi', falling, 0);
  same('Giá trị ngoài miền được kẹp lại', infer('ACTIVE', -50, 99).level, infer('ACTIVE', 0, 10).level);
}

async function testStates(db, tokens) {
  console.log('\n--- Trạng thái theo lịch đặt sân');
  const date = day(1);
  const pos = await call('/bookings', { method: 'POST', token: tokens.staff, body: { courtId: 1, date, start: '08:00', end: '09:00', guestName: 'Khách đèn', guestPhone: '0912000444', paymentMethod: 'CASH' } });
  check('Tạo đơn đã thanh toán để thử', pos.status === 201, JSON.stringify(pos.data));
  await db.query('UPDATE court_lighting SET lux = NULL, activity = NULL WHERE court_id = 1');
  const at = async (time) => (await lighting.evaluateVenue(1, { at: { date, time } })).courts.find((c) => c.courtId === 1);
  same('07:00 chưa tới cửa sổ check-in: không có đơn', (await at('07:00')).state, 'IDLE');
  same('07:40 trong 30 phút trước giờ chơi: chuẩn bị', (await at('07:40')).state, 'PREPARING');
  const active = await at('08:15');
  same('08:15 trong giờ đơn đã thanh toán: đang có khách', active.state, 'ACTIVE');
  same('Đúng đơn của khung giờ', active.booking?.code, pos.data.booking.bookingCode);
  same('Chưa có cảm biến, khách chưa nhận sân: dẫn đường 25%', active.level, 25);
  await db.query("UPDATE bookings SET checkin_status = 'CHECKED_IN' WHERE booking_code = ?", [pos.data.booking.bookingCode]);
  const playing = await at('08:15');
  check('Khách đã check-in thì coi là đang chơi: sáng tối đa', playing.level === 93 && playing.inputs.activitySource === 'CHECKIN', JSON.stringify(playing.inputs));
  same('09:00 hết giờ: không còn đơn', (await at('09:00')).state, 'IDLE');
  same('Sân bảo trì luôn tắt', (await lighting.evaluateVenue(1, { at: { date, time: '08:15' } })).courts.find((c) => c.courtId === 4).state, 'MAINTENANCE');
  same('Đơn chưa thanh toán không bật đèn', lighting.resolveState({ id: 9, status: 'ACTIVE' }, [], 500, 30).state, 'IDLE');
}

async function testApi(tokens) {
  console.log('\n--- Phân quyền và dữ liệu cảm biến');
  const { customer, staff, manager, admin } = tokens;
  expectError('Khách không xem được đèn', await call('/lighting?venueId=1', { token: customer }), 403, 'FORBIDDEN');
  check('Lễ tân xem được đèn cơ sở mình', (await call('/lighting', { token: staff })).status === 200);
  expectError('Lễ tân không chỉnh được cảm biến', await call('/lighting/courts/2/sensor', { method: 'PUT', token: staff, body: { lux: 10 } }), 403, 'FORBIDDEN');
  expectError('Quản lý không chỉnh được sân cơ sở khác', await call('/lighting/courts/5/sensor', { method: 'PUT', token: manager, body: { lux: 10 } }), 403, 'FORBIDDEN');
  expectError('Mức hoạt động ngoài 0-10 bị từ chối', await call('/lighting/courts/2/sensor', { method: 'PUT', token: manager, body: { activity: 11 } }), 400, 'VALIDATION_ERROR');
  expectError('Địa chỉ đèn ngoài mạng nội bộ bị từ chối', await call('/lighting/courts/2/bulb', { method: 'PUT', token: manager, body: { ip: '8.8.8.8' } }), 400, 'VALIDATION_ERROR');
  // Một bóng gán cho hai sân thì hai sân gửi lệnh ngược nhau, đèn tắt bật liên tục
  await call('/lighting/courts/2/bulb', { method: 'PUT', token: manager, body: { ip: '192.168.77.77' } });
  expectError('Một đèn không gán được cho hai sân', await call('/lighting/courts/3/bulb', { method: 'PUT', token: manager, body: { ip: '192.168.77.77' } }), 409, 'BULB_IN_USE');
  await call('/lighting/courts/2/bulb', { method: 'PUT', token: manager, body: { ip: null } });

  const sim = await call('/lighting/courts/2/sensor', { method: 'PUT', token: manager, body: { lux: 250, activity: 8 } });
  const court2 = sim.data.courts.find((c) => c.courtId === 2);
  check('Mô phỏng cảm biến cập nhật đầu vào', court2.inputs.lux === 250 && court2.inputs.activity === 8 && court2.inputs.luxSource === 'SIMULATOR');
  check('Trả về luật đã kích hoạt để giải thích', court2.fired.length > 0 && court2.curve.length > 0);

  const reading = (key, body) => call('/lighting/readings', { method: 'POST', headers: key ? { 'X-Device-Key': key } : {}, body });
  expectError('Thiết bị không có khóa bị từ chối', await reading(null, { courtId: 2, lux: 10 }), 401, 'INVALID_DEVICE_KEY');
  expectError('Thiết bị sai khóa bị từ chối', await reading('sai-khoa', { courtId: 2, lux: 10 }), 401, 'INVALID_DEVICE_KEY');
  const device = await reading(DEVICE_KEY, { courtId: 2, lux: 30, activity: 2.5 });
  check('Thiết bị đúng khóa gửi được số đo', device.status === 200 && device.data.court.inputs.luxSource === 'DEVICE', JSON.stringify(device.data));

  const manual = await call('/lighting/courts/2/mode', { method: 'PUT', token: manager, body: { mode: 'MANUAL', manualLevel: 70 } });
  check('Chế độ thủ công ghi đè kết quả mờ', manual.data.courts.find((c) => c.courtId === 2).level === 70);
  await call('/lighting/courts/2/mode', { method: 'PUT', token: manager, body: { mode: 'AUTO' } });
  const adminView = await call('/lighting?venueId=2', { token: admin });
  check('Admin xem được cơ sở khác', adminView.status === 200 && adminView.data.courts.length === 3);
}

// Màn hình nhận báo "đèn đã đổi" thì đọc lại danh sách. Đọc mà cũng báo thì thành vòng lặp vô hạn,
// vượt giới hạn tần suất và người dùng bị đẩy ra trang đăng nhập.
async function testRealtimeLoop(tokens) {
  console.log('\n--- Không tạo vòng lặp tải lại, số đo cảm biến không ăn vào giới hạn của người dùng');
  const { manager } = tokens;
  let io;
  try {
    io = require(require.resolve('socket.io-client', { paths: [require('path').join(__dirname, '../../frontend/node_modules')] }));
  } catch {
    console.log('BỎ QUA  cần socket.io-client trong frontend/node_modules');
  }
  if (io) {
    const socket = io(BASE.replace(/\/api$/, ''), { transports: ['websocket'] });
    await new Promise((resolve) => socket.on('connect', resolve));
    let events = 0;
    socket.on('lighting:changed', () => { events++; });
    socket.emit('watch-lighting', 1);
    await sleep(300);
    events = 0;
    await call('/lighting', { token: manager });
    await call('/lighting', { token: manager });
    await sleep(500);
    same('Đọc danh sách đèn không phát sự kiện thay đổi', events, 0);
    await call('/lighting/courts/2/sensor', { method: 'PUT', token: manager, body: { lux: 31 } });
    await sleep(500);
    same('Gửi số đo phát đúng một sự kiện', events, 1);
    socket.close();
  }

  const remaining = (res) => Number(/r=(\d+)/.exec(res.headers.get('ratelimit') || '')?.[1]);
  const get = () => fetch(`${BASE}/lighting`, { headers: { Authorization: `Bearer ${manager}` } });
  const before = remaining(await get());
  for (let i = 0; i < 5; i++) {
    await fetch(`${BASE}/lighting/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': DEVICE_KEY }, body: JSON.stringify({ courtId: 2, lux: 40 + i }) });
  }
  const after = remaining(await get());
  check('Số đo cảm biến không trừ vào giới hạn của người dùng', Number.isFinite(before) && before - after <= 1, `-> còn ${before} rồi ${after}`);
}

async function testBulb(tokens) {
  console.log('\n--- Giao thức đèn Yeelight (đèn giả lập)');
  const received = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split('\r\n');
      buffer = lines.pop();
      for (const line of lines) {
        const cmd = JSON.parse(line);
        received.push(cmd);
        socket.write(`${JSON.stringify({ id: cmd.id, result: ['ok'] })}\r\n`);
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(55443, '127.0.0.1', resolve); });
  const { manager } = tokens;
  const sensor = (body) => call('/lighting/courts/2/sensor', { method: 'PUT', token: manager, body });
  await sensor({ lux: 20, activity: 0 });
  await call('/lighting/courts/2/bulb', { method: 'PUT', token: manager, body: { ip: '127.0.0.1' } });
  await sleep(300);
  received.length = 0;
  const alert = await sensor({ lux: 20, activity: 8 });
  await sleep(300);
  const methods = received.map((c) => c.method);
  same('Có người khi không có đơn: bật, chỉnh độ sáng, nháy', methods.join(','), 'set_power,set_bright,start_cf');
  same('Độ sáng gửi xuống đèn đúng kết quả mờ', received.find((c) => c.method === 'set_bright')?.params[0], 15);
  check('Đèn báo trực tuyến', alert.data.courts.find((c) => c.courtId === 2).bulb?.online === true);
  received.length = 0;
  await sensor({ lux: 20, activity: 8 });
  same('Kết quả không đổi thì không gửi lại (tiết kiệm hạn mức lệnh)', received.length, 0);
  await sleep(2100);
  await sensor({ lux: 20, activity: 0 });
  await sleep(300);
  same('Sân trống trở lại: tắt hẳn đèn', received.map((c) => `${c.method}:${c.params[0]}`).join(','), 'set_power:off');
  await call('/lighting/courts/2/bulb', { method: 'PUT', token: manager, body: { ip: null } });
  server.close();
  await call('/lighting/courts/3/bulb', { method: 'PUT', token: manager, body: { ip: '127.0.0.2' } });
  const offline = await call('/lighting/courts/3/sensor', { method: 'PUT', token: manager, body: { lux: 20, activity: 8 } });
  check('Đèn không phản hồi thì báo ngoại tuyến, hệ thống vẫn chạy', offline.status === 200 && offline.data.courts.find((c) => c.courtId === 3).bulb?.online === false);
  await call('/lighting/courts/3/bulb', { method: 'PUT', token: manager, body: { ip: null } });
}

async function testEnergy(db, tokens) {
  console.log('\n--- Ước tính điện năng (số tính tay)');
  const date = day(-1);
  const at = (hhmm) => Date.parse(`${date}T${hhmm}:00+07:00`) / 1000;
  // Sân 05 hôm qua: 18-19h sáng 100%, 19-20h sáng 50%, sau 20h tắt. Cách cũ: bật 100% suốt 2 giờ có khách.
  await db.query(
    `INSERT INTO lighting_logs (court_id, venue_id, state, lux, activity, level, warning, mode, created_at) VALUES
     (5, 2, 'ACTIVE', 0, 8, 100, FALSE, 'AUTO', FROM_UNIXTIME(?)), (5, 2, 'ACTIVE', 0, 2.5, 50, FALSE, 'AUTO', FROM_UNIXTIME(?)), (5, 2, 'IDLE', 0, 0, 0, FALSE, 'AUTO', FROM_UNIXTIME(?))`,
    [at('18:00'), at('19:00'), at('20:00')],
  );
  const e = (await call(`/lighting/energy?venueId=2&from=${date}&to=${date}`, { token: tokens.admin })).data;
  same('Điện thực tế: (1 giờ × 100% + 1 giờ × 50%) × 1,6 kW = 2,4 kWh', e.actualKwh, 2.4);
  same('Cách cũ: 2 giờ × 1,6 kW = 3,2 kWh', e.baselineKwh, 3.2);
  same('Tiết kiệm 0,8 kWh', e.savedKwh, 0.8);
  same('Tiết kiệm 25%', e.savedPercent, 25);
  same('Đèn sáng 2 giờ', e.litHours, 2);
  const own = (await call(`/lighting/energy?venueId=2&from=${date}&to=${date}`, { token: tokens.manager })).data;
  same('Quản lý luôn chỉ xem điện cơ sở của mình, bỏ qua venueId khác', own.venueId, 1);
}

(async () => {
  if (!DEVICE_KEY) throw new Error('Cần đặt IOT_DEVICE_KEY giống server');
  const db = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME });
  testEngine();
  const tokens = {
    customer: await login('customer1@gmail.com'), staff: await login('staff.q7@pickleball.vn'),
    manager: await login('manager.q7@pickleball.vn'), admin: await login('admin@pickleball.vn'),
  };
  await putOnDuty(BASE, { assignerToken: tokens.manager, userId: 3, userToken: tokens.staff });
  await testStates(db, tokens);
  await testApi(tokens);
  await testRealtimeLoop(tokens);
  await testBulb(tokens);
  await testEnergy(db, tokens);
  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
