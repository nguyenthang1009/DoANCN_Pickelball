// Xuất chuỗi thử và kết quả của bộ dự báo để đối chiếu với statsmodels (compare.py).
// Chạy: node scripts/forecast-compare/export.js && scripts/forecast-compare/.venv/Scripts/python scripts/forecast-compare/compare.py
const fs = require('fs');
const path = require('path');
const { run, project, initialStates, rng } = require('../../src/utils/forecast');

const random = rng(7);
const pattern = [0.9, 0.85, 0.9, 0.95, 1.1, 1.5, 1.4];
const y = Array.from({ length: 140 }, (_, t) => Math.round((4e6 + t * 8000) * pattern[t % 7] + (random() - 0.5) * 4e5));
const cases = [
  { name: 'Holt-Winters cộng tính', params: { alpha: 0.3, beta: 0.1, gamma: 0.2, phi: 1 } },
  { name: 'Xu hướng giảm dần φ = 0,9', params: { alpha: 0.4, beta: 0.05, gamma: 0.15, phi: 0.9 } },
  { name: 'Tham số do lưới chọn', params: { alpha: 0.05, beta: 0.01, gamma: 0.35, phi: 1 } },
].map((c) => {
  const init = initialStates(y);
  const { fitted, state } = run(y, c.params, init);
  return { ...c, init, fitted, forecast: project(state, c.params, 30) };
});
fs.writeFileSync(path.join(__dirname, 'series.json'), JSON.stringify({ y, cases }));
console.log(`Đã xuất ${y.length} ngày, ${cases.length} bộ tham số`);
