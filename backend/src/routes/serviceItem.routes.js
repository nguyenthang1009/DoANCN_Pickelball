const express = require('express');

const { Router } = express;
const items = require('../controllers/serviceItem.controller');
const { verifyToken, can, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadServiceItem } = require('../middlewares/load.middleware');

const router = Router();

// Sửa giá, đổi tên hoặc ngừng bán một món (không có xóa, theo BR16)
router.patch('/:serviceId', verifyToken, can('service.manage'), loadServiceItem,
  authorizeVenue((req) => req.serviceItem.venueId), items.update);

// Ảnh món (chai nước, cây vợt) để lễ tân nhận ra đúng món khi bán
const imageBody = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '6mb' });
const manage = [verifyToken, can('service.manage'), loadServiceItem, authorizeVenue((req) => req.serviceItem.venueId)];
router.put('/:serviceId/image', ...manage, imageBody, async (req, res) => res.json({ item: await require('../services/serviceItem.service').setImage(req.serviceItem, req.body, req.user) }));
router.delete('/:serviceId/image', ...manage, async (req, res) => res.json({ item: await require('../services/serviceItem.service').removeImage(req.serviceItem, req.user) }));

module.exports = router;
