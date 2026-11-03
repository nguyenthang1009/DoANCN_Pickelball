const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const audit = require('./audit.service');

// G6, US-S06: hóa đơn dịch vụ tại quầy. Gắn với đơn sân (booking_id) hoặc bán lẻ (booking_id NULL).
// Ghi trong transaction conn của người gọi; giá chốt theo đơn giá hiện tại (unit_price_snapshot).
async function createOrder(conn, { venueId, bookingId = null, soldBy, paymentMethod, items }) {
  if (!Array.isArray(items) || !items.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Hóa đơn cần ít nhất một món');
  const merged = new Map();
  for (const it of items) {
    const id = Number(it.serviceId);
    const qty = Number(it.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(qty) || qty < 1 || qty > 99) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'Mỗi món cần serviceId và số lượng từ 1 đến 99');
    }
    merged.set(id, (merged.get(id) || 0) + qty);
  }
  const [services] = await conn.query('SELECT id, venue_id, name, unit_price, is_active FROM services WHERE id IN (?)', [[...merged.keys()]]);
  const byId = new Map(services.map((s) => [s.id, s]));
  for (const id of merged.keys()) {
    const s = byId.get(id);
    if (!s || s.venue_id !== venueId) throw new HttpError(400, 'VALIDATION_ERROR', `Dịch vụ #${id} không thuộc cơ sở này`);
    if (!s.is_active) throw new HttpError(409, 'SERVICE_INACTIVE', `${s.name} đã ngừng bán`);
  }
  const lines = [...merged].map(([id, qty]) => ({ serviceId: id, name: byId.get(id).name, quantity: qty, unitPrice: byId.get(id).unit_price, lineTotal: qty * byId.get(id).unit_price }));
  const total = lines.reduce((s, l) => s + l.lineTotal, 0);

  const [res] = await conn.query(
    'INSERT INTO service_orders (venue_id, booking_id, sold_by, total_service_amount, payment_method) VALUES (?, ?, ?, ?, ?)',
    [venueId, bookingId, soldBy, total, paymentMethod === 'VIETQR' ? 'VIETQR' : 'CASH'],
  );
  await conn.query(
    'INSERT INTO service_order_items (service_order_id, service_id, quantity, unit_price_snapshot) VALUES ?',
    [lines.map((l) => [res.insertId, l.serviceId, l.quantity, l.unitPrice])],
  );
  if (bookingId) await conn.query('UPDATE bookings SET total_service_amount = total_service_amount + ? WHERE id = ?', [total, bookingId]);
  return { id: res.insertId, venueId, bookingId, totalServiceAmount: total, paymentMethod, lines };
}

// Bán lẻ tại quầy (khách mua nước, thuê vợt không kèm đơn sân)
async function createRetail(user, venueId, { items, paymentMethod }) {
  if (user.role !== 'ADMIN' && user.venueId !== venueId) throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ bán hàng tại cơ sở của mình');
  return withTransaction(async (conn) => {
    const order = await createOrder(conn, { venueId, soldBy: user.id, paymentMethod, items });
    await audit.log(conn, { actorId: user.id, venueId, actionType: 'SELL_SERVICE', entityType: 'SERVICE_ORDER', entityId: order.id, newValues: order });
    return order;
  });
}

async function listByBooking(bookingId) {
  const [rows] = await pool.query(
    `SELECT o.id, i.quantity, i.unit_price_snapshot, i.line_total, s.name
       FROM service_orders o JOIN service_order_items i ON i.service_order_id = o.id JOIN services s ON s.id = i.service_id
      WHERE o.booking_id = ?`,
    [bookingId],
  );
  return rows.map((r) => ({ name: r.name, quantity: r.quantity, unitPrice: r.unit_price_snapshot, lineTotal: r.line_total }));
}

module.exports = { createOrder, createRetail, listByBooking };
