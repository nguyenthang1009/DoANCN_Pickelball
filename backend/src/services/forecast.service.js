const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { nowInVietnam } = require('../utils/time');
const { forecastSeries, rng, M } = require('../utils/forecast');

const DAY = 86400000;
const addDays = (date, n) => new Date(Date.parse(`${date}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10);
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];

// Doanh thu ròng theo ngày đọc từ sổ cái (5111 dịch vụ, 5113 cho thuê sân, đã trừ hóa đơn điều chỉnh giảm, chưa gồm VAT).
// Chuỗi chạy từ ngày đầu có phát sinh tới hôm qua; ngày không có phát sinh là 0 (cơ sở đóng cửa vẫn là dữ liệu thật).
async function dailyRevenue(venueId) {
  const yesterday = addDays(nowInVietnam().date, -1);
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS day, SUM(l.credit - l.debit) AS revenue
       FROM gl_entries e JOIN gl_lines l ON l.entry_id = e.id
      WHERE l.account_code IN ('5111', '5113') AND e.entry_date <= ? ${venueId ? 'AND e.venue_id = ?' : ''}
      GROUP BY e.entry_date ORDER BY e.entry_date`,
    [yesterday, ...(venueId ? [venueId] : [])],
  );
  if (!rows.length) return [];
  const byDay = new Map(rows.map((r) => [r.day, Number(r.revenue)]));
  const series = [];
  for (let d = rows[0].day; d <= yesterday; d = addDays(d, 1)) series.push({ date: d, value: byDay.get(d) ?? 0 });
  return series;
}

// Chuỗi mô phỏng để trình diễn khi CSDL chưa đủ lịch sử: 26 tuần, xu hướng tăng nhẹ, cuối tuần đông hơn, có nhiễu.
// Có hạt giống cố định nên lần nào cũng ra cùng một chuỗi. Giao diện luôn ghi rõ đây là dữ liệu mô phỏng.
function demoSeries() {
  const random = rng(2026);
  const end = addDays(nowInVietnam().date, -1);
  const start = addDays(end, -181);
  const factor = [1.45, 0.85, 0.82, 0.88, 0.95, 1.1, 1.5]; // CN, T2, ..., T7
  return Array.from({ length: 182 }, (_, t) => {
    const date = addDays(start, t);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const value = (3800000 + t * 9000) * factor[weekday] * (1 + (random() - 0.5) * 0.18);
    return { date, value: Math.round(value / 1000) * 1000 };
  });
}

const round = (v) => Math.round(v);
const sum = (a) => a.reduce((s, v) => s + v, 0);

async function forecast(user, { venueId, horizon, demo } = {}) {
  const h = Number(horizon ?? 30);
  if (!Number.isInteger(h) || h < 7 || h > 90) throw new HttpError(400, 'VALIDATION_ERROR', 'Số ngày dự báo từ 7 đến 90');
  const scope = user.role === 'ADMIN' && venueId ? Number(venueId) : null;
  const isDemo = demo === '1' || demo === true;
  const series = isDemo ? demoSeries() : await dailyRevenue(scope);
  const base = { source: isDemo ? 'DEMO' : 'LEDGER', venueId: scope, horizon: h, days: series.length };
  const result = forecastSeries(series.map((d) => d.value), h);
  if (!result.ok) return { ...base, ok: false, reason: result.reason, history: series };

  const last = series[series.length - 1].date;
  const testStart = series.length - result.test.days;
  const chosenTest = result.evaluation[result.chosen].testForecast;
  const firstWeekday = new Date(`${series[0].date}T00:00:00Z`).getUTCDay();
  const next30 = sum(result.forecast.slice(0, 30).map((p) => p.value));
  const last30 = sum(series.slice(-30).map((d) => d.value));
  const prev30 = series.length >= 60 ? sum(series.slice(-60, -30).map((d) => d.value)) : null;
  return {
    ...base,
    ok: true,
    model: { key: result.chosen, label: result.chosenLabel, params: result.params, sigma: round(result.sigma) },
    evaluation: Object.fromEntries(Object.entries(result.evaluation).map(([k, v]) => [k, { label: v.label, mae: round(v.mae), rmse: round(v.rmse), mape: v.mape === null ? null : Math.round(v.mape * 100) / 100, mase: v.mase === null ? null : Math.round(v.mase * 1000) / 1000 }])),
    history: series.slice(-120),
    test: series.slice(testStart).map((d, i) => ({ date: d.date, actual: d.value, forecast: round(chosenTest[i]) })),
    forecast: result.forecast.map((p, i) => ({ date: addDays(last, i + 1), value: round(p.value), lo80: round(p.lo80), hi80: round(p.hi80), lo95: round(p.lo95), hi95: round(p.hi95) })),
    weekly: result.weekly.map((w) => ({ weekday: (firstWeekday + w.offset) % M, label: WEEKDAYS[(firstWeekday + w.offset) % M], effect: round(w.effect) })).sort((a, b) => ((a.weekday + 6) % 7) - ((b.weekday + 6) % 7)),
    summary: {
      next30: round(next30), last30: round(last30), growthPct: last30 ? Math.round(((next30 - last30) / last30) * 1000) / 10 : null,
      prev30: prev30 === null ? null : round(prev30), recentGrowthPct: prev30 ? Math.round(((last30 - prev30) / prev30) * 1000) / 10 : null,
      next30Lo80: round(sum(result.forecast.slice(0, 30).map((p) => p.lo80))), next30Hi80: round(sum(result.forecast.slice(0, 30).map((p) => p.hi80))),
    },
  };
}

module.exports = { forecast, dailyRevenue, demoSeries };
