const HttpError = require('../utils/httpError');

function notFound(req, res, next) {
  next(new HttpError(404, 'NOT_FOUND', `Không có API ${req.method} ${req.originalUrl}`));
}

// Express 5 tự chuyển lỗi của hàm async vào đây
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Body không phải JSON hợp lệ' } });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }
  console.error(err);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi máy chủ' } });
}

module.exports = { notFound, errorHandler };
