// Kiểm thử dự báo doanh thu: công thức Holt-Winters với chuỗi biết trước đáp án, độ đo sai số tính tay,
// khoảng dự báo, phân quyền, đọc doanh thu từ sổ cái. Chạy trên CSDL vừa khởi tạo lại:
//   DB_NAME=pickleball_booking_e2e node scripts/forecast-test.js http://localhost:3000/api
// Đối chiếu với statsmodels chạy riêng: scripts/forecast-compare/compare.py
require('dotenv').config({ quiet: true });
const mysql = require('mysql2/promise');
const f = require('../src/utils/forecast');

const BASE = process.argv[2] || 'http://localhost:3000/api';
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const near = (name, actual, expected, tol) => check(name, Math.abs(actual - expected) <= tol, `-> ${actual}, cần ${expected} ± ${tol}`);
const expectError = (name, r, status, code) => check(name, r.status === status && r.data?.error?.code === code, `-> ${r.status} ${r.data?.error?.code}`);
async function call(path, { token } = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: '12345678' }) })).json()).token;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const todayVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);

function testEngine() {
  console.log('\n--- Công thức với chuỗi biết trước đáp án');
  const pattern = [100, 80, 90, 95, 120, 180, 160].map((v) => v * 10000);
  const truth = (t) => 2000000 + 5000 * t + pattern[t % 7];
  const y = Array.from({ length: 70 }, (_, t) => truth(t));
  const init = f.initialStates(y);
  near('Khởi tạo: xu hướng đúng 5.000đ/ngày', init.trend, 5000, 1e-6);
  const periodic = Array.from({ length: 70 }, (_, t) => 2000000 + pattern[t % 7]);
  const exact = f.run(periodic, { alpha: 0.3, beta: 0.1, gamma: 0.2 });
  near('Chuỗi lặp theo tuần: giá trị khớp trùng thực tế', Math.max(...periodic.map((v, t) => Math.abs(v - exact.fitted[t]))), 0, 1e-6);
  near('Chuỗi lặp theo tuần: dự báo 21 ngày trùng giá trị thật', Math.max(...f.project(exact.state, { phi: 1 }, 21).map((v, i) => Math.abs(v - periodic[i % 7]))), 0, 1e-6);
  // Có xu hướng: khởi tạo cổ điển lẫn một phần xu hướng vào mùa vụ tuần đầu, mô hình tự sửa dần qua các tuần
  const model = f.fit(y);
  const ahead = f.project(model.state, model.params, 21);
  check('Chuỗi có xu hướng: sau 10 tuần, dự báo 21 ngày lệch dưới 1%', ahead.every((v, i) => Math.abs(v - truth(70 + i)) / truth(70 + i) < 0.01), JSON.stringify(ahead.map((v, i) => Math.round(((v - truth(70 + i)) / truth(70 + i)) * 10000) / 100)));
  const damped = f.project({ level: 1000, trend: 10, season: Array(7).fill(0), n: 0 }, { phi: 0.5 }, 3);
  near('Xu hướng giảm dần φ = 0,5: cộng thêm 10×(0,5 + 0,25 + 0,125)', damped[2], 1000 + 10 * 0.875, 1e-9);

  const flat = f.forecastSeries(Array(42).fill(1000000), 14);
  near('Doanh thu không đổi: dự báo giữ nguyên', Math.max(...flat.forecast.map((p) => Math.abs(p.value - 1000000))), 0, 1e-6);
  near('Doanh thu không đổi: khoảng dự báo bằng 0', Math.max(...flat.forecast.map((p) => p.hi95 - p.lo95)), 0, 1e-6);
  check('Chưa đủ 4 tuần thì không dự báo', f.forecastSeries(Array(27).fill(1), 7).ok === false);

  console.log('\n--- Độ đo sai số tính tay');
  check('Naive theo mùa lấy cùng thứ tuần trước', JSON.stringify(f.seasonalNaive([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 9)) === JSON.stringify([8, 9, 10, 11, 12, 13, 14, 8, 9]));
  const acc = f.accuracy([100, 200], [110, 190], [10, 20, 30, 40, 50, 60, 70, 15]);
  near('MAE = 10', acc.mae, 10, 1e-9);
  near('RMSE = 10', acc.rmse, 10, 1e-9);
  near('MAPE = (10% + 5%)/2 = 7,5%', acc.mape, 7.5, 1e-9);
  near('MASE = 10 / |15 − 10| = 2', acc.mase, 2, 1e-9);

  console.log('\n--- Chọn mô hình và khoảng dự báo');
  const random = f.rng(11);
  const noisy = Array.from({ length: 168 }, (_, t) => truth(t) + (random() - 0.5) * 300000);
  const out = f.forecastSeries(noisy, 30);
  check('Có xu hướng và mùa vụ: Holt-Winters thắng naive theo mùa', out.chosen !== 'SNAIVE' && out.evaluation[out.chosen].mase < out.evaluation.SNAIVE.mase, JSON.stringify(Object.fromEntries(Object.entries(out.evaluation).map(([k, v]) => [k, v.mase]))));
  check('Khoảng 80% nằm trong khoảng 95%', out.forecast.every((p) => p.lo95 <= p.lo80 && p.hi80 <= p.hi95));
  check('Khoảng dự báo rộng dần theo số ngày', out.forecast[29].hi95 - out.forecast[29].lo95 > out.forecast[0].hi95 - out.forecast[0].lo95);
  check('Ảnh hưởng thứ trong tuần: thứ của ngày 5 (cao nhất) dương, ngày 1 âm', out.weekly[5].effect > 0 && out.weekly[1].effect < 0);
  // Độ phủ: lặp 20 chuỗi, tỷ lệ ngày thật rơi vào khoảng 80% phải gần 80%
  let inside = 0;
  let total = 0;
  for (let s = 0; s < 20; s++) {
    const r = f.rng(100 + s);
    const series = Array.from({ length: 182 }, (_, t) => truth(t) + (r() - 0.5) * 400000);
    const model = f.fit(series.slice(0, 168));
    const bands = f.bootstrapIntervals(model, 14, { paths: 400, seed: s });
    series.slice(168).forEach((v, i) => { total++; if (v >= bands[i][80][0] && v <= bands[i][80][1]) inside++; });
  }
  near('Độ phủ khoảng 80% trên 280 ngày kiểm tra', inside / total, 0.8, 0.1);
}

async function testApi() {
  console.log('\n--- Phân quyền và đọc từ sổ cái');
  const [admin, manager, staff] = await Promise.all(['admin@pickleball.vn', 'manager.q7@pickleball.vn', 'staff.q7@pickleball.vn'].map(login));
  expectError('Quản lý không xem được dự báo', await call('/finance/forecast', { token: manager }), 403, 'FORBIDDEN');
  expectError('Lễ tân không xem được dự báo', await call('/finance/forecast', { token: staff }), 403, 'FORBIDDEN');
  expectError('Số ngày dự báo ngoài 7-90 bị từ chối', await call('/finance/forecast?horizon=5', { token: admin }), 400, 'VALIDATION_ERROR');
  const empty = await call('/finance/forecast?venueId=2', { token: admin });
  check('Cơ sở chưa có doanh thu: báo chưa đủ dữ liệu', empty.status === 200 && empty.data.ok === false, JSON.stringify(empty.data).slice(0, 200));
  const demo = await call('/finance/forecast?demo=1', { token: admin });
  check('Dữ liệu mô phỏng: có dự báo 30 ngày', demo.data.ok && demo.data.source === 'DEMO' && demo.data.forecast.length === 30);
  check('Ngày dự báo bắt đầu từ hôm nay', demo.data.forecast[0].date === todayVN());
  check('Mô phỏng lần nào cũng ra cùng kết quả', JSON.stringify((await call('/finance/forecast?demo=1', { token: admin })).data.forecast) === JSON.stringify(demo.data.forecast));

  // Ghi 8 tuần doanh thu lịch sử vào sổ cái của CSDL thử: cùng thứ thì cùng số tiền, không xu hướng
  const db = await mysql.createConnection({ host: process.env.DB_HOST || 'localhost', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME || 'pickleball_booking_e2e' });
  const weekly = [3000000, 1800000, 1600000, 1700000, 1900000, 2400000, 3200000]; // CN ... T7
  const yesterday = addDays(todayVN(), -1);
  const start = addDays(yesterday, -55);
  const [[{ existing }]] = await db.query("SELECT COALESCE(SUM(l.credit - l.debit), 0) AS existing FROM gl_entries e JOIN gl_lines l ON l.entry_id = e.id WHERE e.venue_id = 1 AND l.account_code IN ('5111','5113') AND e.entry_date BETWEEN ? AND ?", [start, yesterday]);
  check('Sổ cái cơ sở 1 chưa có doanh thu trong 8 tuần qua (CSDL vừa khởi tạo)', Number(existing) === 0, `-> ${existing}`);
  for (let i = 0; i < 56; i++) {
    const date = addDays(start, i);
    const amount = weekly[new Date(`${date}T00:00:00Z`).getUTCDay()];
    const [res] = await db.query("INSERT INTO gl_entries (entry_date, venue_id, source_type, source_id, memo) VALUES (?, 1, 'TEST_HISTORY', ?, 'Doanh thu lịch sử cho kiểm thử dự báo')", [date, 900000 + i]);
    await db.query('INSERT INTO gl_lines (entry_id, account_code, debit, credit) VALUES (?, ?, ?, 0), (?, ?, 0, ?)', [res.insertId, '1111', amount, res.insertId, '5113', amount]);
  }
  await db.end();
  const real = (await call('/finance/forecast?venueId=1&horizon=14', { token: admin })).data;
  check('Đọc đủ 56 ngày từ sổ cái', real.ok && real.days === 56 && real.source === 'LEDGER', JSON.stringify(real).slice(0, 200));
  const expected = real.forecast.map((p) => weekly[new Date(`${p.date}T00:00:00Z`).getUTCDay()]);
  near('Chuỗi lặp đúng theo tuần: dự báo trùng doanh thu cùng thứ (sai lệch tối đa)', Math.max(...real.forecast.map((p, i) => Math.abs(p.value - expected[i]))), 0, 1);
  near('Tổng 30 ngày qua khớp sổ cái', real.summary.last30, Array.from({ length: 30 }, (_, i) => weekly[new Date(`${addDays(yesterday, -i)}T00:00:00Z`).getUTCDay()]).reduce((s, v) => s + v, 0), 0);
  check('Toàn chuỗi gồm cả cơ sở 1', (await call('/finance/forecast', { token: admin })).data.days === 56);
}

(async () => {
  testEngine();
  await testApi();
  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
