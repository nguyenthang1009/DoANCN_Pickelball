// Xuất tập mờ, bộ luật và kết quả của bộ suy luận trên lưới điểm, để compare.py tính lại bằng scikit-fuzzy
// Chạy: node scripts/fuzzy-compare/export.js && python scripts/fuzzy-compare/compare.py
const path = require('path');
const fs = require('fs');
const { VARIABLES, RULES, infer } = require('../../src/utils/fuzzy');
const points = [];
for (const state of Object.keys(RULES)) {
  for (let lux = 0; lux <= 1000; lux += 25) {
    for (let a = 0; a <= 10.0001; a += 0.5) points.push({ state, lux, activity: Math.round(a * 10) / 10, centroid: infer(state, lux, a).centroid });
  }
}
fs.writeFileSync(path.join(__dirname, 'grid.json'), JSON.stringify({ variables: VARIABLES, rules: RULES, points }));
console.log('diem', points.length);
