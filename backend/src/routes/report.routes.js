const { Router } = require('express');
const reports = require('../controllers/report.controller');
const { verifyToken, authorize } = require('../middlewares/auth.middleware');

const router = Router();
router.use(verifyToken);

// Doanh thu ca: Staff thấy ca của mình, Manager cả cơ sở, Admin toàn hệ thống (phạm vi xử lý trong service)
router.get('/shift', authorize(['STAFF', 'MANAGER', 'ADMIN']), reports.shift);
// Dashboard doanh thu, lấp đầy: Manager (cơ sở mình) và Admin (toàn chuỗi)
router.get('/revenue', authorize(['MANAGER', 'ADMIN']), reports.revenue);

module.exports = router;
