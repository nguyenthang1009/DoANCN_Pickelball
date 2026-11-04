const { Router } = require('express');
const auth = require('../controllers/auth.controller');
const { verifyToken } = require('../middlewares/auth.middleware');
const { loginLimiter, authLimiter } = require('../middlewares/security.middleware');

const router = Router();

router.post('/register', authLimiter, auth.register);
router.post('/login', loginLimiter, auth.login);
router.post('/refresh', authLimiter, auth.refresh);
router.post('/logout', auth.logout);
// Hai route này không qua can() để tài khoản còn cờ đổi mật khẩu vẫn dùng được
router.get('/me', verifyToken, auth.me);
router.post('/change-password', authLimiter, verifyToken, auth.changePassword);

module.exports = router;
