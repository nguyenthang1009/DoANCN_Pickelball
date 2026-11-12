const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { hhmm, nowInVietnam } = require('../utils/time');
const { assertDate } = require('../utils/time');
const ledger = require('./ledger.service');
const legal = require('./legal.service');
const site = require('./site.service');

const CASH_ACCOUNT = { CASH: '1111', VIETQR: '1121' };
const COURT_REVENUE = '5113';
const SERVICE_REVENUE = '5111';
const VAT_PAYABLE = '33311';
const HELD_PAYABLE = '3388';

// Giá niêm yết đã gồm thuế: tách ngược ra tiền chưa thuế; phần thuế lấy theo hiệu để cộng lại luôn đúng bằng số khách trả
function splitVat(gross, rateBp) {
  const net = Math.round((gross * 10000) / (10000 + rateBp));
  return { net, vat: gross - net };
}

// Số liên tục theo năm. Dòng đếm bị khóa tới khi transaction kết thúc, rollback thì số được trả lại nên không có khoảng trống.
async function nextNumber(conn, year) {
  const series = `HD${year}`;
  const [res] = await conn.query('INSERT INTO invoice_sequences (series, last_no) VALUES (?, 1) ON DUPLICATE KEY UPDATE last_no = LAST_INSERT_ID(last_no + 1)', [series]);
  const seq = res.insertId || 1;
  return { series, seq, invoiceNo: `${series}-${String(seq).padStart(7, '0')}` };
}

async function insertInvoice(conn, header, lines, actorId) {
  const date = nowInVietnam().date;
  const number = await nextNumber(conn, date.slice(0, 4));
  const subtotal = lines.reduce((s, l) => s + l.net, 0);
  const vatAmount = lines.reduce((s, l) => s + l.vat, 0);
  const total = subtotal + vatAmount;
  const seller = await site.sellerInfo(conn);
  const [res] = await conn.query(
    `INSERT INTO invoices (invoice_no, series, seq, invoice_type, original_invoice_id, venue_id, booking_id, service_order_id, customer_id, buyer_name, buyer_phone,
                           payment_method, invoice_date, vat_rate_bp, subtotal, vat_amount, total, seller, issued_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [number.invoiceNo, number.series, number.seq, header.type, header.originalId ?? null, header.venueId, header.bookingId ?? null, header.serviceOrderId ?? null,
      header.customerId ?? null, header.buyerName, header.buyerPhone ?? null, header.paymentMethod, date, header.rateBp, subtotal, vatAmount, total, JSON.stringify(seller), actorId],
  );
  await conn.query(
    'INSERT INTO invoice_lines (invoice_id, description, quantity, unit, gross_amount, net_amount, vat_amount, revenue_account) VALUES ?',
    [lines.map((l) => [res.insertId, l.description, l.quantity, l.unit, l.gross, l.net, l.vat, l.account])],
  );

  // Nợ tiền, có doanh thu và thuế; hóa đơn điều chỉnh giảm ghi đảo chiều
  const revenue = new Map();
  for (const l of lines) revenue.set(l.account, (revenue.get(l.account) || 0) + l.net);
  const cash = CASH_ACCOUNT[header.paymentMethod];
  const sale = header.type === 'SALE';
  await ledger.post(conn, {
    date,
    venueId: header.venueId,
    sourceType: 'INVOICE',
    sourceId: res.insertId,
    memo: `${sale ? 'Bán hàng' : 'Điều chỉnh giảm'} ${number.invoiceNo}`,
    actorId,
    lines: sale
      ? [[cash, total, 0], ...[...revenue].map(([account, net]) => [account, 0, net]), [VAT_PAYABLE, 0, vatAmount]]
      : [[cash, 0, total], ...[...revenue].map(([account, net]) => [account, net, 0]), [VAT_PAYABLE, vatAmount, 0]],
  });
  return { id: res.insertId, invoiceNo: number.invoiceNo };
}

const ddmmyyyy = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

async function serviceLines(conn, where, params, rateBp) {
  const [rows] = await conn.query(
    `SELECT s.name, s.unit, i.quantity, i.line_total FROM service_order_items i
       JOIN service_orders o ON o.id = i.service_order_id JOIN services s ON s.id = i.service_id
      WHERE ${where} ORDER BY i.id`,
    params,
  );
  return rows.map((r) => ({ description: r.name, quantity: r.quantity, unit: r.unit, gross: Number(r.line_total), ...splitVat(Number(r.line_total), rateBp), account: SERVICE_REVENUE }));
}

// Phát hành khi đơn chuyển sang đã thanh toán: tiền sân + dịch vụ bán kèm, trong cùng transaction với việc xác nhận đơn
async function issueForBooking(conn, bookingId, actorId) {
  const [existing] = await conn.query("SELECT id FROM invoices WHERE booking_id = ? AND invoice_type = 'SALE'", [bookingId]);
  if (existing[0]) return existing[0];
  const [rows] = await conn.query(
    `SELECT b.*, u.full_name AS customer_name, u.phone AS customer_phone FROM bookings b LEFT JOIN users u ON u.id = b.customer_id WHERE b.id = ?`,
    [bookingId],
  );
  const b = rows[0];
  const [slots] = await conn.query(
    `SELECT c.name, MIN(s.start_time) AS first_slot, MAX(s.end_time) AS last_slot, COUNT(*) AS n
       FROM booking_slots s JOIN courts c ON c.id = s.court_id WHERE s.booking_id = ? GROUP BY c.id, c.name`,
    [bookingId],
  );
  const rateBp = await legal.vatRateOn(nowInVietnam().date, conn);
  const court = slots[0];
  const lines = [{
    description: `Thuê ${court.name} ngày ${ddmmyyyy(b.booking_date)}, ${hhmm(court.first_slot)}–${hhmm(court.last_slot)}`,
    quantity: Number(court.n),
    unit: 'Ô 30 phút',
    gross: b.total_court_amount,
    ...splitVat(b.total_court_amount, rateBp),
    account: COURT_REVENUE,
  }, ...await serviceLines(conn, 'o.booking_id = ?', [bookingId], rateBp)];
  return insertInvoice(conn, {
    type: 'SALE', venueId: b.venue_id, bookingId, customerId: b.customer_id, buyerName: b.customer_name || b.guest_name,
    buyerPhone: b.customer_phone || b.guest_phone, paymentMethod: b.payment_method, rateBp,
  }, lines, actorId);
}

// Bán lẻ tại quầy, không kèm đơn sân
async function issueForServiceOrder(conn, order, actorId) {
  const rateBp = await legal.vatRateOn(nowInVietnam().date, conn);
  const lines = await serviceLines(conn, 'o.id = ?', [order.id], rateBp);
  return insertInvoice(conn, {
    type: 'SALE', venueId: order.venueId, serviceOrderId: order.id, buyerName: 'Khách lẻ', paymentMethod: order.paymentMethod === 'VIETQR' ? 'VIETQR' : 'CASH', rateBp,
  }, lines, actorId);
}

// Hoàn tiền: phát hành hóa đơn điều chỉnh giảm toàn bộ, giữ đúng thuế suất của hóa đơn gốc
async function issueCredit(conn, booking, actorId) {
  const [sale] = await conn.query("SELECT * FROM invoices WHERE booking_id = ? AND invoice_type = 'SALE'", [booking.id]);
  if (!sale[0]) {
    // Tiền về trễ khi ô đã có người: chưa từng bán nên chỉ trả lại khoản đang giữ hộ khách
    await ledger.post(conn, {
      date: nowInVietnam().date, venueId: booking.venueId, sourceType: 'HELD_REFUND', sourceId: booking.id, memo: `Trả lại tiền khách ${booking.bookingCode}`, actorId,
      lines: [[HELD_PAYABLE, booking.totalAmount, 0], ['1121', 0, booking.totalAmount]],
    });
    return null;
  }
  const original = sale[0];
  const [lines] = await conn.query('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id', [original.id]);
  return insertInvoice(conn, {
    type: 'CREDIT', originalId: original.id, venueId: original.venue_id, bookingId: booking.id, customerId: original.customer_id, buyerName: original.buyer_name,
    buyerPhone: original.buyer_phone, paymentMethod: original.payment_method, rateBp: original.vat_rate_bp,
  }, lines.map((l) => ({ description: `Hoàn: ${l.description}`, quantity: l.quantity, unit: l.unit, gross: l.gross_amount, net: l.net_amount, vat: l.vat_amount, account: l.revenue_account })), actorId);
}

// Tiền vào tài khoản nhưng không thành doanh thu (đơn đã mất ô): ghi nhận phải trả khách, chờ hoàn
async function postHeldReceipt(conn, { txnId, bookingCode, venueId, amount }) {
  await ledger.post(conn, {
    date: nowInVietnam().date, venueId, sourceType: 'HELD_RECEIPT', sourceId: txnId, memo: `Nhận tiền chờ hoàn ${bookingCode}`,
    lines: [['1121', amount, 0], [HELD_PAYABLE, 0, amount]],
  });
}

function toInvoice(row, lines) {
  return {
    invoiceNo: row.invoice_no, type: row.invoice_type, originalNo: row.original_no ?? null, venueId: row.venue_id, venueName: row.venue_name,
    bookingCode: row.booking_code ?? null, buyerName: row.buyer_name, buyerPhone: row.buyer_phone, paymentMethod: row.payment_method,
    invoiceDate: row.invoice_date, vatRateBp: row.vat_rate_bp, subtotal: row.subtotal, vatAmount: row.vat_amount, total: row.total, issuedBy: row.issuer_name ?? null, createdAt: row.created_at,
    seller: typeof row.seller === 'string' ? JSON.parse(row.seller) : row.seller,
    ...(lines && { lines: lines.map((l) => ({ description: l.description, quantity: l.quantity, unit: l.unit, gross: l.gross_amount, net: l.net_amount, vat: l.vat_amount })) }),
  };
}

const INVOICE_SELECT = `
  SELECT i.*, v.name AS venue_name, b.booking_code, o.invoice_no AS original_no, u.full_name AS issuer_name
    FROM invoices i JOIN venues v ON v.id = i.venue_id LEFT JOIN bookings b ON b.id = i.booking_id
    LEFT JOIN invoices o ON o.id = i.original_invoice_id LEFT JOIN users u ON u.id = i.issued_by`;

async function listMine(user) {
  const [rows] = await pool.query(`${INVOICE_SELECT} WHERE i.customer_id = ? ORDER BY i.id DESC LIMIT 200`, [user.id]);
  return rows.map((r) => toInvoice(r));
}

async function listForStaff(user, { venueId, from, to, type } = {}) {
  const today = nowInVietnam().date;
  const start = from || today;
  const end = to || today;
  assertDate(start, 'from');
  assertDate(end, 'to');
  const scope = user.role === 'ADMIN' ? (venueId ? Number(venueId) : null) : user.venueId;
  const params = [start, end];
  let where = 'i.invoice_date BETWEEN ? AND ?';
  if (scope) { where += ' AND i.venue_id = ?'; params.push(scope); }
  if (type === 'SALE' || type === 'CREDIT') { where += ' AND i.invoice_type = ?'; params.push(type); }
  const [rows] = await pool.query(`${INVOICE_SELECT} WHERE ${where} ORDER BY i.id DESC LIMIT 500`, params);
  return { from: start, to: end, invoices: rows.map((r) => toInvoice(r)) };
}

// Khách chỉ xem hóa đơn của mình, nhân sự chỉ xem hóa đơn cơ sở mình, Admin xem tất cả
async function getForUser(no, user) {
  const [rows] = await pool.query(`${INVOICE_SELECT} WHERE i.invoice_no = ?`, [no]);
  const row = rows[0];
  if (!row) throw new HttpError(404, 'INVOICE_NOT_FOUND', 'Không tìm thấy hóa đơn');
  const own = user.role === 'CUSTOMER' && user.permissions.includes('invoice.view_own') && row.customer_id === user.id;
  const staff = user.role !== 'CUSTOMER' && user.permissions.includes('invoice.view_venue') && (user.role === 'ADMIN' || row.venue_id === user.venueId);
  if (!own && !staff) throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền xem hóa đơn này');
  const [lines] = await pool.query('SELECT * FROM invoice_lines WHERE invoice_id = ? ORDER BY id', [row.id]);
  return toInvoice(row, lines);
}

module.exports = { splitVat, issueForBooking, issueForServiceOrder, issueCredit, postHeldReceipt, listMine, listForStaff, getForUser };
