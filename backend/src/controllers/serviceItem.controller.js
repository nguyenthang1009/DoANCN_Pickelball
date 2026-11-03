const serviceItemService = require('../services/serviceItem.service');

async function list(req, res) {
  const includeInactive = req.query.includeInactive === 'true';
  res.json({ venueId: req.venue.id, services: await serviceItemService.list(req.venue.id, { includeInactive }) });
}

async function create(req, res) {
  const service = await serviceItemService.create(req.venue.id, req.body || {}, req.user);
  res.status(201).json({ service });
}

async function update(req, res) {
  const service = await serviceItemService.update(req.serviceItem, req.body || {}, req.user);
  res.json({ service });
}

module.exports = { list, create, update };
