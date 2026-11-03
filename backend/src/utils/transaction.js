const pool = require('../config/db');

const RETRYABLE = new Set(['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT']);

// Chạy fn(conn) trong một transaction; lỗi ở bất kỳ bước nào sẽ rollback toàn bộ.
// retries > 0: khi MySQL báo deadlock (nhiều người cùng ghi một vùng chỉ mục), chạy lại cả transaction.
async function withTransaction(fn, { retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const result = await fn(conn);
      await conn.commit();
      return result;
    } catch (err) {
      await conn.rollback();
      if (attempt < retries && RETRYABLE.has(err.code)) continue;
      throw err;
    } finally {
      conn.release();
    }
  }
}

module.exports = withTransaction;
