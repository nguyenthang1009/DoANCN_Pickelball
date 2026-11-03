const courtService = require('../services/court.service');
const venueService = require('../services/venue.service');
const priceRuleService = require('../services/priceRule.service');

async function listByVenue(req, res) {
  res.json({ venueId: req.venue.id, courts: await courtService.listByVenue(req.venue.id) });
}

async function get(req, res) {
  res.json({ court: req.court });
}

async function create(req, res) {
  const court = await courtService.create(req.venue.id, req.body || {}, req.user);
  res.status(201).json({ court });
}

async function update(req, res) {
  const court = await courtService.update(req.court, req.body || {}, req.user);
  res.json({ court });
}

async function changeStatus(req, res) {
  const result = await courtService.changeStatus(req.court, req.body || {}, req.user);
  res.json(result);
}

async function remove(req, res) {
  await courtService.remove(req.court, req.user);
  res.json({ deleted: true, courtId: req.court.id });
}

async function listPriceRules(req, res) {
  res.json({ courtId: req.court.id, rules: await priceRuleService.listByCourt(req.court.id) });
}

async function replacePriceRules(req, res) {
  const venue = await venueService.getOrThrow(req.court.venueId);
  const rules = await priceRuleService.replaceForCourt(req.court, venue, (req.body || {}).rules, req.user);
  res.json({ courtId: req.court.id, rules });
}

async function quote(req, res) {
  const venue = await venueService.getOrThrow(req.court.venueId);
  res.json(await priceRuleService.quote(req.court, venue, req.query));
}

module.exports = { listByVenue, get, create, update, changeStatus, remove, listPriceRules, replacePriceRules, quote };
