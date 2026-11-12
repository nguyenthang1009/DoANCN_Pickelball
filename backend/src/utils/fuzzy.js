// Bộ điều khiển mờ Mamdani điều chỉnh độ sáng đèn sân.
// Hai biến mờ: ánh sáng môi trường (lux) và mức hoạt động trên sân (0-10).
// Trạng thái đặt sân là giá trị rõ, dùng để chọn bộ luật; không mờ hóa.
// Toán tử: AND = min, suy diễn = min (cắt ngọn), gộp = max, giải mờ = trọng tâm.

// Hàm thuộc hình thang (a, b, c, d); tam giác là hình thang có b = c
function trap(a, b, c, d) {
  return (x) => {
    if (x < a || x > d) return 0;
    if (x >= b && x <= c) return 1;
    if (x < b) return (x - a) / (b - a);
    return (d - x) / (d - c);
  };
}
const tri = (a, b, c) => trap(a, b, b, c);

// Định nghĩa các tập mờ: điểm hình thang dùng cho cả tính toán và vẽ biểu đồ
const VARIABLES = {
  lux: {
    label: 'Ánh sáng môi trường', unit: 'lux', min: 0, max: 1000,
    sets: {
      TOI: { label: 'Tối', points: [0, 0, 50, 150] },
      CHANG_VANG: { label: 'Chạng vạng', points: [100, 250, 250, 400] },
      SANG: { label: 'Sáng', points: [350, 500, 1000, 1000] },
    },
  },
  activity: {
    label: 'Mức hoạt động trên sân', unit: '', min: 0, max: 10,
    sets: {
      TRONG: { label: 'Trống', points: [0, 0, 0.5, 1.5] },
      NGHI: { label: 'Chờ / nghỉ', points: [0.5, 1.5, 3, 4.5] },
      THI_DAU: { label: 'Thi đấu', points: [3.5, 5, 10, 10] },
    },
  },
  level: {
    label: 'Độ sáng đèn', unit: '%', min: 0, max: 100,
    sets: {
      TAT: { label: 'Tắt', points: [0, 0, 0, 10] },
      CANH_BAO: { label: 'Cảnh báo', points: [5, 15, 15, 25] },
      THAP: { label: 'Dẫn đường', points: [10, 25, 25, 40] },
      VUA: { label: 'Duy trì', points: [35, 50, 50, 65] },
      KHA: { label: 'Bù sáng', points: [45, 60, 60, 75] },
      TOI_DA: { label: 'Tối đa', points: [80, 95, 100, 100] },
    },
  },
};

const MF = Object.fromEntries(Object.entries(VARIABLES).map(([name, v]) => [
  name, Object.fromEntries(Object.entries(v.sets).map(([key, s]) => [key, s.points[1] === s.points[2] && s.points[0] !== s.points[1] ? tri(s.points[0], s.points[1], s.points[3]) : trap(...s.points)])),
]));

// Bộ luật theo trạng thái đặt sân. '*' nghĩa là không xét biến đó.
const RULES = {
  // Đang trong giờ của một đơn đã thanh toán
  ACTIVE: [
    { lux: 'TOI', activity: 'TRONG', level: 'THAP', note: 'Khách chưa tới, bật dẫn đường' },
    { lux: 'TOI', activity: 'NGHI', level: 'VUA', note: 'Khách nghỉ giữa hiệp, giảm sáng' },
    { lux: 'TOI', activity: 'THI_DAU', level: 'TOI_DA', note: 'Đang thi đấu, đủ sáng chuẩn' },
    { lux: 'CHANG_VANG', activity: 'TRONG', level: 'THAP', note: 'Chạng vạng, khách chưa tới' },
    { lux: 'CHANG_VANG', activity: 'NGHI', level: 'THAP', note: 'Chạng vạng, đang nghỉ' },
    { lux: 'CHANG_VANG', activity: 'THI_DAU', level: 'KHA', note: 'Trời còn sáng nhẹ, chỉ bù thêm' },
    { lux: 'SANG', activity: '*', level: 'TAT', note: 'Đủ sáng tự nhiên' },
  ],
  // Trong cửa sổ check-in trước giờ chơi: bật dẫn đường đón khách
  PREPARING: [
    { lux: 'TOI', activity: '*', level: 'THAP', note: 'Sắp tới giờ, đón khách' },
    { lux: 'CHANG_VANG', activity: '*', level: 'THAP', note: 'Sắp tới giờ, đón khách' },
    { lux: 'SANG', activity: '*', level: 'TAT', note: 'Đủ sáng tự nhiên' },
  ],
  // Không có đơn: tắt đèn; có người trên sân thì để sáng mờ và báo lễ tân
  IDLE: [
    { lux: '*', activity: 'TRONG', level: 'TAT', note: 'Sân trống, không có đơn' },
    { lux: 'TOI', activity: 'NGHI', level: 'CANH_BAO', note: 'Có người khi chưa đặt sân' },
    { lux: 'TOI', activity: 'THI_DAU', level: 'CANH_BAO', note: 'Có người khi chưa đặt sân' },
    { lux: 'CHANG_VANG', activity: 'NGHI', level: 'CANH_BAO', note: 'Có người khi chưa đặt sân' },
    { lux: 'CHANG_VANG', activity: 'THI_DAU', level: 'CANH_BAO', note: 'Có người khi chưa đặt sân' },
    { lux: 'SANG', activity: 'NGHI', level: 'TAT', note: 'Có người, trời đủ sáng' },
    { lux: 'SANG', activity: 'THI_DAU', level: 'TAT', note: 'Có người, trời đủ sáng' },
  ],
};

const OFF_THRESHOLD = 5; // Dưới 5% coi như tắt: đèn không giữ được độ sáng quá thấp
const STEP = 0.25; // Bước lấy mẫu trục độ sáng khi giải mờ

const clamp = (x, min, max) => Math.min(max, Math.max(min, x));
const memberships = (name, x) => Object.fromEntries(Object.entries(MF[name]).map(([key, f]) => [key, f(x)]));

// Suy luận cho một sân. Trả về độ sáng cuối cùng và đủ dữ liệu để giải thích từng bước.
function infer(state, rawLux, rawActivity) {
  const lux = clamp(rawLux, 0, 1000);
  const activity = clamp(rawActivity, 0, 10);
  const mu = { lux: memberships('lux', lux), activity: memberships('activity', activity) };
  const degree = (name, key) => (key === '*' ? 1 : mu[name][key]);

  const fired = (RULES[state] || []).map((r) => ({ ...r, strength: Math.min(degree('lux', r.lux), degree('activity', r.activity)) }));
  // Mỗi tập đầu ra lấy luật mạnh nhất (gộp max)
  const clip = {};
  for (const r of fired) clip[r.level] = Math.max(clip[r.level] ?? 0, r.strength);

  const curve = [];
  for (let y = 0; y <= 100 + 1e-9; y += STEP) {
    let m = 0;
    for (const [key, h] of Object.entries(clip)) m = Math.max(m, Math.min(h, MF.level[key](y)));
    curve.push([y, m]);
  }
  // Trọng tâm: coi đường gộp là tuyến tính giữa hai điểm mẫu, mỗi đoạn là một hình thang tính chính xác
  let area = 0;
  let moment = 0;
  for (let i = 1; i < curve.length; i++) {
    const [y1, m1] = curve[i - 1];
    const [y2, m2] = curve[i];
    const a = ((m1 + m2) / 2) * (y2 - y1);
    if (a > 0) {
      area += a;
      moment += a * (y1 + ((y2 - y1) * (m1 + 2 * m2)) / (3 * (m1 + m2)));
    }
  }
  const centroid = area > 0 ? moment / area : 0;
  const level = centroid < OFF_THRESHOLD ? 0 : Math.round(centroid);
  // Cảnh báo là đầu ra rõ: không có đơn mà mức hoạt động không còn thuộc về "Trống"
  const warning = state === 'IDLE' && mu.activity.TRONG < 0.5;
  return { state, lux, activity, memberships: mu, fired: fired.filter((r) => r.strength > 0), centroid, level, warning, curve };
}

module.exports = { VARIABLES, RULES, OFF_THRESHOLD, infer, trap };
