const paymentService = require('../services/payment.service');
const checkinService = require('../services/checkin.service');
const { payos } = require('../config/env');

async function config(req, res) {
  res.json({ mode: payos.mode });
}

async function createLink(req, res) {
  res.json({ payment: await paymentService.createPaymentLink(req.params.code, req.user) });
}

// PayOS cần nhận 200 cho mọi webhook hợp lệ về mặt định dạng, kể cả khi bỏ qua
async function webhook(req, res) {
  const result = await paymentService.handleWebhook(req.body);
  res.status(result.ok ? 200 : 400).json({ success: result.ok, result: result.result });
}

async function simulate(req, res) {
  const { result } = await paymentService.simulatePayment(req.params.code, req.user, req.body || {});
  res.json({ result });
}

async function lookup(req, res) {
  res.json(await checkinService.lookup(req.body || {}, req.user));
}

async function checkIn(req, res) {
  res.json({ booking: await checkinService.checkIn(req.params.code, req.user) });
}

module.exports = { config, createLink, webhook, simulate, lookup, checkIn };
