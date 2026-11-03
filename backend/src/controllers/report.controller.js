const reportService = require('../services/report.service');
const serviceOrderService = require('../services/serviceOrder.service');

async function shift(req, res) {
  res.json(await reportService.shift(req.user, req.query));
}

async function revenue(req, res) {
  res.json(await reportService.revenue(req.user, req.query));
}

async function sellServices(req, res) {
  const order = await serviceOrderService.createRetail(req.user, req.venue.id, req.body || {});
  res.status(201).json({ order });
}

module.exports = { shift, revenue, sellServices };
