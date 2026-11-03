const { Router } = require('express');
const bookings = require('../controllers/booking.controller');
const { verifyToken, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verifyToken);

// Khách đặt online; Lễ tân/Quản lý/Admin đặt tại quầy cho khách vãng lai (phạm vi cơ sở kiểm tra trong service)
router.post('/', authorize(['CUSTOMER', 'STAFF', 'MANAGER', 'ADMIN']), bookings.create);
router.get('/my', authorize(['CUSTOMER']), bookings.mine);
router.get('/refunds', authorize(['MANAGER', 'ADMIN']), bookings.refunds);
router.get('/:code', authorize(), bookings.get);
router.post('/:code/cancel', authorize(['CUSTOMER', 'MANAGER', 'ADMIN', 'STAFF']), bookings.cancel);
router.post('/:code/refund', authorize(['MANAGER', 'ADMIN']), bookings.refund);

module.exports = router;
