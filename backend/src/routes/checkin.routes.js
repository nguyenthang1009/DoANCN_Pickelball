const { Router } = require('express');
const payments = require('../controllers/payment.controller');
const { verifyToken, can } = require('../middlewares/auth.middleware');

const router = Router();

// Quét QR hoặc nhập mã đơn: trả về thông tin đơn và có được nhận sân lúc này không
router.post('/lookup', verifyToken, can('checkin.perform'), payments.lookup);

module.exports = router;
