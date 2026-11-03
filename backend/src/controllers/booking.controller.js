const bookingService = require('../services/booking.service');
const serviceOrderService = require('../services/serviceOrder.service');

// Màn POS: nhân sự đặt sân cho khách vãng lai, bán kèm dịch vụ trong cùng transaction
async function create(req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.services) && body.services.length && req.user.role !== 'CUSTOMER' ? body.services : null;
  const extra = items
    ? (conn, b) => serviceOrderService.createOrder(conn, { venueId: b.venueId, bookingId: b.id, soldBy: req.user.id, paymentMethod: b.paymentMethod, items })
    : undefined;
  const booking = await bookingService.createBooking(req.user, body, { extra });
  res.status(201).json({ booking });
}

async function mine(req, res) {
  res.json({ bookings: await bookingService.listMine(req.user) });
}

async function get(req, res) {
  res.json({ booking: await bookingService.getForUser(req.params.code, req.user) });
}

async function cancel(req, res) {
  res.json({ booking: await bookingService.cancelBooking(req.params.code, req.user, req.body || {}) });
}

async function refund(req, res) {
  res.json({ booking: await bookingService.confirmRefund(req.params.code, req.user, req.body || {}) });
}

async function refunds(req, res) {
  res.json({ bookings: await bookingService.listRefunds(req.user, req.query.venueId) });
}

async function listByVenue(req, res) {
  const date = req.query.date || new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
  res.json({ venueId: req.venue.id, date, bookings: await bookingService.listByVenueDate(req.venue.id, date) });
}

module.exports = { create, mine, get, cancel, refund, refunds, listByVenue };
