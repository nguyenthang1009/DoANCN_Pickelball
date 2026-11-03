const { Router } = require('express');
const courts = require('../controllers/court.controller');
const { verifyToken, authorize, authorizeVenue } = require('../middlewares/auth.middleware');
const { loadCourt } = require('../middlewares/load.middleware');

const router = Router();
// Manager chỉ sửa sân thuộc cơ sở của mình
const manageCourt = [verifyToken, authorize(['ADMIN', 'MANAGER']), loadCourt, authorizeVenue((req) => req.court.venueId)];

// Công khai: xem sân, bảng giá và báo giá trước khi đặt
router.get('/:courtId', loadCourt, courts.get);
router.get('/:courtId/price-rules', loadCourt, courts.listPriceRules);
router.get('/:courtId/quote', loadCourt, courts.quote);

router.patch('/:courtId', ...manageCourt, courts.update);
router.patch('/:courtId/status', ...manageCourt, courts.changeStatus);
router.delete('/:courtId', ...manageCourt, courts.remove);
router.put('/:courtId/price-rules', ...manageCourt, courts.replacePriceRules);

module.exports = router;
