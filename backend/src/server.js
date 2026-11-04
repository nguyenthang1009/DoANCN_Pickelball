const http = require('http');
const app = require('./app');
const pool = require('./config/db');
const realtime = require('./realtime');
const bookingService = require('./services/booking.service');
const sessionService = require('./services/session.service');
const { port, db, jobIntervalSeconds } = require('./config/env');

async function start() {
  await pool.query('SELECT 1'); // dừng sớm nếu không kết nối được MySQL
  const server = http.createServer(app);
  realtime.init(server); // Socket.io: đổi màu ô ngay trên mọi màn hình

  // Job nền: hết hạn giữ chỗ 10 phút (BR08) và đánh dấu không đến (BR12)
  const tick = () => Promise.all([bookingService.runHousekeeping(), sessionService.purgeExpired()]).catch((err) => console.error('Housekeeping lỗi:', err.message));
  setInterval(tick, jobIntervalSeconds * 1000).unref();
  tick();

  server.listen(port, () => {
    console.log(`API đang chạy tại http://localhost:${port}/api (CSDL ${db.database})`);
  });
}

start().catch((err) => {
  console.error('Không khởi động được server:', err.message);
  process.exit(1);
});
