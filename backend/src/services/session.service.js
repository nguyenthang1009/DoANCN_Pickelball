const crypto = require('crypto');
const pool = require('../config/db');
const { session } = require('../config/env');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');

// Hai tab cùng làm mới phiên trong khoảng này không bị coi là token bị đánh cắp
const REUSE_GRACE_SECONDS = 10;

// CSDL chỉ lưu giá trị băm, lộ bảng này cũng không dùng lại được token
const hashToken = (raw) => crypto.createHash('sha256').update(raw).digest('hex');
const invalid = () => new HttpError(401, 'INVALID_REFRESH_TOKEN', 'Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');

async function issue(userId, familyId, db) {
  const raw = crypto.randomBytes(48).toString('base64url');
  await db.query(
    'INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at) VALUES (?, ?, ?, NOW() + INTERVAL ? DAY)',
    [userId, familyId, hashToken(raw), session.refreshDays],
  );
  return raw;
}

// Mỗi lần đăng nhập mở một họ token mới
const create = (userId) => issue(userId, crypto.randomUUID(), pool);

// Xoay vòng: token cũ hết hiệu lực, cấp token mới cùng họ. Token đã xoay rồi mà bị dùng lại nghĩa là có thể đã lộ,
// nên thu hồi cả họ. Token đã thu hồi (đăng xuất, đổi mật khẩu, lộ token) luôn bị từ chối, không có thời gian chờ.
async function rotate(raw) {
  if (!raw) throw invalid();
  const result = await withTransaction(async (conn) => {
    const [rows] = await conn.query(
      `SELECT id, user_id, family_id, revoked_at, rotated_at, expires_at <= NOW() AS expired,
              TIMESTAMPDIFF(SECOND, rotated_at, NOW()) AS rotated_seconds_ago
         FROM refresh_tokens WHERE token_hash = ? FOR UPDATE`,
      [hashToken(raw)],
    );
    const row = rows[0];
    if (!row || row.expired || row.revoked_at) return null;
    if (row.rotated_at) {
      if (row.rotated_seconds_ago > REUSE_GRACE_SECONDS) {
        await conn.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE family_id = ? AND revoked_at IS NULL', [row.family_id]);
        return null;
      }
    } else {
      await conn.query('UPDATE refresh_tokens SET rotated_at = NOW() WHERE id = ?', [row.id]);
    }
    return { userId: row.user_id, refreshToken: await issue(row.user_id, row.family_id, conn) };
  });
  if (!result) throw invalid();
  return result;
}

async function revoke(raw) {
  if (raw) await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = ? AND revoked_at IS NULL', [hashToken(raw)]);
}

// Đổi mật khẩu: đăng xuất mọi thiết bị đang đăng nhập
async function revokeAllForUser(userId) {
  await pool.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
}

async function purgeExpired() {
  await pool.query('DELETE FROM refresh_tokens WHERE expires_at <= NOW()');
}

module.exports = { create, rotate, revoke, revokeAllForUser, purgeExpired };
