const userService = require('../services/user.service');

async function listUsers(req, res) {
  const users = await userService.listUsers({ role: req.query.role, venueId: req.query.venueId });
  res.json({ users });
}

async function createInternalUser(req, res) {
  const { user, tempPassword } = await userService.createInternalUser(req.body || {});
  // Mật khẩu tạm chỉ trả về một lần để Admin giao cho nhân viên
  res.status(201).json({ user, tempPassword });
}

async function listVenueStaff(req, res) {
  const venueId = Number(req.params.venueId);
  const users = (await userService.listUsers({ venueId })).filter((u) => u.role === 'MANAGER' || u.role === 'STAFF');
  res.json({ venueId, users });
}

async function setActive(req, res) {
  res.json({ user: await userService.setActive(Number(req.params.id), (req.body || {}).isActive, req.user) });
}

async function listAllVenues(req, res) {
  res.json({ venues: await require('../services/venue.service').list({ includeInactive: true }) });
}

module.exports = { listUsers, createInternalUser, listVenueStaff, setActive, listAllVenues };
