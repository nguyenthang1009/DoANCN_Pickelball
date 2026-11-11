const { Server } = require('socket.io');
const { corsOrigins } = require('./config/env');

let io = null;
const room = (venueId, date) => `slots:${venueId}:${date}`;
const bookingRoom = (code) => `booking:${code}`;
const lightingRoom = (venueId) => `lighting:${venueId}`;

// Mỗi màn hình ma trận theo dõi đúng một cơ sở + một ngày; khi ô đổi trạng thái, server báo cho phòng đó tải lại
function init(httpServer) {
  io = new Server(httpServer, { cors: { origin: corsOrigins, credentials: true } });
  io.on('connection', (socket) => {
    socket.on('watch', ({ venueId, date } = {}) => {
      for (const r of socket.rooms) if (r.startsWith('slots:')) socket.leave(r);
      if (venueId && date) socket.join(room(venueId, date));
    });
    // Chỉ màn hình đang mở đúng đơn mới nhận tin của đơn đó
    socket.on('watch-booking', (code) => { if (typeof code === 'string') socket.join(bookingRoom(code)); });
    socket.on('unwatch-booking', (code) => { if (typeof code === 'string') socket.leave(bookingRoom(code)); });
    // Màn chiếu sáng và khung nội bộ theo dõi đèn của một cơ sở
    socket.on('watch-lighting', (venueId) => { if (Number.isInteger(venueId)) socket.join(lightingRoom(venueId)); });
    socket.on('unwatch-lighting', (venueId) => { if (Number.isInteger(venueId)) socket.leave(lightingRoom(venueId)); });
  });
  return io;
}

function emitSlotsChanged(venueId, date, reason) {
  if (io) io.to(room(venueId, date)).emit('slots:changed', { venueId, date, reason });
}

// Báo cho trang thanh toán của đúng một đơn (đã thanh toán, hết hạn...)
function emitBookingChanged(bookingCode, status) {
  if (io) io.to(bookingRoom(bookingCode)).emit(bookingRoom(bookingCode), { bookingCode, status });
}

function emitLightingChanged(venueId) {
  if (io) io.to(lightingRoom(venueId)).emit('lighting:changed', { venueId });
}

// Có người trên sân khi không có đơn: báo cho lễ tân của cơ sở
function emitLightingAlert(venueId, alert) {
  if (io) io.to(lightingRoom(venueId)).emit('lighting:alert', { venueId, ...alert });
}

module.exports = { init, emitSlotsChanged, emitBookingChanged, emitLightingChanged, emitLightingAlert };
