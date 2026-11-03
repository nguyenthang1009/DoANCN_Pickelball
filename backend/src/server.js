const app = require('./app');
const pool = require('./config/db');
const { port, db } = require('./config/env');

async function start() {
  await pool.query('SELECT 1'); // dừng sớm nếu không kết nối được MySQL
  app.listen(port, () => {
    console.log(`API đang chạy tại http://localhost:${port}/api (CSDL ${db.database})`);
  });
}

start().catch((err) => {
  console.error('Không khởi động được server:', err.message);
  process.exit(1);
});
