const pool = require('../config/db');

// Chạy fn(conn) trong một transaction; lỗi ở bất kỳ bước nào sẽ rollback toàn bộ
async function withTransaction(fn) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = withTransaction;
