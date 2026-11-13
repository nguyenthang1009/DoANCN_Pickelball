const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const withTransaction = require('../utils/transaction');
const audit = require('./audit.service');

// Danh mục dịch vụ bán tại quầy (bảng services): nước uống, thuê vợt, bóng...
const CATEGORIES = ['DRINK', 'EQUIPMENT', 'OTHER'];
// Ảnh món lưu trên máy chủ, tên file ngẫu nhiên; chỉ nhận JPG, PNG, WebP kiểm tra bằng chữ ký file
const IMAGE_DIR = path.join(__dirname, '..', '..', 'uploads', 'services');
const IMAGE_PREFIX = '/uploads/services/';

function toItem(row) {
  return {
    id: row.id,
    venueId: row.venue_id,
    name: row.name,
    category: row.category,
    unit: row.unit,
    unitPrice: row.unit_price,
    imageUrl: row.image_url ?? null,
    isActive: Boolean(row.is_active),
  };
}

async function list(venueId, { includeInactive = false } = {}) {
  const [rows] = await pool.query(
    `SELECT * FROM services WHERE venue_id = ? ${includeInactive ? '' : 'AND is_active = TRUE'} ORDER BY category, name`,
    [venueId],
  );
  return rows.map(toItem);
}

async function getOrThrow(id, db = pool) {
  const [rows] = await db.query('SELECT * FROM services WHERE id = ?', [id]);
  if (!rows[0]) throw new HttpError(404, 'SERVICE_NOT_FOUND', 'Không tìm thấy dịch vụ');
  return toItem(rows[0]);
}

function validate({ name, category, unit, unitPrice }, partial) {
  const has = (v) => !partial || v !== undefined;
  if (has(name) && (typeof name !== 'string' || !name.trim() || name.trim().length > 100)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'name là bắt buộc, tối đa 100 ký tự');
  }
  if (category !== undefined && !CATEGORIES.includes(category)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'category phải là DRINK, EQUIPMENT hoặc OTHER');
  }
  if (has(unit) && (typeof unit !== 'string' || !unit.trim() || unit.trim().length > 30)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'unit là bắt buộc, tối đa 30 ký tự (Chai, Lon, Lượt...)');
  }
  // BR18: VND số nguyên, bội số 1.000
  if (has(unitPrice) && (!Number.isInteger(unitPrice) || unitPrice <= 0 || unitPrice % 1000 !== 0)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'unitPrice phải là số nguyên dương, bội số của 1.000 VND');
  }
}

async function create(venueId, { name, category = 'DRINK', unit, unitPrice }, actor) {
  validate({ name, category, unit, unitPrice }, false);
  return withTransaction(async (conn) => {
    const [result] = await conn.query(
      'INSERT INTO services (venue_id, name, category, unit, unit_price) VALUES (?, ?, ?, ?, ?)',
      [venueId, name.trim(), category, unit.trim(), unitPrice],
    );
    const item = await getOrThrow(result.insertId, conn);
    await audit.log(conn, { actorId: actor.id, venueId, actionType: 'CREATE_SERVICE', entityType: 'SERVICE', entityId: item.id, newValues: item });
    return item;
  });
}

// BR16: món đã bán không xóa, chỉ ngừng bán (isActive = false). Đổi giá không ảnh hưởng hóa đơn cũ (unit_price_snapshot).
async function update(item, patch, actor) {
  validate(patch, true);
  const next = {
    name: patch.name !== undefined ? patch.name.trim() : item.name,
    category: patch.category ?? item.category,
    unit: patch.unit !== undefined ? patch.unit.trim() : item.unit,
    unitPrice: patch.unitPrice ?? item.unitPrice,
    isActive: patch.isActive !== undefined ? Boolean(patch.isActive) : item.isActive,
  };
  return withTransaction(async (conn) => {
    await conn.query(
      'UPDATE services SET name = ?, category = ?, unit = ?, unit_price = ?, is_active = ? WHERE id = ?',
      [next.name, next.category, next.unit, next.unitPrice, next.isActive, item.id],
    );
    const updated = await getOrThrow(item.id, conn);
    await audit.log(conn, { actorId: actor.id, venueId: item.venueId, actionType: 'UPDATE_SERVICE', entityType: 'SERVICE', entityId: item.id, oldValues: item, newValues: updated });
    return updated;
  });
}

const removeFile = (url) => {
  if (url && url.startsWith(IMAGE_PREFIX)) fs.promises.unlink(path.join(IMAGE_DIR, path.basename(url))).catch(() => {});
};

// Đổi ảnh món: ảnh cũ bị xóa khỏi máy chủ sau khi lưu ảnh mới
async function setImage(item, buffer, actor) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) throw new HttpError(400, 'VALIDATION_ERROR', 'Chưa có file ảnh');
  const ext = require('./site.service').detectImageType(buffer);
  if (!ext) throw new HttpError(415, 'UNSUPPORTED_IMAGE', 'Chỉ nhận ảnh JPG, PNG hoặc WebP');
  await fs.promises.mkdir(IMAGE_DIR, { recursive: true });
  const url = `${IMAGE_PREFIX}${crypto.randomBytes(12).toString('hex')}.${ext}`;
  await fs.promises.writeFile(path.join(IMAGE_DIR, path.basename(url)), buffer);
  const old = await getOrThrow(item.id);
  await pool.query('UPDATE services SET image_url = ? WHERE id = ?', [url, item.id]);
  removeFile(old.imageUrl);
  await audit.log(pool, { actorId: actor.id, venueId: item.venueId, actionType: 'UPDATE_SERVICE_IMAGE', entityType: 'SERVICE', entityId: item.id, newValues: { name: item.name, imageUrl: url } });
  return getOrThrow(item.id);
}

async function removeImage(item, actor) {
  const old = await getOrThrow(item.id);
  await pool.query('UPDATE services SET image_url = NULL WHERE id = ?', [item.id]);
  removeFile(old.imageUrl);
  await audit.log(pool, { actorId: actor.id, venueId: item.venueId, actionType: 'REMOVE_SERVICE_IMAGE', entityType: 'SERVICE', entityId: item.id, oldValues: { imageUrl: old.imageUrl } });
  return getOrThrow(item.id);
}

module.exports = { list, getOrThrow, create, update, setImage, removeImage, IMAGE_DIR };
