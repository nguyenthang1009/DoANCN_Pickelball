const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const audit = require('./audit.service');

const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'site');
const PUBLIC_PREFIX = '/uploads/site/';
const SETTING_KEYS = ['project_name', 'project_type', 'team_members', 'advisor', 'tech_stack', 'deployment', 'seller_name', 'seller_tax_code', 'seller_address', 'hotline'];

// Vị trí ảnh của hệ thống. Ảnh riêng của khách hàng không thuộc nhóm này nên Admin không có API nào chạm tới.
const assertKey = (key) => {
  if (!/^(hero|auth|booking|gallery|community|section)\.[a-z0-9.-]{1,50}$/.test(key)) throw new HttpError(400, 'VALIDATION_ERROR', 'Vị trí ảnh không hợp lệ');
};

// Nhận diện định dạng bằng chữ ký đầu file, không tin Content-Type. Không nhận SVG vì có thể chứa script.
function detectImageType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

async function settingsMap(db = pool) {
  const [rows] = await db.query('SELECT setting_key, setting_value FROM site_settings');
  return Object.fromEntries(rows.map((r) => [r.setting_key, r.setting_value]));
}

// Thông tin bên bán in trên hóa đơn
async function sellerInfo(db = pool) {
  const s = await settingsMap(db);
  return { name: s.seller_name || '', taxCode: s.seller_tax_code || '', address: s.seller_address || '', hotline: s.hotline || '' };
}

async function content() {
  const [rows] = await pool.query('SELECT media_key, url, alt, focus_x, focus_y FROM site_media');
  const media = Object.fromEntries(rows.map((r) => [r.media_key, { url: r.url, alt: r.alt, focusX: r.focus_x, focusY: r.focus_y }]));
  return { media, settings: await settingsMap() };
}

function removeFile(url) {
  if (url && url.startsWith(PUBLIC_PREFIX)) fs.promises.unlink(path.join(UPLOAD_DIR, path.basename(url))).catch(() => {});
}

async function replaceImage(key, buffer, actor) {
  assertKey(key);
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Chưa có file ảnh');
  const ext = detectImageType(buffer);
  if (!ext) throw new HttpError(415, 'UNSUPPORTED_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${crypto.randomBytes(12).toString('hex')}.${ext}`; // tên ngẫu nhiên, không dùng tên file người dùng gửi
  await fs.promises.writeFile(path.join(UPLOAD_DIR, name), buffer);
  const url = `${PUBLIC_PREFIX}${name}`;
  const [old] = await pool.query('SELECT url FROM site_media WHERE media_key = ?', [key]);
  await pool.query(
    'INSERT INTO site_media (media_key, url, updated_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE url = VALUES(url), updated_by = VALUES(updated_by)',
    [key, url, actor.id],
  );
  removeFile(old[0]?.url);
  await audit.log(pool, { actorId: actor.id, actionType: 'REPLACE_SITE_IMAGE', entityType: 'SITE_MEDIA', entityId: 0, oldValues: { key, url: old[0]?.url ?? null }, newValues: { key, url } });
  return { key, url };
}

// Đổi mô tả ảnh và điểm lấy nét: khi màn hình hẹp, ảnh được cắt quanh điểm này
async function updateMeta(key, { alt, focusX, focusY }, actor) {
  assertKey(key);
  const inRange = (v) => Number.isInteger(v) && v >= 0 && v <= 100;
  if (!inRange(focusX) || !inRange(focusY)) throw new HttpError(400, 'VALIDATION_ERROR', 'Điểm lấy nét phải từ 0 đến 100');
  await pool.query(
    `INSERT INTO site_media (media_key, alt, focus_x, focus_y, updated_by) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE alt = VALUES(alt), focus_x = VALUES(focus_x), focus_y = VALUES(focus_y), updated_by = VALUES(updated_by)`,
    [key, typeof alt === 'string' ? alt.trim().slice(0, 255) : null, focusX, focusY, actor.id],
  );
  return { key, alt, focusX, focusY };
}

async function resetImage(key, actor) {
  assertKey(key);
  const [old] = await pool.query('SELECT url FROM site_media WHERE media_key = ?', [key]);
  await pool.query('DELETE FROM site_media WHERE media_key = ?', [key]);
  removeFile(old[0]?.url);
  await audit.log(pool, { actorId: actor.id, actionType: 'RESET_SITE_IMAGE', entityType: 'SITE_MEDIA', entityId: 0, oldValues: { key, url: old[0]?.url ?? null } });
}

async function saveSettings(values, actor) {
  const entries = Object.entries(values || {}).filter(([k]) => SETTING_KEYS.includes(k));
  if (!entries.length || entries.some(([, v]) => typeof v !== 'string' || v.length > 1000)) throw new HttpError(400, 'VALIDATION_ERROR', 'Nội dung không hợp lệ');
  await pool.query(
    'INSERT INTO site_settings (setting_key, setting_value, updated_by) VALUES ? ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by = VALUES(updated_by)',
    [entries.map(([k, v]) => [k, v.trim(), actor.id])],
  );
  await audit.log(pool, { actorId: actor.id, actionType: 'UPDATE_SITE_SETTINGS', entityType: 'SITE_SETTINGS', entityId: 0, newValues: Object.fromEntries(entries) });
  return settingsMap();
}

module.exports = { sellerInfo, content, replaceImage, updateMeta, resetImage, saveSettings, UPLOAD_DIR };
