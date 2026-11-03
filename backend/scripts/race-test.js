// Kịch bản tranh chấp (Tuần 7): nhiều khách cùng giữ một khung giờ trong cùng một khoảnh khắc.
// Chạy khi server đang chạy:  node scripts/race-test.js [baseUrl] [sốKhách]
// Kỳ vọng: mỗi vòng chỉ đúng 1 yêu cầu thành công (201), còn lại nhận 409 SLOT_TAKEN.

const BASE = process.argv[2] || 'http://localhost:3000/api';
const N = Number(process.argv[3]) || 10;

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

const tomorrow = () => new Date(Date.now() + 7 * 3600e3 + 86400e3).toISOString().slice(0, 10);

async function registerCustomers(n) {
  const stamp = String(Date.now()).slice(-6);
  return Promise.all(Array.from({ length: n }, async (_, i) => {
    const phone = `03${stamp}${String(i).padStart(2, '0')}`;
    const { status, data } = await call('/auth/register', { method: 'POST', body: { fullName: `Khách tranh chấp ${i + 1}`, email: `race${stamp}${i}@test.vn`, phone, password: 'matkhau123' } });
    if (status !== 201) throw new Error(`Không tạo được khách ${i}: ${JSON.stringify(data)}`);
    return data.token;
  }));
}

async function round(title, tokens, makeBody) {
  const results = await Promise.all(tokens.map((token, i) => call('/bookings', { method: 'POST', token, body: makeBody(i) })));
  const ok = results.filter((r) => r.status === 201);
  const taken = results.filter((r) => r.status === 409 && r.data?.error?.code === 'SLOT_TAKEN');
  const other = results.filter((r) => r.status !== 201 && !(r.status === 409 && r.data?.error?.code === 'SLOT_TAKEN'));
  const pass = ok.length === 1 && taken.length === tokens.length - 1;
  console.log(`${pass ? 'ĐẠT ' : 'LỖI '} ${title}: ${ok.length} thành công, ${taken.length} bị chặn SLOT_TAKEN, ${other.length} lỗi khác`);
  if (ok[0]) console.log(`      Đơn thắng: ${ok[0].data.booking.bookingCode} ${ok[0].data.booking.courtName} ${ok[0].data.booking.startTime}–${ok[0].data.booking.endTime}`);
  for (const o of other) console.log('      Lỗi khác:', o.status, JSON.stringify(o.data));
  return pass;
}

// Tìm khung còn trống gồm `count` ô liền nhau trên một sân, để chạy lại script nhiều lần không bị ô cũ chặn
async function findFree(courtId, date, count) {
  const { data } = await call(`/venues/1/availability?date=${date}`);
  const slots = data.courts.find((c) => c.id === courtId).slots;
  for (let i = 0; i + count <= slots.length; i++) {
    if (slots.slice(i, i + count).every((s) => s.state === 'FREE')) return { start: slots[i].start, slots };
  }
  throw new Error(`Sân ${courtId} ngày ${date} không còn ${count} ô trống liền nhau`);
}
const plus30 = (t) => { const m = Number(t.slice(0, 2)) * 60 + Number(t.slice(3)) + 30; return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };

(async () => {
  const date = tomorrow();
  console.log(`Tạo ${N} khách hàng thử, đặt ngày ${date} tại Sân 01 và Sân 03 (cơ sở Quận 7)`);
  const tokens = await registerCustomers(N);

  const a = (await findFree(1, date, 2)).start;
  const aEnd = plus30(plus30(a));
  const r1 = await round(`${N} khách cùng giữ Sân 01 ${a}–${aEnd}`, tokens,
    () => ({ courtId: 1, date, start: a, end: aEnd }));

  // Hai khung lệch nhau 30 phút: [t, t+60) và [t+30, t+90) chồng lấn ở ô giữa
  const b = (await findFree(3, date, 3)).start;
  const b30 = plus30(b);
  const b60 = plus30(b30);
  const b90 = plus30(b60);
  const r2 = await round(`${N} khách giữ các khung chồng lấn trên Sân 03 (${b}–${b60} và ${b30}–${b90})`, tokens,
    (i) => (i % 2 ? { courtId: 3, date, start: b30, end: b90 } : { courtId: 3, date, start: b, end: b60 }));

  const { data } = await call(`/venues/1/availability?date=${date}`);
  const held = data.courts.filter((c) => [1, 3].includes(c.id)).flatMap((c) => c.slots.filter((s) => s.state === 'HELD').map((s) => `${c.name} ${s.start}`));
  console.log(`Ô đang giữ sau tranh chấp: ${held.join(', ')}`);
  process.exit(r1 && r2 ? 0 : 1);
})().catch((err) => { console.error(err); process.exit(1); });
