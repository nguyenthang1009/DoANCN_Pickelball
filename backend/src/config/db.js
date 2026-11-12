const mysql = require('mysql2/promise');
const { db } = require('./env');

// BR18: múi giờ Asia/Ho_Chi_Minh cho mọi phiên kết nối
const pool = mysql.createPool({
  ...db,
  waitForConnections: true,
  connectionLimit: 10,
  timezone: '+07:00',
  charset: 'utf8mb4',
  dateStrings: ['DATE'], // ngày chơi giữ dạng 'YYYY-MM-DD', không bị lệch múi giờ khi đổi sang Date
});

module.exports = pool;
