const http = require('http');
const app = require('./app');
const pool = require('./config/db');
const realtime = require('./realtime');
const bookingService = require('./services/booking.service');
const sessionService = require('./services/session.service');
const lightingService = require('./services/lighting.service');
const configService = require('./services/config.service');
const { port, db, jobIntervalSeconds } = require('./config/env');

async function start() {
  await pool.query('SELECT 1'); // dừng sớm nếu không kết nối được MySQL
  const server = http.createServer(app);
  realtime.init(server); // Socket.io: đổi màu ô ngay trên mọi màn hình

  // Job nền: hết hạn giữ chỗ 10 phút (BR08) và đánh dấu không đến (BR12)
  // và tự kết thúc ca trực đã hết giờ mà nhân viên quên ra ca
  const tick = () => Promise.all([bookingService.runHousekeeping(), sessionService.purgeExpired(), require('./services/shift.service').autoClockOut()]).catch((err) => console.error('Housekeeping lỗi:', err.message));
  setInterval(tick, jobIntervalSeconds * 1000).unref();
  tick();

  // Vòng điều khiển đèn: trạng thái đặt sân đổi theo giờ nên phải đánh giá lại định kỳ
  const lightingSeconds = await configService.getNumber('LIGHTING_INTERVAL_SECONDS', 10);
  const lightingTick = () => lightingService.tick().catch((err) => console.error('Điều khiển đèn lỗi:', err.message));
  setInterval(lightingTick, lightingSeconds * 1000).unref();
  lightingTick();

  server.listen(port, () => {
    console.log(`API đang chạy tại http://localhost:${port}/api (CSDL ${db.database})`);
  });
}

start().catch((err) => {
  console.error('Không khởi động được server:', err.message);
  process.exit(1);
});
