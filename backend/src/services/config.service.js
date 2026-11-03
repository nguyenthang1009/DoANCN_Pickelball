const pool = require('../config/db');

// NFR11: tham số vận hành đọc từ bảng system_configs, có giá trị dự phòng
async function getNumber(key, fallback) {
  const [rows] = await pool.query('SELECT config_value FROM system_configs WHERE config_key = ?', [key]);
  const value = rows[0] ? Number(rows[0].config_value) : NaN;
  return Number.isFinite(value) ? value : fallback;
}

module.exports = { getNumber };
