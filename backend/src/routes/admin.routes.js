const { Router } = require('express');
const users = require('../controllers/user.controller');
const { verifyToken, authorize } = require('../middlewares/auth.middleware');

const router = Router();

// RBAC: chỉ Admin quản lý tài khoản và phân quyền nhân sự
router.use(verifyToken, authorize(['ADMIN']));
router.get('/users', users.listUsers);
router.post('/users', users.createInternalUser);
router.patch('/users/:id', users.setActive);
router.get('/venues', users.listAllVenues);

module.exports = router;
