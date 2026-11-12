const { Router } = require('express');
const courts = require('../controllers/court.controller');
const { verifyToken, can, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadCourt } = require('../middlewares/load.middleware');

const router = Router();
// Manager chỉ sửa sân thuộc cơ sở của mình
const courtGuard = (code) => [verifyToken, can(code), loadCourt, authorizeVenue((req) => req.court.venueId)];
const manageCourt = courtGuard('court.manage');

// Công khai: xem sân, bảng giá và báo giá trước khi đặt
router.get('/:courtId', loadCourt, courts.get);
router.get('/:courtId/price-rules', loadCourt, courts.listPriceRules);
router.get('/:courtId/quote', loadCourt, courts.quote);

// BR17: xem trước các đơn bị ảnh hưởng và sân trống thay thế khi chuyển bảo trì
router.get('/:courtId/impact', ...manageCourt, courts.impact);
router.patch('/:courtId', ...manageCourt, courts.update);
router.patch('/:courtId/status', ...manageCourt, courts.changeStatus);
router.delete('/:courtId', ...manageCourt, courts.remove);
router.put('/:courtId/price-rules', ...courtGuard('price.manage'), courts.replacePriceRules);

module.exports = router;
