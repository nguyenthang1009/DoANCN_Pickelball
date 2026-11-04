const { Router } = require('express');
const payments = require('../controllers/payment.controller');
const { verifyToken, can } = require('../middlewares/auth.middleware');

const router = Router();

router.get('/config', payments.config);
// PayOS gọi trực tiếp, không có token: an toàn nhờ kiểm tra chữ ký HMAC bằng checksum key
router.post('/payos/webhook', payments.webhook);
// Chỉ hoạt động ở chế độ mock: giả lập khách chuyển khoản thành công
router.post('/mock/:code/pay', verifyToken, can(), payments.simulate);

module.exports = router;
