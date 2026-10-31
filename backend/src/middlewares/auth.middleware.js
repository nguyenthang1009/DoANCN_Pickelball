const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');
const HttpError = require('../utils/httpError');
const userService = require('../services/user.service');

// Xác thực JWT, rồi đọc lại user từ CSDL để khóa tài khoản / đổi vai trò có hiệu lực ngay
async function verifyToken(req, res, next) {
  const header = req.get('Authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu token đăng nhập');
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtConfig.secret);
  } catch (err) {
    const expired = err.name === 'TokenExpiredError';
    throw new HttpError(401, expired ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN', expired ? 'Phiên đăng nhập đã hết hạn' : 'Token không hợp lệ');
  }

  const user = await userService.findById(payload.sub);
  if (!user) throw new HttpError(401, 'INVALID_TOKEN', 'Tài khoản không còn tồn tại');
  if (!user.isActive) throw new HttpError(403, 'ACCOUNT_LOCKED', 'Tài khoản đã bị khóa');

  req.user = user;
  next();
}

// Chặn theo vai trò. Tài khoản còn cờ đổi mật khẩu lần đầu chưa được dùng chức năng nghiệp vụ.
function authorize(roles = []) {
  return (req, res, next) => {
    if (req.user.mustChangePassword) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    if (roles.length && !roles.includes(req.user.role)) {
      throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện chức năng này');
    }
    next();
  };
}

// BR15: Manager/Staff chỉ thao tác trên cơ sở được gán; Admin xem được mọi cơ sở
function authorizeVenue(paramName = 'venueId') {
  return (req, res, next) => {
    if (req.user.role === 'ADMIN') return next();
    if (Number(req.params[paramName]) !== req.user.venueId) {
      throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được thao tác trên cơ sở của mình');
    }
    next();
  };
}

module.exports = { verifyToken, authorize, authorizeVenue };
