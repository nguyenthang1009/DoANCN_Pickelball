const crypto = require('crypto');
const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { toMinutes, nowInVietnam, assertDate } = require('../utils/time');
const fuzzy = require('../utils/fuzzy');
const yeelight = require('../utils/yeelight');
const realtime = require('../realtime');
const audit = require('./audit.service');
const configService = require('./config.service');

// Mức hoạt động suy ra từ hệ thống khi chưa có cảm biến: khách đã nhận sân thì coi như đang chơi
const ACTIVITY_FROM_CHECKIN = 7;
const SENSOR_STALE_MS = 2 * 60 * 1000;

// Trạng thái đặt sân của một sân tại một thời điểm, chỉ tính đơn đã thanh toán
function resolveState(court, slots, minute, earlyMinutes) {
  if (court.status !== 'ACTIVE') return { state: 'MAINTENANCE', booking: null };
  const mine = slots.filter((s) => s.court_id === court.id);
  const current = mine.find((s) => toMinutes(s.start_time) <= minute && minute < toMinutes(s.end_time));
  if (current) return { state: 'ACTIVE', booking: current };
  const next = mine.find((s) => toMinutes(s.start_time) > minute && toMinutes(s.start_time) - minute <= earlyMinutes);
  if (next) return { state: 'PREPARING', booking: next };
  return { state: 'IDLE', booking: null };
}

async function loadVenue(venueId, at) {
  await pool.query('INSERT IGNORE INTO court_lighting (court_id) SELECT id FROM courts WHERE venue_id = ?', [venueId]);
  const [courts] = await pool.query(
    `SELECT c.id, c.name, c.status, c.court_type, c.venue_id, l.*, TIMESTAMPDIFF(SECOND, l.sensor_at, NOW()) AS sensor_age
       FROM courts c JOIN court_lighting l ON l.court_id = c.id
      WHERE c.venue_id = ? AND c.status <> 'INACTIVE' ORDER BY c.name`,
    [venueId],
  );
  const [slots] = await pool.query(
    `SELECT s.court_id, s.start_time, s.end_time, b.booking_code, b.checkin_status, COALESCE(u.full_name, b.guest_name) AS customer
       FROM booking_slots s JOIN bookings b ON b.id = s.booking_id LEFT JOIN users u ON u.id = b.customer_id
      WHERE s.venue_id = ? AND s.booking_date = ? AND s.slot_status = 'CONFIRMED' AND b.payment_status = 'PAID'
      ORDER BY s.start_time`,
    [venueId, at.date],
  );
  return { courts, slots };
}

function toView(c, result, bookingInfo, sensorFresh) {
  return {
    courtId: c.id, courtName: c.name, courtType: c.court_type, courtStatus: c.status,
    state: result.state, booking: bookingInfo,
    inputs: { lux: result.lux, activity: result.activity, luxSource: c.lux === null ? 'DEFAULT' : c.sensor_source, activitySource: c.activity === null ? 'CHECKIN' : c.sensor_source, sensorAt: c.sensor_at, sensorFresh },
    mode: c.mode, manualLevel: c.manual_level, manualLimited: Boolean(result.manualLimited), level: result.finalLevel, fuzzyLevel: result.level, centroid: result.centroid, warning: result.warning,
    memberships: result.memberships, fired: result.fired, curve: result.curve.filter((_, i) => i % 4 === 0),
    bulb: c.bulb_ip ? { ip: c.bulb_ip, ...yeelight.status(c.bulb_ip) } : null,
  };
}

// Vòng điều khiển và thao tác trên màn hình có thể cùng tính lại một cơ sở. Chạy song song thì cả hai cùng thấy
// trạng thái cũ, cùng gửi lệnh xuống đèn và ghi nhật ký trùng, nên mỗi cơ sở chỉ cho một lần tính chạy tại một thời điểm.
const venueQueues = new Map();
function evaluateVenue(venueId, options = {}) {
  if (options.at) return evaluateNow(venueId, options);
  const run = (venueQueues.get(venueId) || Promise.resolve()).then(() => evaluateNow(venueId, options));
  venueQueues.set(venueId, run.catch(() => {}));
  return run;
}

// Tính lại toàn bộ sân của một cơ sở. Có thay đổi thì lưu, ghi nhật ký, đẩy xuống đèn và báo realtime.
// at: thời điểm giả định, chỉ dùng cho kiểm thử; khi đó không lưu gì.
// notify: vừa có thao tác ghi (số đo, chế độ, đèn) nên báo màn hình tải lại dù độ sáng không đổi.
// Chỉ đọc thì không báo khi không có gì đổi: màn hình nhận báo sẽ đọc lại, nếu đọc cũng báo thì thành vòng lặp vô hạn.
async function evaluateNow(venueId, { at, notify = false } = {}) {
  const dryRun = Boolean(at);
  const when = at || nowInVietnam();
  const minute = toMinutes(when.time);
  const earlyMinutes = await configService.getNumber('CHECKIN_EARLY_WINDOW_MINUTES', 30);
  const { courts, slots } = await loadVenue(venueId, when);
  const views = [];
  let anyChanged = false;
  for (const c of courts) {
    const { state, booking } = resolveState(c, slots, minute, earlyMinutes);
    const sensorFresh = c.sensor_age !== null && c.sensor_age * 1000 < SENSOR_STALE_MS;
    // Chưa có số đo ánh sáng thì coi như trời tối để không bao giờ để khách chơi trong bóng tối
    const lux = c.lux ?? 0;
    const activity = c.activity === null ? (booking?.checkin_status === 'CHECKED_IN' && state === 'ACTIVE' ? ACTIVITY_FROM_CHECKIN : 0) : Number(c.activity);
    const result = state === 'MAINTENANCE'
      ? { state, lux, activity, memberships: null, fired: [], centroid: 0, level: 0, warning: false, curve: [] }
      : fuzzy.infer(state, lux, activity);
    // Đang có khách chơi: chỉnh tay chỉ được sáng hơn, không tắt hay giảm dưới mức Fuzzy tính
    const manual = state !== 'MAINTENANCE' && c.mode === 'MANUAL';
    result.manualLimited = manual && state === 'ACTIVE' && c.manual_level < result.level;
    result.finalLevel = manual ? (result.manualLimited ? result.level : c.manual_level) : result.level;
    const bookingInfo = booking ? { code: booking.booking_code, customer: booking.customer, start: booking.start_time.slice(0, 5), end: booking.end_time.slice(0, 5), checkedIn: booking.checkin_status === 'CHECKED_IN' } : null;
    const view = toView(c, result, bookingInfo, sensorFresh);

    const changed = c.state !== state || c.level !== view.level || Boolean(c.warning) !== view.warning;
    if (!dryRun && changed) {
      anyChanged = true;
      await pool.query('UPDATE court_lighting SET state = ?, level = ?, warning = ? WHERE court_id = ?', [state, view.level, view.warning, c.id]);
      await pool.query(
        'INSERT INTO lighting_logs (court_id, venue_id, state, lux, activity, level, warning, mode) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [c.id, venueId, state, lux, activity, view.level, view.warning, c.mode],
      );
      if (view.warning && !c.warning) realtime.emitLightingAlert(venueId, { courtId: c.id, courtName: c.name, message: `${c.name}: có người trên sân nhưng không có đơn đặt` });
    }
    if (!dryRun && c.bulb_ip) view.bulb = { ip: c.bulb_ip, ...await yeelight.apply(c.bulb_ip, { level: view.level, warning: view.warning }) };
    views.push(view);
  }
  if (!dryRun && (anyChanged || notify)) realtime.emitLightingChanged(venueId);
  return { venueId, at: when, courts: views };
}

// Vòng điều khiển: đánh giá lại mọi cơ sở định kỳ (trạng thái đặt sân đổi theo giờ)
async function tick() {
  const [venues] = await pool.query('SELECT id FROM venues WHERE is_active = TRUE');
  for (const v of venues) await evaluateVenue(v.id);
}

const scopeVenue = (user, venueId) => {
  const id = user.role === 'ADMIN' ? Number(venueId) : user.venueId;
  if (!id) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần chọn cơ sở');
  return id;
};

async function courtForUser(courtId, user) {
  const [rows] = await pool.query('SELECT id, venue_id, name FROM courts WHERE id = ?', [courtId]);
  if (!rows[0]) throw new HttpError(404, 'COURT_NOT_FOUND', 'Không tìm thấy sân');
  if (user && user.role !== 'ADMIN' && user.venueId !== rows[0].venue_id) throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được thao tác trên cơ sở của mình');
  await pool.query('INSERT IGNORE INTO court_lighting (court_id) VALUES (?)', [courtId]);
  return rows[0];
}

const isNullOr = (v, check) => v === null || check(v);
function assertReading({ lux, activity }) {
  if (lux !== undefined && !isNullOr(lux, (x) => Number.isFinite(x) && x >= 0 && x <= 100000)) throw new HttpError(400, 'VALIDATION_ERROR', 'lux phải là số không âm');
  if (activity !== undefined && !isNullOr(activity, (x) => Number.isFinite(x) && x >= 0 && x <= 10)) throw new HttpError(400, 'VALIDATION_ERROR', 'activity phải từ 0 đến 10');
}

async function saveReading(court, { lux, activity }, source) {
  assertReading({ lux, activity });
  const sets = ['sensor_source = ?', 'sensor_at = NOW()'];
  const params = [source];
  if (lux !== undefined) { sets.push('lux = ?'); params.push(lux === null ? null : Math.round(lux)); }
  if (activity !== undefined) { sets.push('activity = ?'); params.push(activity === null ? null : Math.round(activity * 10) / 10); }
  await pool.query(`UPDATE court_lighting SET ${sets.join(', ')} WHERE court_id = ?`, [...params, court.id]);
  return evaluateVenue(court.venue_id, { notify: true });
}

// Màn mô phỏng: quản lý kéo thanh trượt thay cho cảm biến thật
async function simulate(courtId, body, user) {
  return saveReading(await courtForUser(courtId, user), body, 'SIMULATOR');
}

// Thiết bị IoT (ESP32, script giả lập) gửi số đo bằng khóa thiết bị riêng, không dùng tài khoản người
async function deviceReading(deviceKey, body) {
  const expected = process.env.IOT_DEVICE_KEY || '';
  const a = Buffer.from(String(deviceKey || ''));
  const b = Buffer.from(expected);
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new HttpError(401, 'INVALID_DEVICE_KEY', 'Khóa thiết bị không hợp lệ');
  const court = await courtForUser(Number(body.courtId), null);
  const result = await saveReading(court, { lux: body.lux, activity: body.activity }, 'DEVICE');
  return result.courts.find((c) => c.courtId === court.id);
}

async function setMode(courtId, { mode, manualLevel }, user) {
  const court = await courtForUser(courtId, user);
  if (!['AUTO', 'MANUAL'].includes(mode)) throw new HttpError(400, 'VALIDATION_ERROR', 'mode phải là AUTO hoặc MANUAL');
  if (mode === 'MANUAL' && !(Number.isInteger(manualLevel) && manualLevel >= 0 && manualLevel <= 100)) throw new HttpError(400, 'VALIDATION_ERROR', 'Độ sáng thủ công từ 0 đến 100');
  await pool.query('UPDATE court_lighting SET mode = ?, manual_level = ? WHERE court_id = ?', [mode, mode === 'MANUAL' ? manualLevel : null, court.id]);
  await audit.log(pool, { actorId: user.id, venueId: court.venue_id, actionType: 'LIGHTING_MODE', entityType: 'COURT', entityId: court.id, newValues: { mode, manualLevel } });
  return evaluateVenue(court.venue_id, { notify: true });
}

async function setBulb(courtId, { ip }, user) {
  const court = await courtForUser(courtId, user);
  if (ip !== null && !(typeof ip === 'string' && yeelight.isLanAddress(ip.trim()))) throw new HttpError(400, 'VALIDATION_ERROR', 'Địa chỉ đèn phải là IPv4 trong mạng nội bộ, VD 192.168.1.50');
  const [[old]] = await pool.query('SELECT bulb_ip FROM court_lighting WHERE court_id = ?', [court.id]);
  // Một bóng chỉ điều khiển một sân: hai sân cùng gửi lệnh khác nhau làm đèn tắt bật liên tục và bị khóa lệnh
  if (ip !== null) {
    const [taken] = await pool.query('SELECT c.name FROM court_lighting l JOIN courts c ON c.id = l.court_id WHERE l.bulb_ip = ? AND l.court_id <> ?', [ip.trim(), court.id]);
    if (taken[0]) throw new HttpError(409, 'BULB_IN_USE', `Đèn ${ip.trim()} đang gán cho ${taken[0].name}. Gỡ đèn ở sân đó trước.`);
  }
  if (old.bulb_ip) yeelight.forget(old.bulb_ip);
  try {
    await pool.query('UPDATE court_lighting SET bulb_ip = ? WHERE court_id = ?', [ip === null ? null : ip.trim(), court.id]);
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'BULB_IN_USE', `Đèn ${ip.trim()} vừa được gán cho sân khác`);
    throw err;
  }
  await audit.log(pool, { actorId: user.id, venueId: court.venue_id, actionType: 'LIGHTING_BULB', entityType: 'COURT', entityId: court.id, oldValues: { ip: old.bulb_ip }, newValues: { ip } });
  return evaluateVenue(court.venue_id, { notify: true });
}

// Tìm đèn Yeelight trong mạng nội bộ (đèn phải bật LAN Control), kèm sân đang gán từng đèn
async function discoverBulbs(user, venueId) {
  const venue = scopeVenue(user, venueId);
  const found = (await yeelight.discover()).filter((b) => yeelight.isLanAddress(b.ip));
  const [assigned] = await pool.query('SELECT l.bulb_ip, c.name, c.venue_id FROM court_lighting l JOIN courts c ON c.id = l.court_id WHERE l.bulb_ip IS NOT NULL');
  return found.map((b) => {
    const court = assigned.find((a) => a.bulb_ip === b.ip);
    return { ...b, assignedTo: court ? (court.venue_id === venue ? court.name : 'cơ sở khác') : null };
  });
}

// Điện năng: cộng dồn độ sáng theo thời gian từ nhật ký thay đổi, so với cách cũ là bật 100% suốt giờ có khách
async function energy(user, { venueId, from, to } = {}) {
  const venue = scopeVenue(user, venueId);
  const today = nowInVietnam().date;
  const start = from || today;
  const end = to || today;
  assertDate(start, 'from');
  assertDate(end, 'to');
  const watts = await configService.getNumber('COURT_LIGHT_WATTS', 1600);
  const rangeStart = Date.parse(`${start}T00:00:00+07:00`);
  const rangeEnd = Math.min(Date.parse(`${end}T23:59:59+07:00`) + 1000, Date.now());
  const [logs] = await pool.query(
    `SELECT l.court_id, l.state, l.level, UNIX_TIMESTAMP(l.created_at) * 1000 AS ts FROM lighting_logs l
      WHERE l.venue_id = ? AND l.created_at < FROM_UNIXTIME(? / 1000)
        AND (l.created_at >= FROM_UNIXTIME(? / 1000) OR l.id IN (
          SELECT MAX(x.id) FROM lighting_logs x WHERE x.venue_id = ? AND x.created_at < FROM_UNIXTIME(? / 1000) GROUP BY x.court_id))
      ORDER BY l.court_id, l.created_at, l.id`,
    [venue, rangeEnd, rangeStart, venue, rangeStart],
  );
  let actual = 0;
  let baseline = 0;
  let litHours = 0;
  for (let i = 0; i < logs.length; i++) {
    const log = logs[i];
    const next = logs[i + 1]?.court_id === log.court_id ? Number(logs[i + 1].ts) : rangeEnd;
    const hours = Math.max(0, Math.min(next, rangeEnd) - Math.max(Number(log.ts), rangeStart)) / 3600000;
    actual += (log.level / 100) * hours;
    if (log.state === 'ACTIVE') baseline += hours;
    if (log.level > 0) litHours += hours;
  }
  const kwh = (fullHours) => Math.round(fullHours * watts) / 1000; // chính xác tới 1 Wh
  return {
    venueId: venue, from: start, to: end, watts,
    actualKwh: kwh(actual), baselineKwh: kwh(baseline), savedKwh: kwh(Math.max(0, baseline - actual)),
    savedPercent: baseline > 0 ? Math.round((1 - actual / baseline) * 1000) / 10 : 0, litHours: Math.round(litHours * 100) / 100,
  };
}

const model = () => ({ variables: fuzzy.VARIABLES, rules: fuzzy.RULES, offThreshold: fuzzy.OFF_THRESHOLD });

async function list(user, venueId) {
  return evaluateVenue(scopeVenue(user, venueId));
}

module.exports = { resolveState, evaluateVenue, tick, list, simulate, deviceReading, setMode, setBulb, energy, model, discoverBulbs };
