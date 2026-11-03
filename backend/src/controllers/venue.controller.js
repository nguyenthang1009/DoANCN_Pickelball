const venueService = require('../services/venue.service');

async function list(req, res) {
  res.json({ venues: await venueService.list() });
}

async function get(req, res) {
  res.json({ venue: req.venue });
}

async function create(req, res) {
  const venue = await venueService.create(req.body || {}, req.user);
  res.status(201).json({ venue });
}

async function update(req, res) {
  const venue = await venueService.update(req.venue.id, req.body || {}, req.user);
  res.json({ venue });
}

module.exports = { list, get, create, update };
