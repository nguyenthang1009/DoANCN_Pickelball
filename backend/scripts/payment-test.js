// Kiểm thử Tuần 8: webhook PayOS (chữ ký, lặp, sai số tiền, tiền về trễ) và check-in QR.
// Chạy khi server đang chạy ở chế độ mock, trên CSDL thử (script chỉnh hold_expires_at trực tiếp để giả lập hết hạn):
//   DB_NAME=pickleball_booking_e2e node scripts/payment-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const mysql = require('mysql2/promise');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const CHECKSUM = process.env.PAYOS_CHECKSUM_KEY || 'mock-checksum-key-chi-dung-khi-dev';
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier) => (await call('/auth/login', { method: 'POST', body: { identifier, password: '12345678' } })).data.token;
const sign = (data) => crypto.createHmac('sha256', CHECKSUM).update(Object.keys(data).sort().map((k) => `${k}=${data[k] ?? ''}`).join('&')).digest('hex');
const webhookFor = (orderCode, amount, description) => {
  const data = { orderCode, amount, description, accountNumber: '0000000000', reference: `TEST${Date.now()}${crypto.randomInt(1e6)}`, transactionDateTime: '2026-11-03 18:00:00', currency: 'VND', paymentLinkId: `mock-${orderCode}`, code: '00', desc: 'success' };
  return { code: '00', desc: 'success', success: true, data, signature: sign(data) };
};
const vnNow = () => new Date(Date.now() + 7 * 3600e3).toISOString();
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86400e3).toISOString().slice(0, 10);

async function freeWindow(venueId, courtId, date, count, notBefore = '00:00') {
  const { data } = await call(`/venues/${venueId}/availability?date=${date}`);
  const slots = data.courts.find((c) => c.id === courtId).slots;
  for (let i = 0; i + count <= slots.length; i++) {
    if (slots[i].start >= notBefore && slots.slice(i, i + count).every((s) => s.state === 'FREE')) return { start: slots[i].start, end: slots[i + count - 1].end };
  }
  return null;
}

async function hold(token, courtId, date, w) {
  return call('/bookings', { method: 'POST', token, body: { courtId, date, start: w.start, end: w.end } });
}

(async () => {
  const db = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME });
  const forceExpire = (code) => db.query('UPDATE bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE booking_code = ?', [code]);
  const statusOf = async (code) => (await db.query('SELECT payment_status FROM bookings WHERE booking_code = ?', [code]))[0][0].payment_status;

  const customer = await login('customer1@gmail.com');
  const staff = await login('staff.q7@pickleball.vn');
  const stamp = String(Date.now()).slice(-7);
  const reg = await call('/auth/register', { method: 'POST', body: { fullName: 'Khách thứ hai', email: `pay${stamp}@test.vn`, phone: `05${stamp}0`, password: 'matkhau123' } });
  const customer2 = reg.data.token;
  const date = addDays(vnNow().slice(0, 10), 2);

  // 1. Webhook sai chữ ký bị bỏ qua
  let w = await freeWindow(1, 1, date, 2);
  let b = (await hold(customer, 1, date, w)).data.booking;
  let link = (await call(`/bookings/${b.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  check('Tạo link VietQR cho đơn đang giữ chỗ', link && link.qrCode && link.amount === b.totalAmount);
  const again = (await call(`/bookings/${b.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  check('Gọi lại không tạo giao dịch mới (cùng orderCode)', again.orderCode === link.orderCode);
  const forged = webhookFor(link.orderCode, link.amount, link.description);
  forged.signature = 'a'.repeat(64);
  let r = await call('/payments/payos/webhook', { method: 'POST', body: forged });
  check('Webhook giả chữ ký -> 400 INVALID_SIGNATURE, đơn vẫn chờ thanh toán', r.status === 400 && (await statusOf(b.bookingCode)) === 'PENDING_PAYMENT');

  // 2. Sai số tiền
  r = await call('/payments/payos/webhook', { method: 'POST', body: webhookFor(link.orderCode, link.amount - 1000, link.description) });
  check('Webhook sai số tiền -> AMOUNT_MISMATCH, không xác nhận đơn', r.data.result === 'AMOUNT_MISMATCH' && (await statusOf(b.bookingCode)) === 'PENDING_PAYMENT');

  // 3. Thanh toán đúng và webhook lặp lại
  link = (await call(`/bookings/${b.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  const good = webhookFor(link.orderCode, link.amount, link.description);
  r = await call('/payments/payos/webhook', { method: 'POST', body: good });
  check('Webhook hợp lệ -> đơn PAID', r.data.result === 'PAID' && (await statusOf(b.bookingCode)) === 'PAID');
  r = await call('/payments/payos/webhook', { method: 'POST', body: good });
  check('Gửi lại đúng webhook đó -> DUPLICATE, không xử lý lần hai (TC09)', r.data.result === 'DUPLICATE');
  const [[txnCount]] = await db.query("SELECT COUNT(*) n FROM payment_transactions WHERE booking_id = ? AND transaction_status = 'SUCCESS'", [b.id]);
  check('Chỉ một giao dịch SUCCESS cho đơn', txnCount.n === 1);
  const paidBooking = b;

  // 4. Tiền về trễ, ô còn trống -> vẫn xác nhận
  w = await freeWindow(1, 2, date, 2);
  b = (await hold(customer, 2, date, w)).data.booking;
  link = (await call(`/bookings/${b.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  await forceExpire(b.bookingCode);
  await hold(customer2, 3, date, (await freeWindow(1, 3, date, 2))); // một lượt đặt khác trong ngày kích hoạt giải phóng giữ chỗ quá hạn
  check('Giữ chỗ quá hạn bị chuyển EXPIRED', (await statusOf(b.bookingCode)) === 'EXPIRED');
  r = await call('/payments/payos/webhook', { method: 'POST', body: webhookFor(link.orderCode, link.amount, link.description) });
  check('Tiền về trễ khi ô còn trống -> lấy lại ô, đơn PAID', r.data.result === 'PAID' && (await statusOf(b.bookingCode)) === 'PAID');

  // 5. Tiền về trễ, ô đã thuộc người khác -> CONFLICT_REFUND_PENDING (TC10)
  w = await freeWindow(1, 1, date, 2, '12:00');
  b = (await hold(customer, 1, date, w)).data.booking;
  link = (await call(`/bookings/${b.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  await forceExpire(b.bookingCode);
  const other = await hold(customer2, 1, date, w);
  check('Người khác giữ được ô vừa hết hạn', other.status === 201);
  r = await call('/payments/payos/webhook', { method: 'POST', body: webhookFor(link.orderCode, link.amount, link.description) });
  check('Tiền về trễ khi ô đã có người -> CONFLICT_REFUND_PENDING', r.data.result === 'CONFLICT_REFUND_PENDING' && (await statusOf(b.bookingCode)) === 'CONFLICT_REFUND_PENDING');

  // 6. Check-in
  const qr = (await call(`/bookings/${paidBooking.bookingCode}`, { token: customer })).data.booking.qrPayload;
  r = await call('/checkin/lookup', { method: 'POST', token: staff, body: { qr: `${qr.slice(0, -1)}x` } });
  check('QR bị sửa chữ ký -> 400 INVALID_QR', r.status === 400 && r.data.error.code === 'INVALID_QR');
  r = await call('/checkin/lookup', { method: 'POST', token: staff, body: { qr } });
  check('QR hợp lệ nhưng chưa tới ngày chơi -> không cho nhận sân', r.status === 200 && r.data.method === 'QR' && r.data.canCheckIn === false);
  r = await call(`/bookings/${paidBooking.bookingCode}/check-in`, { method: 'POST', token: staff, body: {} });
  check('Cố xác nhận nhận sân sớm -> 409 CANNOT_CHECK_IN', r.status === 409);
  r = await call('/checkin/lookup', { method: 'POST', token: customer, body: { code: paidBooking.bookingCode } });
  check('Khách hàng không dùng được API check-in -> 403', r.status === 403);

  // Đơn ở cơ sở Thủ Đức: lễ tân Quận 7 không được tra cứu
  const tdw = await freeWindow(2, 5, date, 2);
  const td = (await hold(customer, 5, date, tdw)).data.booking;
  r = await call('/checkin/lookup', { method: 'POST', token: staff, body: { code: td.bookingCode } });
  check('Lễ tân Quận 7 tra cứu đơn Thủ Đức -> 403', r.status === 403);

  // Nhận sân thật: đơn hôm nay, bắt đầu trong vòng 30 phút tới
  const now = vnNow();
  const today = now.slice(0, 10);
  const nowHm = now.slice(11, 16);
  const nextHalf = (() => { const m = Number(nowHm.slice(0, 2)) * 60 + Number(nowHm.slice(3)); const n = Math.ceil((m + 1) / 30) * 30; return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`; })();
  const tw = nextHalf <= '21:00' ? await freeWindow(1, 1, today, 2, nextHalf) : null;
  if (tw && tw.start === nextHalf) {
    const t = (await call('/bookings', { method: 'POST', token: staff, body: { courtId: 1, date: today, start: tw.start, end: tw.end, guestName: 'Khách vãng lai thử', guestPhone: '0912345678', paymentMethod: 'CASH' } })).data.booking;
    check('Lễ tân đặt tại quầy, tiền mặt -> PAID ngay', t && t.paymentStatus === 'PAID' && t.source === 'POS');
    r = await call('/checkin/lookup', { method: 'POST', token: staff, body: { qr: t.qrPayload } });
    check(`Đơn hôm nay ${tw.start} -> được nhận sân`, r.data.canCheckIn === true, JSON.stringify(r.data.reason));
    r = await call(`/bookings/${t.bookingCode}/check-in`, { method: 'POST', token: staff, body: {} });
    check('Xác nhận nhận sân -> CHECKED_IN', r.status === 200 && r.data.booking.checkinStatus === 'CHECKED_IN');
    r = await call(`/bookings/${t.bookingCode}/check-in`, { method: 'POST', token: staff, body: {} });
    check('Check-in lần hai -> 409', r.status === 409);
  } else {
    console.log('BỎ QUA nhận sân thật: hết khung giờ trống trong 30 phút tới hôm nay');
  }

  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
