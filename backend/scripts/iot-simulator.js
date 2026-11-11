// Giả lập thiết bị IoT đặt tại sân (thay cho ESP32 + cảm biến BH1750 + camera đếm hoạt động).
// Mỗi 2 giây gửi số đo của từng sân lên API như thiết bị thật, dùng khóa thiết bị chứ không dùng tài khoản.
// Ánh sáng giả lập một buổi chiều tà rút gọn: cứ 1 phút thật là 1 giờ, từ 16:00 tới 20:00 rồi lặp lại.
// Chạy: IOT_DEVICE_KEY=... node scripts/iot-simulator.js http://localhost:3000/api 1,2,3
require('dotenv').config({ quiet: true });

const BASE = process.argv[2] || 'http://localhost:3000/api';
const COURTS = (process.argv[3] || '1,2,3').split(',').map(Number);
const KEY = process.env.IOT_DEVICE_KEY;
const PERIOD_MS = 2000;
const MINUTES_PER_TICK = 2; // 2 giây thật = 2 phút giả lập
if (!KEY) throw new Error('Cần đặt IOT_DEVICE_KEY giống server');

// Lux ngoài trời theo giờ: sáng rõ tới 17:00, tối dần, sau 19:00 gần như tối hẳn
function luxAt(minute) {
  const start = 16 * 60;
  const t = (minute - start) / 180; // 0 lúc 16:00, 1 lúc 19:00
  const lux = 850 * (1 - Math.min(1, Math.max(0, t))) ** 1.6;
  return Math.max(0, Math.round(lux + (Math.random() - 0.5) * 30));
}

// Mỗi sân chuyển qua lại giữa trống, nghỉ, thi đấu như chuỗi Markov đơn giản
const MODES = { TRONG: [0, 0.8], NGHI: [1.8, 3.2], THI_DAU: [5.5, 9.5] };
const NEXT = { TRONG: ['TRONG', 'TRONG', 'TRONG', 'THI_DAU'], NGHI: ['NGHI', 'THI_DAU', 'THI_DAU', 'TRONG'], THI_DAU: ['THI_DAU', 'THI_DAU', 'THI_DAU', 'NGHI'] };
const courts = Object.fromEntries(COURTS.map((id) => [id, { mode: 'TRONG' }]));
const activityOf = (mode) => { const [lo, hi] = MODES[mode]; return Math.round((lo + Math.random() * (hi - lo)) * 10) / 10; };

let minute = 16 * 60;
async function tick() {
  const clock = `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const lux = luxAt(minute);
  const parts = [];
  for (const id of COURTS) {
    const c = courts[id];
    if (Math.random() < 0.15) c.mode = NEXT[c.mode][Math.floor(Math.random() * 4)];
    const activity = activityOf(c.mode);
    try {
      const res = await fetch(`${BASE}/lighting/readings`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Device-Key': KEY }, body: JSON.stringify({ courtId: id, lux, activity }) });
      const data = await res.json();
      parts.push(res.ok ? `Sân #${id} ${c.mode.padEnd(7)} hđ ${String(activity).padStart(4)} → đèn ${String(data.court.level).padStart(3)}%${data.court.warning ? ' CẢNH BÁO' : ''}` : `Sân #${id} lỗi ${data.error?.message}`);
    } catch (err) {
      parts.push(`Sân #${id} không gửi được: ${err.message}`);
    }
  }
  console.log(`[giả lập ${clock}] lux ${String(lux).padStart(3)} | ${parts.join(' | ')}`);
  minute = minute >= 20 * 60 ? 16 * 60 : minute + MINUTES_PER_TICK;
}

console.log(`Giả lập thiết bị IoT cho sân ${COURTS.join(', ')}, gửi tới ${BASE}. Bấm Ctrl+C để dừng.`);
tick();
setInterval(tick, PERIOD_MS);
