const jwt = require('jsonwebtoken');
const { jwt: jwtConfig } = require('../config/env');
const HttpError = require('../utils/httpError');
const { ACCESS_COOKIE } = require('../utils/cookies');
const userService = require('../services/user.service');

// Xác thực JWT, rồi đọc lại user từ CSDL để khóa tài khoản / đổi vai trò có hiệu lực ngay
async function verifyToken(req, res, next) {
  // Trình duyệt dùng cookie httpOnly; Postman và script kiểm thử vẫn gửi header Bearer
  const [scheme, bearer] = (req.get('Authorization') || '').split(' ');
  const token = scheme === 'Bearer' && bearer ? bearer : req.cookies?.[ACCESS_COOKIE];
  if (!token) throw new HttpError(401, 'UNAUTHENTICATED', 'Thiếu token đăng nhập');

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

// Chặn theo mã quyền: có một trong các quyền là được; không truyền mã nghĩa là chỉ cần đăng nhập.
// Tài khoản còn cờ đổi mật khẩu lần đầu chưa được dùng chức năng nghiệp vụ.
function can(...codes) {
  return (req, res, next) => {
    if (req.user.mustChangePassword) {
      throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Bạn cần đổi mật khẩu trước khi tiếp tục');
    }
    if (codes.length && !codes.some((code) => req.user.permissions.includes(code))) {
      throw new HttpError(403, 'FORBIDDEN', 'Bạn không có quyền thực hiện chức năng này');
    }
    next();
  };
}

// BR15: Manager/Staff chỉ thao tác trên cơ sở được gán; Admin xem được mọi cơ sở.
// Tham số là tên param chứa venueId, hoặc hàm lấy venueId từ req (VD: req => req.court.venueId).
function authorizeVenue(source = 'venueId') {
  const getVenueId = typeof source === 'function' ? source : (req) => req.params[source];
  return (req, res, next) => {
    if (req.user.role === 'ADMIN') return next();
    if (Number(getVenueId(req)) !== req.user.venueId) {
      throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được thao tác trên cơ sở của mình');
    }
    next();
  };
}

module.exports = { verifyToken, can, authorizeVenue };
