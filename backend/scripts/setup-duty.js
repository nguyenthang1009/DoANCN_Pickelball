// Cho lễ tân và quản lý Quận 7 vào ca trước khi chạy bộ Postman pickleball-booking-pos.
// Đặt sân tại quầy, bán dịch vụ, check-in chỉ làm được khi đang trong ca được phân công.
//   node scripts/setup-duty.js http://localhost:3000/api
const { putOnDuty } = require('./lib/duty');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const login = async (identifier) => (await (await fetch(`${BASE}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier, password: '12345678' }) })).json()).token;

(async () => {
  const [admin, manager, staff] = await Promise.all(['admin@pickleball.vn', 'manager.q7@pickleball.vn', 'staff.q7@pickleball.vn'].map(login));
  await putOnDuty(BASE, { assignerToken: manager, userId: 3, userToken: staff });
  await putOnDuty(BASE, { assignerToken: admin, userId: 2, userToken: manager, venueId: 1 });
  console.log('Lễ tân và quản lý Quận 7 đã vào ca');
})().catch((e) => { console.error(e.message); process.exit(1); });
