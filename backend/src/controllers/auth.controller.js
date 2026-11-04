const { isProduction } = require('../config/env');
const authService = require('../services/auth.service');
const sessionService = require('../services/session.service');
const userService = require('../services/user.service');
const HttpError = require('../utils/httpError');
const { REFRESH_COOKIE, setSessionCookies, clearSessionCookies } = require('../utils/cookies');

// Mở phiên: token nằm trong cookie httpOnly. Ngoài production vẫn trả thêm trong JSON cho Postman và script kiểm thử.
async function startSession(res, { token, user }, status = 200) {
  setSessionCookies(res, token, await sessionService.create(user.id));
  res.status(status).json(isProduction ? { user } : { token, user });
}

async function register(req, res) {
  await startSession(res, await authService.register(req.body || {}), 201);
}

async function login(req, res) {
  await startSession(res, await authService.login(req.body || {}));
}

// Đổi refresh token cũ lấy cặp token mới; tài khoản bị khóa không làm mới được phiên
async function refresh(req, res) {
  try {
    const { userId, refreshToken } = await sessionService.rotate(req.cookies?.[REFRESH_COOKIE]);
    const user = await userService.findById(userId);
    if (!user || !user.isActive) throw new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    setSessionCookies(res, authService.signToken(user), refreshToken);
    res.json({ user });
  } catch (err) {
    clearSessionCookies(res);
    throw err;
  }
}

async function logout(req, res) {
  await sessionService.revoke(req.cookies?.[REFRESH_COOKIE]);
  clearSessionCookies(res);
  res.json({ loggedOut: true });
}

async function me(req, res) {
  res.json({ user: req.user });
}

async function changePassword(req, res) {
  await startSession(res, await authService.changePassword(req.user.id, req.body || {}));
}

module.exports = { register, login, refresh, logout, me, changePassword };
