const roleService = require('../services/role.service');

async function catalog(req, res) {
  res.json(await roleService.catalog());
}

async function create(req, res) {
  res.status(201).json({ role: await roleService.create(req.body || {}, req.user) });
}

async function update(req, res) {
  res.json({ role: await roleService.update(Number(req.params.id), req.body || {}, req.user) });
}

async function remove(req, res) {
  await roleService.remove(Number(req.params.id), req.user);
  res.json({ deleted: true, roleId: Number(req.params.id) });
}

async function assign(req, res) {
  res.json({ user: await roleService.assignToUser(Number(req.params.id), req.body || {}, req.user) });
}

module.exports = { catalog, create, update, remove, assign };
