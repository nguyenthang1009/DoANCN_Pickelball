const authService = require('../services/auth.service');

async function register(req, res) {
  const result = await authService.register(req.body || {});
  res.status(201).json(result);
}

async function login(req, res) {
  const result = await authService.login(req.body || {});
  res.json(result);
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function changePassword(req, res) {
  const result = await authService.changePassword(req.user.id, req.body || {});
  res.json(result);
}

module.exports = { register, login, me, changePassword };
