const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const { payos } = require('../config/env');
const realtime = require('../realtime');
const audit = require('./audit.service');
const bookingService = require('./booking.service');
const invoiceService = require('./invoice.service');

const hmac = (text) => crypto.createHmac('sha256', payos.checksumKey).update(text).digest('hex');

// Chữ ký khi tạo link (theo SDK chính thức payOS): 5 trường cố định theo thứ tự chữ cái
const signPaymentRequest = ({ amount, cancelUrl, description, orderCode, returnUrl }) =>
  hmac(`amount=${amount}&cancelUrl=${cancelUrl}&description=${description}&orderCode=${orderCode}&returnUrl=${returnUrl}`);

// Chữ ký webhook: mọi trường của data, sắp theo tên, dạng key=value nối bằng &; null/undefined -> chuỗi rỗng
function signWebhookData(data) {
  const str = (v) => (v === null || v === undefined || v === 'null' || v === 'undefined' ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  return hmac(Object.keys(data).sort().map((k) => `${k}=${str(data[k])}`).join('&'));
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// orderCode của PayOS là số nguyên <= 2^53; ghép thời điểm và số ngẫu nhiên để không trùng
const newOrderCode = () => Date.now() * 100 + crypto.randomInt(100);

function toTransaction(row, booking) {
  return {
    orderCode: Number(row.payos_order_code),
    amount: row.amount,
    status: row.transaction_status,
    qrCode: row.qr_code,
    checkoutUrl: row.checkout_url,
    description: booking ? booking.bookingCode.replace(/-/g, '') : undefined,
    mode: payos.mode,
  };
}

async function callPayos(body) {
  const res = await fetch(`${payos.baseUrl}/v2/payment-requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-client-id': payos.clientId, 'x-api-key': payos.apiKey },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json || json.code !== '00') {
    throw new HttpError(502, 'PAYOS_ERROR', `PayOS từ chối tạo link thanh toán: ${json?.desc || res.status}`);
  }
  return json.data;
}

// G5, BR10: tạo (hoặc lấy lại) link VietQR cho đơn đang giữ chỗ
async function createPaymentLink(code, user) {
  const booking = await bookingService.findByCode(code);
  bookingService.assertCanView(booking, user);
  if (booking.paymentStatus !== 'PENDING_PAYMENT' || !booking.holdSecondsLeft) {
    throw new HttpError(409, 'NOT_PAYABLE', 'Đơn không còn chờ thanh toán');
  }
  const [existing] = await pool.query("SELECT * FROM payment_transactions WHERE booking_id = ? AND transaction_status = 'PENDING' ORDER BY id DESC LIMIT 1", [booking.id]);
  if (existing[0]) return toTransaction(existing[0], booking);

  const orderCode = newOrderCode();
  const description = booking.bookingCode.replace(/-/g, ''); // PayOS giới hạn 25 ký tự
  const returnUrl = `${payos.returnUrl}/ve/${booking.bookingCode}`;
  const cancelUrl = `${payos.returnUrl}/thanh-toan/${booking.bookingCode}`;
  let link;
  if (payos.mode === 'payos') {
    const body = { orderCode, amount: booking.totalAmount, description, returnUrl, cancelUrl, expiredAt: Math.floor(Date.now() / 1000) + booking.holdSecondsLeft };
    link = await callPayos({ ...body, signature: signPaymentRequest(body) });
  } else {
    // Chế độ mock: chuỗi QR minh họa, thanh toán bằng API giả lập webhook bên dưới
    link = { paymentLinkId: `mock-${orderCode}`, checkoutUrl: null, qrCode: `MOCK-VIETQR|${orderCode}|${booking.totalAmount}|${description}` };
  }
  await pool.query(
    'INSERT INTO payment_transactions (booking_id, payos_order_code, amount, payment_link_id, checkout_url, qr_code) VALUES (?, ?, ?, ?, ?, ?)',
    [booking.id, orderCode, booking.totalAmount, link.paymentLinkId, link.checkoutUrl, link.qrCode],
  );
  const [rows] = await pool.query('SELECT * FROM payment_transactions WHERE payos_order_code = ?', [orderCode]);
  return toTransaction(rows[0], booking);
}

// Xử lý webhook PayOS: xác thực chữ ký, chống xử lý lặp (TC09), đối chiếu số tiền, xác nhận đơn.
// Tiền về trễ khi ô đã thuộc người khác -> CONFLICT_REFUND_PENDING (TC10).
async function handleWebhook(body) {
  const data = body && body.data;
  if (!data || !body.signature || !safeEqual(signWebhookData(data), body.signature)) {
    console.warn('Webhook PayOS sai chữ ký, bỏ qua:', data && data.orderCode);
    return { ok: false, result: 'INVALID_SIGNATURE' };
  }

  const outcome = await withTransaction(async (conn) => {
    const [txns] = await conn.query('SELECT * FROM payment_transactions WHERE payos_order_code = ? FOR UPDATE', [data.orderCode]);
    const txn = txns[0];
    if (!txn) return { result: 'UNKNOWN_ORDER' }; // PayOS gửi dữ liệu thử khi xác nhận URL webhook
    if (txn.transaction_status === 'SUCCESS') return { result: 'DUPLICATE' };
    const raw = JSON.stringify(body);

    if (body.code !== '00' || data.code !== '00') {
      await conn.query("UPDATE payment_transactions SET transaction_status = 'FAILED', raw_webhook_payload = ?, processed_at = NOW() WHERE id = ?", [raw, txn.id]);
      return { result: 'FAILED' };
    }
    if (Number(data.amount) !== txn.amount) {
      await conn.query("UPDATE payment_transactions SET transaction_status = 'AMOUNT_MISMATCH', raw_webhook_payload = ?, processed_at = NOW() WHERE id = ?", [raw, txn.id]);
      return { result: 'AMOUNT_MISMATCH' };
    }

    const [bookings] = await conn.query('SELECT id, booking_code, venue_id, booking_date, payment_status FROM bookings WHERE id = ? FOR UPDATE', [txn.booking_id]);
    const b = bookings[0];
    let newStatus = 'PAID';
    if (b.payment_status === 'PENDING_PAYMENT') {
      await conn.query("UPDATE booking_slots SET slot_status = 'CONFIRMED' WHERE booking_id = ? AND slot_status = 'HELD'", [b.id]);
    } else if (b.payment_status === 'EXPIRED' || b.payment_status === 'CANCELLED') {
      // Tiền về sau khi hết hạn giữ chỗ: lấy lại ô nếu còn trống, không thì chờ hoàn tiền
      try {
        await conn.query("UPDATE booking_slots SET slot_status = 'CONFIRMED' WHERE booking_id = ? AND slot_status = 'CANCELLED'", [b.id]);
      } catch (err) {
        if (err.code !== 'ER_DUP_ENTRY') throw err;
        newStatus = 'CONFLICT_REFUND_PENDING';
      }
    } else {
      newStatus = b.payment_status; // đơn đã thanh toán trước đó: chỉ ghi nhận giao dịch
    }

    try {
      await conn.query(
        "UPDATE payment_transactions SET transaction_status = 'SUCCESS', payos_transaction_id = ?, raw_webhook_payload = ?, processed_at = NOW() WHERE id = ?",
        [data.reference || null, raw, txn.id],
      );
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') return { result: 'DUPLICATE' }; // cùng mã giao dịch ngân hàng đã xử lý
      throw err;
    }
    if (newStatus === 'PAID' && b.payment_status !== 'PAID') {
      await conn.query(
        "UPDATE bookings SET payment_status = 'PAID', payment_method = 'VIETQR', hold_expires_at = NULL, qr_signature = ?, cancelled_at = NULL, cancelled_by = NULL, cancel_reason = NULL WHERE id = ?",
        [bookingService.signBookingCode(b.booking_code), b.id],
      );
      await invoiceService.issueForBooking(conn, b.id, null);
    } else {
      // Tiền đã về tài khoản nhưng không thành doanh thu: ghi là khoản giữ hộ khách, chờ hoàn
      if (newStatus === 'CONFLICT_REFUND_PENDING') await conn.query("UPDATE bookings SET payment_status = 'CONFLICT_REFUND_PENDING' WHERE id = ?", [b.id]);
      await invoiceService.postHeldReceipt(conn, { txnId: txn.id, bookingCode: b.booking_code, venueId: b.venue_id, amount: txn.amount });
    }
    await audit.log(conn, { actorId: null, venueId: b.venue_id, actionType: 'PAYOS_WEBHOOK', entityType: 'BOOKING', entityId: b.id, oldValues: { paymentStatus: b.payment_status }, newValues: { paymentStatus: newStatus, orderCode: data.orderCode, amount: data.amount } });
    return { result: newStatus, booking: b };
  });

  if (outcome.booking) {
    realtime.emitBookingChanged(outcome.booking.booking_code, outcome.result);
    realtime.emitSlotsChanged(outcome.booking.venue_id, outcome.booking.booking_date, 'payment');
  }
  return { ok: true, result: outcome.result };
}

// Chế độ mock: dựng webhook giống hệt PayOS (ký bằng checksum key) rồi đưa qua handleWebhook
async function simulatePayment(code, user, { amount } = {}) {
  if (payos.mode !== 'mock') throw new HttpError(404, 'NOT_FOUND', 'Chỉ dùng được khi chạy chế độ mock');
  const txn = await createPaymentLink(code, user);
  const data = {
    orderCode: txn.orderCode,
    amount: amount ?? txn.amount,
    description: txn.description,
    accountNumber: '0000000000',
    reference: `MOCK${Date.now()}${crypto.randomInt(1000)}`,
    transactionDateTime: new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' '),
    currency: 'VND',
    paymentLinkId: `mock-${txn.orderCode}`,
    code: '00',
    desc: 'success',
    counterAccountBankId: null,
    counterAccountBankName: null,
    counterAccountName: null,
    counterAccountNumber: null,
    virtualAccountName: null,
    virtualAccountNumber: null,
  };
  const body = { code: '00', desc: 'success', success: true, data, signature: signWebhookData(data) };
  return { webhook: body, ...(await handleWebhook(body)) };
}

module.exports = { createPaymentLink, handleWebhook, simulatePayment, signWebhookData, signPaymentRequest };
