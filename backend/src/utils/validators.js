const HttpError = require('./httpError');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^0\d{9}$/; // US-C01: số điện thoại Việt Nam 10 chữ số

const isEmail = (value) => typeof value === 'string' && EMAIL_RE.test(value);
const isPhone = (value) => typeof value === 'string' && PHONE_RE.test(value);

// bcrypt chỉ dùng 72 byte đầu, nên chặn mật khẩu dài hơn thay vì cắt ngầm
function assertPassword(password, field = 'password') {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${field} phải dài từ 8 ký tự và không quá 72 byte`);
  }
}

function assertRequired(body, fields) {
  const missing = fields.filter((f) => body[f] === undefined || body[f] === null || String(body[f]).trim() === '');
  if (missing.length) {
    throw new HttpError(400, 'VALIDATION_ERROR', `Thiếu trường bắt buộc: ${missing.join(', ')}`);
  }
}

module.exports = { isEmail, isPhone, assertPassword, assertRequired };
