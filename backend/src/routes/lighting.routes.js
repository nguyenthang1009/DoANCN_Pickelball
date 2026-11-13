const { Router } = require('express');
const lighting = require('../services/lighting.service');
const { verifyToken, can } = require('../middlewares/auth.middleware');
const { deviceLimiter } = require('../middlewares/security.middleware');

const send = (fn) => async (req, res) => res.json(await fn(req));
const courtId = (req) => Number(req.params.courtId);

const router = Router();

// Thiết bị IoT gửi số đo bằng khóa thiết bị (header X-Device-Key), không qua đăng nhập
router.post('/readings', deviceLimiter, send(async (req) => ({ court: await lighting.deviceReading(req.get('X-Device-Key'), req.body || {}) })));

router.use(verifyToken);
router.get('/model', can('lighting.view'), send(() => lighting.model()));
router.get('/', can('lighting.view'), send((req) => lighting.list(req.user, req.query.venueId)));
router.get('/energy', can('lighting.view'), send((req) => lighting.energy(req.user, req.query)));
router.get('/discover', can('lighting.control'), send(async (req) => ({ bulbs: await lighting.discoverBulbs(req.user, req.query.venueId) })));
router.put('/courts/:courtId/sensor', can('lighting.control'), send((req) => lighting.simulate(courtId(req), req.body || {}, req.user)));
router.put('/courts/:courtId/mode', can('lighting.control'), send((req) => lighting.setMode(courtId(req), req.body || {}, req.user)));
router.put('/courts/:courtId/bulb', can('lighting.control'), send((req) => lighting.setBulb(courtId(req), req.body || {}, req.user)));

module.exports = router;
