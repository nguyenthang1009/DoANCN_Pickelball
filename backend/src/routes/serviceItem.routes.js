const { Router } = require('express');
const items = require('../controllers/serviceItem.controller');
const { verifyToken, can, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadServiceItem } = require('../middlewares/load.middleware');

const router = Router();

// Sửa giá, đổi tên hoặc ngừng bán một món (không có xóa, theo BR16)
router.patch('/:serviceId', verifyToken, can('service.manage'), loadServiceItem,
  authorizeVenue((req) => req.serviceItem.venueId), items.update);

module.exports = router;
