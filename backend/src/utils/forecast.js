// Dự báo doanh thu theo ngày bằng làm trơn hàm mũ Holt-Winters, mùa vụ theo tuần (m = 7).
// Hàm thuần, không đụng CSDL, để kiểm thử và đối chiếu với thư viện statsmodels.
//
// Tài liệu tham khảo:
// [1] Hyndman, R.J., Athanasopoulos, G. (2021). Forecasting: Principles and Practice, 3rd ed. OTexts. https://otexts.com/fpp3/
//     Mục 8.3 (Holt-Winters cộng tính), 8.2 (xu hướng giảm dần), 5.5 (khoảng dự báo bằng bootstrap phần dư),
//     5.8 (độ chính xác: MAE, RMSE, MAPE, MASE), 5.2 (naive theo mùa làm mốc so sánh), 5.8 (tách tập kiểm tra).
// [2] Winters, P.R. (1960). Forecasting sales by exponentially weighted moving averages. Management Science 6(3), 324-342.
// [3] Holt, C.C. (2004). Forecasting seasonals and trends by exponentially weighted moving averages. Int. J. Forecasting 20(1), 5-10.
// [4] Hyndman, R.J., Koehler, A.B. (2006). Another look at measures of forecast accuracy. Int. J. Forecasting 22(4), 679-688.
//
// Phương trình (dạng thành phần, [1] mục 8.3 và 8.2), φ = 1 là Holt-Winters thường, φ < 1 là xu hướng giảm dần:
//   ℓt = α(yt − st−m) + (1 − α)(ℓt−1 + φ bt−1)
//   bt = β(ℓt − ℓt−1) + (1 − β) φ bt−1
//   st = γ(yt − ℓt−1 − φ bt−1) + (1 − γ) st−m
//   ŷt+h|t = ℓt + (φ + φ² + … + φʰ) bt + st+h−m(k+1),   k = ⌊(h − 1)/m⌋

const M = 7;
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;

// Khởi tạo cổ điển: mức = trung bình tuần đầu, xu hướng = chênh lệch trung bình hai tuần đầu chia m, mùa = độ lệch so với mức
function initialStates(y, m = M) {
  const level = mean(y.slice(0, m));
  return { level, trend: (mean(y.slice(m, 2 * m)) - level) / m, seasonal: y.slice(0, m).map((v) => v - level) };
}

// Chạy phương trình trên chuỗi: giá trị khớp một bước (ŷt|t−1) và trạng thái cuối
function run(y, { alpha, beta, gamma, phi = 1 }, init = initialStates(y), m = M) {
  let level = init.level;
  let trend = init.trend;
  const season = [...init.seasonal];
  const fitted = [];
  for (let t = 0; t < y.length; t++) {
    const s = season[t % m];
    const base = level + phi * trend; // ℓt−1 + φ bt−1
    fitted.push(base + s);
    const newLevel = alpha * (y[t] - s) + (1 - alpha) * base;
    trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
    season[t % m] = gamma * (y[t] - base) + (1 - gamma) * s;
    level = newLevel;
  }
  return { fitted, state: { level, trend, season, n: y.length } };
}

// Dự báo h bước từ trạng thái cuối
function project(state, { phi = 1 }, h, m = M) {
  const out = [];
  let damp = 0;
  for (let i = 1; i <= h; i++) {
    damp += phi ** i;
    out.push(state.level + damp * state.trend + state.season[(state.n + i - 1) % m]);
  }
  return out;
}

const sse = (y, fitted, from) => {
  let s = 0;
  for (let t = from; t < y.length; t++) s += (y[t] - fitted[t]) ** 2;
  return s;
};

// Ước lượng tham số bằng lưới, cực tiểu tổng bình phương sai số dự báo một bước (bỏ hai tuần dùng để khởi tạo).
// Giới hạn như [1] mục 8.4 cho dạng sai số: 0 < β < α, 0 < γ < 1 − α.
const GRID = (from, to, step) => Array.from({ length: Math.round((to - from) / step) + 1 }, (_, i) => Math.round((from + i * step) * 1000) / 1000);
function fit(y, { damped = false } = {}, m = M) {
  const init = initialStates(y, m);
  let best = null;
  for (const alpha of GRID(0.05, 0.95, 0.05)) {
    for (const beta of [0.001, 0.01, 0.05, 0.1, 0.2, 0.3].filter((b) => b < alpha)) {
      for (const gamma of GRID(0.05, 0.6, 0.05).filter((g) => g < 1 - alpha)) {
        for (const phi of damped ? [0.8, 0.85, 0.9, 0.95, 0.98] : [1]) {
          const params = { alpha, beta, gamma, phi };
          const { fitted } = run(y, params, init, m);
          const err = sse(y, fitted, 2 * m);
          if (!best || err < best.sse) best = { params, sse: err };
        }
      }
    }
  }
  const { fitted, state } = run(y, best.params, init, m);
  const residuals = y.map((v, t) => v - fitted[t]).slice(2 * m);
  return { params: best.params, init, fitted, state, residuals, sigma: Math.sqrt(mean(residuals.map((r) => r * r))) };
}

// Naive theo mùa: ngày dự báo bằng cùng thứ của tuần trước ([1] mục 5.2), dùng làm mốc so sánh
const seasonalNaive = (y, h, m = M) => Array.from({ length: h }, (_, i) => y[y.length - m + (i % m)]);

// Độ chính xác ([1] mục 5.8, [4]). MASE chia cho sai số trung bình của naive theo mùa trên tập huấn luyện.
function accuracy(actual, forecast, train, m = M) {
  const errors = actual.map((v, i) => v - forecast[i]);
  const scale = mean(train.slice(m).map((v, i) => Math.abs(v - train[i])));
  const nonzero = actual.map((v, i) => [v, errors[i]]).filter(([v]) => v !== 0);
  return {
    mae: mean(errors.map(Math.abs)),
    rmse: Math.sqrt(mean(errors.map((e) => e * e))),
    mape: nonzero.length ? (100 * mean(nonzero.map(([v, e]) => Math.abs(e / v)))) : null,
    mase: scale > 0 ? mean(errors.map(Math.abs)) / scale : null,
  };
}

// Bộ sinh số ngẫu nhiên có hạt giống để khoảng dự báo lặp lại được giữa các lần gọi
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Khoảng dự báo bằng bootstrap phần dư ([1] mục 5.5): mô phỏng nhiều đường tương lai, mỗi bước cộng một phần dư
// lấy ngẫu nhiên rồi cập nhật trạng thái theo đúng phương trình, lấy phân vị của từng ngày.
function bootstrapIntervals(model, h, { paths = 1000, levels = [80, 95], seed = 20261112 } = {}, m = M) {
  const random = rng(seed);
  const { alpha, beta, gamma, phi } = model.params;
  const sims = Array.from({ length: h }, () => []);
  for (let p = 0; p < paths; p++) {
    let { level, trend } = model.state;
    const season = [...model.state.season];
    for (let i = 0; i < h; i++) {
      const idx = (model.state.n + i) % m;
      const s = season[idx];
      const base = level + phi * trend;
      const y = base + s + model.residuals[Math.floor(random() * model.residuals.length)];
      sims[i].push(y);
      const newLevel = alpha * (y - s) + (1 - alpha) * base;
      trend = beta * (newLevel - level) + (1 - beta) * phi * trend;
      season[idx] = gamma * (y - base) + (1 - gamma) * s;
      level = newLevel;
    }
  }
  const quantile = (sorted, q) => {
    const pos = (sorted.length - 1) * q;
    const lo = Math.floor(pos);
    return sorted[lo] + (sorted[Math.min(lo + 1, sorted.length - 1)] - sorted[lo]) * (pos - lo);
  };
  return sims.map((day) => {
    const sorted = [...day].sort((a, b) => a - b);
    return Object.fromEntries(levels.map((l) => [l, [quantile(sorted, (1 - l / 100) / 2), quantile(sorted, 1 - (1 - l / 100) / 2)]]));
  });
}

// Chọn mô hình: chia chuỗi thành tập huấn luyện và tập kiểm tra (các ngày cuối), so ba mô hình trên tập kiểm tra
// bằng MASE, chọn mô hình sai số nhỏ nhất rồi khớp lại trên toàn bộ chuỗi để dự báo.
const MODELS = {
  HW: { label: 'Holt-Winters cộng tính', damped: false },
  HW_DAMPED: { label: 'Holt-Winters xu hướng giảm dần', damped: true },
  SNAIVE: { label: 'Naive theo mùa (mốc so sánh)' },
};

function forecastSeries(y, h, m = M) {
  if (y.length < 4 * m) return { ok: false, reason: `Cần ít nhất ${4 * m} ngày có dữ liệu, hiện có ${y.length} ngày` };
  const test = y.length >= 12 * m ? 4 * m : 2 * m;
  const train = y.slice(0, y.length - test);
  const actual = y.slice(y.length - test);
  const evaluation = {};
  for (const [key, def] of Object.entries(MODELS)) {
    const pred = key === 'SNAIVE' ? seasonalNaive(train, test, m) : (() => { const f = fit(train, def, m); return project(f.state, f.params, test, m); })();
    evaluation[key] = { label: def.label, ...accuracy(actual, pred, train, m), testForecast: pred };
  }
  const chosen = Object.keys(evaluation).reduce((a, b) => ((evaluation[b].mase ?? Infinity) < (evaluation[a].mase ?? Infinity) ? b : a));
  const hwKey = chosen === 'SNAIVE' ? 'HW' : chosen; // khoảng dự báo, thành phần mùa vẫn lấy từ Holt-Winters
  const model = fit(y, MODELS[hwKey], m);
  const point = chosen === 'SNAIVE' ? seasonalNaive(y, h, m) : project(model.state, model.params, h, m);
  const intervals = bootstrapIntervals(model, h, {}, m);
  return {
    ok: true, chosen, chosenLabel: MODELS[chosen].label, params: model.params, sigma: model.sigma,
    test: { days: test, actual }, evaluation,
    forecast: point.map((v, i) => ({ value: v, lo80: intervals[i][80][0], hi80: intervals[i][80][1], lo95: intervals[i][95][0], hi95: intervals[i][95][1] })),
    weekly: model.state.season.map((s, i) => ({ offset: i, effect: s })), // ảnh hưởng của từng thứ trong tuần
    fitted: model.fitted,
  };
}

module.exports = { M, initialStates, run, project, fit, seasonalNaive, accuracy, bootstrapIntervals, forecastSeries, rng };
