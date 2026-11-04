const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { corsOrigins, rateLimit: limits } = require('../config/env');
const HttpError = require('../utils/httpError');
const { ACCESS_COOKIE, REFRESH_COOKIE } = require('../utils/cookies');

const WINDOW_15_MIN = 15 * 60 * 1000;

function limiter({ windowMs, limit, message, ...options }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: { code: 'RATE_LIMITED', message } }),
    ...options,
  });
}

// Giới hạn chung theo IP. Webhook PayOS không tính vì đã xác thực bằng chữ ký HMAC.
const apiLimiter = limiter({
  windowMs: 60 * 1000,
  limit: limits.api,
  message: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
  skip: (req) => req.path === '/payments/payos/webhook',
});

// Chống dò mật khẩu: chỉ đếm lần đăng nhập sai, theo cặp IP + tài khoản
const loginLimiter = limiter({
  windowMs: WINDOW_15_MIN,
  limit: limits.login,
  message: 'Đăng nhập sai quá nhiều lần, vui lòng thử lại sau 15 phút',
  skipSuccessfulRequests: true,
  keyGenerator: (req) => `${ipKeyGenerator(req.ip)}|${String(req.body?.identifier ?? '').trim().toLowerCase()}`,
});

// Đăng ký, làm mới phiên, đổi mật khẩu
const authLimiter = limiter({
  windowMs: WINDOW_15_MIN,
  limit: limits.auth,
  message: 'Bạn thao tác quá nhiều lần, vui lòng thử lại sau 15 phút',
});

// Chống CSRF lớp thứ hai (lớp đầu là cookie SameSite): request ghi dữ liệu kèm cookie phiên phải đến từ nguồn được phép
function verifyOrigin(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const hasSession = req.cookies?.[ACCESS_COOKIE] || req.cookies?.[REFRESH_COOKIE];
  const origin = req.get('Origin');
  if (hasSession && origin && !corsOrigins.includes(origin)) {
    throw new HttpError(403, 'ORIGIN_NOT_ALLOWED', 'Nguồn gửi yêu cầu không được phép');
  }
  return next();
}

module.exports = { apiLimiter, loginLimiter, authLimiter, verifyOrigin };
