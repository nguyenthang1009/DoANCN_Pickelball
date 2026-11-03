const bookingService = require('../services/booking.service');

async function create(req, res) {
  const booking = await bookingService.createBooking(req.user, req.body || {});
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
