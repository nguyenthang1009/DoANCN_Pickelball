const shifts = require('../services/shift.service');

// Thao tác tại quầy (đặt sân, bán hàng, check-in) chỉ làm được khi đang trong ca trực đã được phân công.
// Khách hàng không bị chặn: chính họ thanh toán đơn của mình.
async function onDuty(req, res, next) {
  if (req.user.role !== 'CUSTOMER') await shifts.assertOnDuty(req.user);
  next();
}

module.exports = { onDuty };
