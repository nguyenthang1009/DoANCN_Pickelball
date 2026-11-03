// Lỗi có mã HTTP và mã nghiệp vụ, được error.middleware trả về dạng { error: { code, message } }
class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

module.exports = HttpError;
