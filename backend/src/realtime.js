const { Server } = require('socket.io');

let io = null;
const room = (venueId, date) => `slots:${venueId}:${date}`;

// Mỗi màn hình ma trận theo dõi đúng một cơ sở + một ngày; khi ô đổi trạng thái, server báo cho phòng đó tải lại
function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: true } });
  io.on('connection', (socket) => {
    socket.on('watch', ({ venueId, date } = {}) => {
      for (const r of socket.rooms) if (r.startsWith('slots:')) socket.leave(r);
      if (venueId && date) socket.join(room(venueId, date));
    });
  });
  return io;
}

function emitSlotsChanged(venueId, date, reason) {
  if (io) io.to(room(venueId, date)).emit('slots:changed', { venueId, date, reason });
}

// Báo cho trang thanh toán của đúng một đơn (đã thanh toán, hết hạn...)
function emitBookingChanged(bookingCode, status) {
  if (io) io.emit(`booking:${bookingCode}`, { bookingCode, status });
}

module.exports = { init, emitSlotsChanged, emitBookingChanged };
