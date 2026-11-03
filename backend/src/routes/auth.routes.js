const { Router } = require('express');
const auth = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');

const router = Router();

router.post('/register', auth.register);
router.post('/login', auth.login);
// Hai route này không qua authorize() để tài khoản còn cờ đổi mật khẩu vẫn dùng được
router.get('/me', verifyToken, auth.me);
router.post('/change-password', verifyToken, auth.changePassword);

module.exports = router;
