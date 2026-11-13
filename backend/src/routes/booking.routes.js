const { Router } = require('express');
const bookings = require('../controllers/booking.controller');
const payments = require('../controllers/payment.controller');
const { verifyToken, can } = require('../middlewares/auth.middleware');
const { onDuty } = require('../middlewares/duty.middleware');

const router = Router();
router.use(verifyToken);

// Khách đặt online; Lễ tân/Quản lý/Admin đặt tại quầy cho khách vãng lai (quyền từng loại và phạm vi cơ sở kiểm tra trong service)
router.post('/', can(), bookings.create);
router.get('/my', can('booking.view_own'), bookings.mine);
router.get('/refunds', can('booking.refund'), bookings.refunds);
router.get('/:code', can(), bookings.get);
router.post('/:code/cancel', can(), bookings.cancel);
router.post('/:code/refund', can('booking.refund'), bookings.refund);
// BR17: đổi khách sang sân khác cùng cơ sở trước khi khóa sân
router.post('/:code/move', can('booking.move'), bookings.move);
// Tuần 8: link VietQR cho đơn đang giữ chỗ; lễ tân xác nhận nhận sân
router.post('/:code/payment-link', can(), onDuty, payments.createLink);
router.post('/:code/check-in', can('checkin.perform'), onDuty, payments.checkIn);

module.exports = router;
