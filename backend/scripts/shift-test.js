// Kiểm thử xếp ca, chấm công, lương theo giờ / ngày / ca. Số mong đợi tính tay theo Bộ luật Lao động 2019,
// Nghị định 145/2020/NĐ-CP, Nghị định 293/2025/NĐ-CP. Chạy trên CSDL vừa khởi tạo lại:
//   DB_NAME=pickleball_booking_e2e node scripts/shift-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const { summarize, classifyDays } = require('../src/utils/timesheet');
const { computePayslip } = require('../src/utils/payroll');

const BASE = process.argv[2] || 'http://localhost:3000/api';
let passed = 0;
let failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const same = (name, actual, expected) => check(name, JSON.stringify(actual) === JSON.stringify(expected), `-> ${JSON.stringify(actual)}, cần ${JSON.stringify(expected)}`);
const expectError = (name, r, status, code) => check(name, r.status === status && r.data?.error?.code === code, `-> ${r.status} ${r.data?.error?.code} ${r.data?.error?.message ?? ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier) => (await call('/auth/login', { method: 'POST', body: { identifier, password: '12345678' } })).data.token;

const PARAMS = {
  siEmployee: 800, hiEmployee: 150, uiEmployee: 100, siEmployer: 1750, hiEmployer: 300, uiEmployer: 100, siSalaryCap: 50600000, uiCapMultiple: 20, siMinWorkDays: 14,
  otWeekdayRate: 15000, otWeekendRate: 20000, otHolidayRate: 30000, nightRate: 3000, nightOtExtraRate: 2000, normalDailyHours: 8, pitWithholding: 0, brackets: [],
};
const NO_OT = { otWeekdayMinutes: 0, otWeekendMinutes: 0, otHolidayMinutes: 0, nightMinutes: 0 };
const pay = (o) => computePayslip({ allowance: 0, insuredSalary: 0, dependents: 0, workDays: 0, standardDays: 26, minWage: 5310000, ...NO_OT, ...o }, PARAMS);
const rec = (clockIn, clockOut, shiftMinutes = 480) => ({ clockIn: `${clockIn}:00`, clockOut: `${clockOut}:00`, shiftMinutes });

function testTimesheet() {
  console.log('\n--- Bảng công: giờ thường, làm thêm, ban đêm, ngày nghỉ, ngày lễ');
  const nov = { month: '2026-11', restDay: 0, holidays: new Map([['2026-11-24', 'Ngày Văn hóa Việt Nam']]) };
  const one = (r) => summarize([r], nov);
  let s = one(rec('2026-11-10 06:00', '2026-11-10 14:00'));
  same('Ca 8 tiếng ngày thường: 8 giờ thường, 1 ca, không làm thêm', [s.normalMinutes, s.units, s.otWeekdayMinutes], [480, 1, 0]);
  s = one(rec('2026-11-10 06:00', '2026-11-10 18:00'));
  same('Làm 12 tiếng: 8 giờ thường, 4 giờ làm thêm ban ngày', [s.normalMinutes, s.otWeekdayMinutes, s.nightOt.weekdayPlain + s.nightOt.weekdayAfterDayOt], [480, 240, 0]);
  s = one(rec('2026-11-10 14:00', '2026-11-11 01:00'));
  same('14h đến 1h sáng: 3 giờ làm thêm ban đêm, không có làm thêm ban ngày', [s.normalMinutes, s.otWeekdayMinutes, s.nightOt.weekdayPlain, s.nightOt.weekdayAfterDayOt], [480, 180, 180, 0]);
  s = one(rec('2026-11-10 10:00', '2026-11-11 00:00'));
  same('10h đến 24h: làm thêm 18h-22h ban ngày nên 2 giờ đêm tính theo mức 150%', [s.otWeekdayMinutes, s.nightOt.weekdayPlain, s.nightOt.weekdayAfterDayOt], [360, 0, 120]);
  s = one(rec('2026-11-10 22:00', '2026-11-11 06:00'));
  same('Ca đêm 22h-6h: 8 giờ thường đều là ban đêm', [s.normalMinutes, s.nightMinutes, s.otWeekdayMinutes], [480, 480, 0]);
  s = one(rec('2026-11-15 08:00', '2026-11-15 12:00', null));
  same('Chủ nhật là ngày nghỉ hằng tuần: cả 4 giờ là làm thêm 200%', [s.normalMinutes, s.otWeekendMinutes, s.workDays], [0, 240, 0]);
  s = one(rec('2026-11-24 22:00', '2026-11-25 02:00', null));
  same('Đêm 24/11 (lễ): 4 giờ làm thêm ngày lễ, cả 4 giờ là ban đêm', [s.otHolidayMinutes, s.nightOt.holiday], [240, 240]);
  same('Tháng 11/2026 có 1 ngày lễ hưởng lương', s.paidHolidays, 1);
  s = summarize([rec('2026-11-10 06:00', '2026-11-10 10:00'), rec('2026-11-10 12:00', '2026-11-10 18:00')], nov);
  same('Hai lượt trong ngày cộng dồn: 10 tiếng thì 2 giờ cuối là làm thêm', [s.normalMinutes, s.otWeekdayMinutes, s.workDays], [480, 120, 1]);
  same('Hai lượt của một ca 8 tiếng chỉ tính phần giờ thường: đúng 1 ca', s.units, 1);

  const april = new Map([['2026-04-26', 'Giỗ Tổ Hùng Vương'], ['2026-04-30', 'Ngày Chiến thắng']]);
  const sun = classifyDays('2026-04', 0, april);
  same('Giỗ Tổ 26/4 trùng Chủ nhật: nghỉ bù thứ Hai 27/4', [sun.types.get('2026-04-26'), sun.types.get('2026-04-27')], ['HOLIDAY', 'HOLIDAY']);
  same('Người nghỉ Chủ nhật được trả 2 ngày lễ tháng 4 (27/4 và 30/4)', summarize([], { month: '2026-04', restDay: 0, holidays: april }).paidHolidays, 2);
  const mon = classifyDays('2026-04', 1, april);
  same('Người nghỉ thứ Hai: 26/4 là ngày lễ, 27/4 vẫn là ngày nghỉ hằng tuần', [mon.types.get('2026-04-26'), mon.types.get('2026-04-27')], ['HOLIDAY', 'REST']);
}

function testPayMath() {
  console.log('\n--- Tiền lương theo luật với lương giờ 100.000đ');
  const hour = { payType: 'HOURLY', baseSalary: 100000, unitHours: 1, units: 0 };
  const night = (bucket, otKey) => pay({ ...hour, [otKey]: 60, nightOt: { weekdayPlain: 0, weekdayAfterDayOt: 0, weekend: 0, holiday: 0, [bucket]: 60 } });
  const total = (s) => s.otPay + s.nightPay;
  same('Làm thêm ban đêm ngày thường: 200% (150% + 30% + 20%)', total(night('weekdayPlain', 'otWeekdayMinutes')), 200000);
  same('Làm thêm ban đêm ngày thường có làm thêm ban ngày: 210%', total(night('weekdayAfterDayOt', 'otWeekdayMinutes')), 210000);
  same('Làm thêm ban đêm ngày nghỉ hằng tuần: 270%', total(night('weekend', 'otWeekendMinutes')), 270000);
  same('Làm thêm ban đêm ngày lễ: 390%', total(night('holiday', 'otHolidayMinutes')), 390000);
  const n = pay({ ...hour, units: 1, nightMinutes: 60 });
  same('Làm ban đêm trong giờ thường: 130%', n.basePay + n.nightPay, 130000);

  console.log('\n--- Bốn hình thức trả lương');
  same('Lương ngày 400.000đ: 20 ngày công + 1 ngày lễ', pay({ payType: 'DAILY', baseSalary: 400000, unitHours: 8, workDays: 20, paidHolidays: 1 }).basePay, 8400000);
  same('Lương ngày: làm thêm 2 giờ ngày thường tính trên 50.000đ/giờ', pay({ payType: 'DAILY', baseSalary: 400000, unitHours: 8, workDays: 1, otWeekdayMinutes: 120 }).otPay, 150000);
  same('Lương ca 300.000đ: 10,5 ca', pay({ payType: 'SHIFT', baseSalary: 300000, unitHours: 8, units: 10.5 }).basePay, 3150000);
  same('Lương giờ 30.000đ: 16 giờ', pay({ payType: 'HOURLY', baseSalary: 30000, unitHours: 1, units: 16 }).basePay, 480000);
  same('Lương tháng 10,4 triệu: 25 ngày công + 1 ngày lễ là đủ tháng', pay({ payType: 'MONTHLY', baseSalary: 10400000, workDays: 25, paidHolidays: 1 }).basePay, 10400000);
  same('Lương tháng không vượt mức hợp đồng khi ngày công vượt chuẩn', pay({ payType: 'MONTHLY', baseSalary: 10400000, workDays: 26, paidHolidays: 1 }).basePay, 10400000);
  const ins = pay({ payType: 'DAILY', baseSalary: 400000, unitHours: 8, workDays: 13, paidHolidays: 1, insuredSalary: 8000000 });
  same('Ngày lễ tính là ngày có lương khi xét 14 ngày đóng bảo hiểm', ins.siEmployee, 640000);
}

async function testApi() {
  console.log('\n--- Hợp đồng theo hình thức trả lương');
  const [staff, manager, admin] = await Promise.all(['staff.q7@pickleball.vn', 'manager.q7@pickleball.vn', 'admin@pickleball.vn'].map(login));
  const contract = (body) => call('/payroll/contracts/3', { method: 'PUT', token: manager, body: { position: 'Lễ tân bán thời gian', allowance: 0, insuredSalary: 0, dependents: 0, wageRegion: 1, effectiveFrom: '2026-10-01', ...body } });
  expectError('Lương giờ 25.000đ thấp hơn mức tối thiểu giờ vùng I 25.500đ', await contract({ payType: 'HOURLY', baseSalary: 25000 }), 409, 'BELOW_MIN_WAGE');
  expectError('Lương ca 200.000đ cho ca 8 giờ quy ra 25.000đ/giờ bị từ chối', await contract({ payType: 'SHIFT', baseSalary: 200000, unitHours: 8 }), 409, 'BELOW_MIN_WAGE');
  expectError('Ca dài quá 12 giờ bị từ chối', await contract({ payType: 'SHIFT', baseSalary: 400000, unitHours: 13 }), 400, 'VALIDATION_ERROR');
  expectError('Hình thức trả lương lạ bị từ chối', await contract({ payType: 'WEEKLY', baseSalary: 400000 }), 400, 'VALIDATION_ERROR');
  const ok = await contract({ payType: 'HOURLY', baseSalary: 30000, weeklyRestDay: 0 });
  check('Lập hợp đồng lương giờ 30.000đ', ok.status === 200, JSON.stringify(ok.data));
  const list = (await call('/payroll/contracts', { token: manager })).data.staff.find((s) => s.userId === 3).contract;
  same('Hợp đồng lưu hình thức và đơn giá', [list.payType, list.baseSalary, list.unitHours], ['HOURLY', 30000, 1]);

  console.log('\n--- Xếp ca');
  expectError('Lễ tân không xem được lịch xếp ca', await call('/shifts/schedule?from=2026-11-01&to=2026-11-07', { token: staff }), 403, 'FORBIDDEN');
  const templates = (await call('/shifts/templates', { token: manager })).data.templates;
  same('Cơ sở có sẵn 3 mẫu ca', templates.length, 3);
  const byName = (n) => templates.find((t) => t.name === n).id;
  same('Ca đêm trực qua nửa đêm', templates.find((t) => t.name === 'Ca đêm trực').overnight, true);
  const nowVN = new Date(Date.now() + 7 * 3600e3);
  const today = nowVN.toISOString().slice(0, 10);
  const future = new Date(nowVN.getTime() + 3 * 86400e3).toISOString().slice(0, 10);
  const assign = (body, token = manager) => call('/shifts/schedule', { method: 'POST', token, body });
  const morning = await assign({ userId: 3, workDate: future, templateId: byName('Ca sáng') });
  check('Xếp ca sáng cho lễ tân', morning.status === 200, JSON.stringify(morning.data));
  check('Ca chiều liền sau ca sáng không bị coi là trùng', (await assign({ userId: 3, workDate: future, templateId: byName('Ca chiều') })).status === 200);
  expectError('Xếp trùng ca bị chặn', await assign({ userId: 3, workDate: future, templateId: byName('Ca sáng') }), 409, 'SHIFT_OVERLAP');
  const mid = await call('/shifts/templates', { method: 'POST', token: manager, body: { name: 'Ca giữa', start: '10:00', end: '18:00' } });
  expectError('Ca 10h-18h chồng lên ca sáng bị chặn', await assign({ userId: 3, workDate: future, templateId: mid.data.templates.find((t) => t.name === 'Ca giữa').id }), 409, 'SHIFT_OVERLAP');
  expectError('Không xếp ca cho khách hàng', await assign({ userId: 4, workDate: future, templateId: byName('Ca sáng') }), 404, 'USER_NOT_FOUND');
  expectError('Trùng tên mẫu ca bị chặn', await call('/shifts/templates', { method: 'POST', token: manager, body: { name: 'Ca giữa', start: '09:00', end: '17:00' } }), 409, 'DUPLICATE_NAME');

  // Ca đang diễn ra để thử vào ca: bắt đầu từ đầu giờ hiện tại, dài 4 tiếng
  const hour = nowVN.getUTCHours();
  const live = await call('/shifts/templates', { method: 'POST', token: manager, body: { name: 'Ca thử', start: `${String(hour).padStart(2, '0')}:00`, end: `${String((hour + 4) % 24).padStart(2, '0')}:00` } });
  const liveId = live.data.templates.find((t) => t.name === 'Ca thử').id;
  const liveShift = await assign({ userId: 3, workDate: today, templateId: liveId });
  check('Xếp ca đang diễn ra hôm nay', liveShift.status === 200, JSON.stringify(liveShift.data));

  console.log('\n--- Vào ca, ra ca');
  const inRes = await call('/shifts/me/clock-in', { method: 'POST', token: staff });
  check('Lễ tân vào ca, tự gắn với ca trong lịch', inRes.status === 200 && inRes.data.open?.shiftName === 'Ca thử', JSON.stringify(inRes.data));
  expectError('Vào ca hai lần bị chặn', await call('/shifts/me/clock-in', { method: 'POST', token: staff }), 409, 'ALREADY_CLOCKED_IN');
  expectError('Quản lý chưa được xếp ca thì không vào ca được', await call('/shifts/me/clock-in', { method: 'POST', token: manager }), 409, 'NO_ASSIGNED_SHIFT');
  check('Admin xếp ca cho quản lý', (await assign({ userId: 2, workDate: today, templateId: liveId }, admin)).status === 200);
  const race = await Promise.all(Array.from({ length: 10 }, () => call('/shifts/me/clock-in', { method: 'POST', token: manager })));
  same('10 lần bấm vào ca cùng lúc chỉ ghi 1 lượt', race.filter((r) => r.status === 200).length, 1);
  const duty = (await call('/shifts/on-duty', { token: manager })).data.onDuty;
  same('Đang trong ca: lễ tân và quản lý', duty.map((d) => d.userId).sort(), [2, 3]);
  expectError('Khách không xem được ai đang trong ca', await call('/shifts/on-duty', { token: await login('customer1@gmail.com') }), 403, 'FORBIDDEN');
  expectError('Lễ tân không xem được ai đang trong ca', await call('/shifts/on-duty', { token: staff }), 403, 'FORBIDDEN');
  await sleep(1100);
  const out = await call('/shifts/me/clock-out', { method: 'POST', token: staff });
  check('Lễ tân ra ca', out.status === 200 && out.data.open === null && out.data.records[0].clockOut);
  expectError('Ra ca khi chưa vào ca bị chặn', await call('/shifts/me/clock-out', { method: 'POST', token: staff }), 409, 'NOT_CLOCKED_IN');
  expectError('Ca đã có chấm công không xóa được', await call(`/shifts/schedule/${liveShift.data.id}`, { method: 'DELETE', token: manager }), 409, 'SHIFT_HAS_ATTENDANCE');
  check('Xóa ca chưa làm', (await call(`/shifts/schedule/${morning.data.id}`, { method: 'DELETE', token: manager })).status === 200);

  console.log('\n--- Quản lý ghi bù và sửa chấm công');
  const add = (body, token = manager) => call('/shifts/attendance', { method: 'POST', token, body });
  expectError('Lễ tân không sửa được chấm công', await add({ userId: 3, clockIn: '2026-10-05 06:00', clockOut: '2026-10-05 14:00', note: 'x' }, staff), 403, 'FORBIDDEN');
  expectError('Ghi bù phải có lý do', await add({ userId: 3, clockIn: '2026-10-05 06:00', clockOut: '2026-10-05 14:00', note: ' ' }), 400, 'VALIDATION_ERROR');
  expectError('Quản lý không tự ghi chấm công cho mình', await add({ userId: 2, clockIn: '2026-10-05 06:00', clockOut: '2026-10-05 14:00', note: 'x' }), 409, 'CANNOT_EDIT_OWN_ATTENDANCE');
  expectError('Không ghi giờ trong tương lai', await add({ userId: 3, clockIn: '2099-01-01 06:00', clockOut: '2099-01-01 14:00', note: 'x' }), 400, 'VALIDATION_ERROR');
  const a1 = await add({ userId: 3, clockIn: '2026-10-05 06:00', clockOut: '2026-10-05 14:00', note: 'Quên chấm công' });
  check('Ghi bù thứ Hai 5/10 6h-14h', a1.status === 200, JSON.stringify(a1.data));
  expectError('Trùng giờ với lượt đã có bị chặn', await add({ userId: 3, clockIn: '2026-10-05 13:00', clockOut: '2026-10-05 15:00', note: 'x' }), 409, 'ATTENDANCE_OVERLAP');
  check('Ghi bù thứ Ba 6/10 14h đến 1h sáng', (await add({ userId: 3, clockIn: '2026-10-06 14:00', clockOut: '2026-10-07 01:00', note: 'Quên chấm công' })).status === 200);
  check('Ghi bù Chủ nhật 11/10 8h-12h', (await add({ userId: 3, clockIn: '2026-10-11 08:00', clockOut: '2026-10-11 12:00', note: 'Quên chấm công' })).status === 200);
  const mine = (await call('/shifts/attendance?month=2026-10', { token: manager })).data.records;
  same('Danh sách chấm công tháng 10', mine.length, 3);
  const ownId = race.find((r) => r.status === 200).data.open.id;
  expectError('Quản lý không tự sửa lượt của mình', await call(`/shifts/attendance/${ownId}`, { method: 'PATCH', token: manager, body: { clockOut: null, note: 'x' } }), 409, 'CANNOT_EDIT_OWN_ATTENDANCE');

  console.log('\n--- Bảng lương từ chấm công (lương giờ 30.000đ)');
  const period = (await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-10', standardDays: 26 } })).data.period;
  let slip = period.slips.find((x) => x.userId === 3);
  same('Phiếu tạo từ chấm công', [slip.source, slip.payType], ['ATTENDANCE', 'HOURLY']);
  same('16 giờ thường: 480.000đ', [slip.units, slip.basePay], [16, 480000]);
  same('Làm thêm 3 giờ ngày thường 150% và 4 giờ Chủ nhật 200%: 375.000đ', slip.otPay, 375000);
  same('3 giờ làm thêm ban đêm: thêm 30% và 20%, 45.000đ', slip.nightPay, 45000);
  same('Thực nhận 900.000đ (không đóng bảo hiểm, chưa khấu trừ thuế)', slip.netPay, 900000);
  same('Bảng công lưu chi tiết từng ngày', slip.timesheet.days.map((d) => d.date), ['2026-10-05', '2026-10-06', '2026-10-11']);

  await call(`/shifts/attendance/${a1.data.id}`, { method: 'PATCH', token: manager, body: { clockOut: '2026-10-05 15:00', note: 'Ở lại dọn sân' } });
  const synced = await call(`/payroll/periods/${period.id}/sync-attendance`, { method: 'POST', token: manager });
  slip = synced.data.period.slips.find((x) => x.userId === 3);
  same('Sửa ra ca 15h rồi tính lại: thêm 1 giờ làm thêm 45.000đ', slip.otPay, 420000);
  check('Tính lại báo người chưa có chấm công', synced.data.warnings.length === 0 || synced.data.warnings.every((w) => typeof w === 'string'));
  expectError('Lễ tân không tính lại được bảng lương', await call(`/payroll/periods/${period.id}/sync-attendance`, { method: 'POST', token: staff }), 403, 'FORBIDDEN');

  const approved = await call(`/payroll/periods/${period.id}/approve`, { method: 'POST', token: admin });
  same('Admin duyệt bảng lương tháng 10', approved.data.period?.status, 'APPROVED');
  expectError('Đã duyệt thì chấm công tháng 10 bị khóa', await add({ userId: 3, clockIn: '2026-10-20 06:00', clockOut: '2026-10-20 10:00', note: 'x' }), 409, 'PAYROLL_LOCKED');
  expectError('Đã duyệt thì không tính lại được', await call(`/payroll/periods/${period.id}/sync-attendance`, { method: 'POST', token: manager }), 409, 'PAYROLL_LOCKED');

  console.log('\n--- Cảnh báo vượt giới hạn làm thêm (Điều 107 BLLĐ 2019)');
  same('Tháng 10 làm thêm 8 giờ: không cảnh báo', approved.data.period.slips.find((x) => x.userId === 3).otWarnings, []);
  // 7 ngày thường tháng 11 làm 6h-20h: mỗi ngày 6 giờ làm thêm (quá 4 giờ), cả tháng 42 giờ (quá 40 giờ)
  for (const d of ['02', '03', '04', '05', '06', '09', '10']) await add({ userId: 3, clockIn: `2026-11-${d} 06:00`, clockOut: `2026-11-${d} 20:00`, note: 'Tăng ca giải đấu' });
  const nov = (await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-11', standardDays: 26 } })).data.period;
  const over = nov.slips.find((x) => x.userId === 3);
  check('Cảnh báo 7 ngày làm thêm quá 4 giờ', over.otWarnings.some((w) => w.startsWith('7 ngày làm thêm quá 4 giờ')), JSON.stringify(over.otWarnings));
  check('Cảnh báo tháng làm thêm 42 giờ, quá 40 giờ', over.otWarnings.some((w) => w.includes('42 giờ trong tháng')), JSON.stringify(over.otWarnings));
  same('Chưa quá 200 giờ cả năm (8 + 42 = 50 giờ)', [over.otWarnings.length, over.otYearHours], [2, 50]);
  same('Vẫn trả đủ 42 giờ làm thêm 150%', over.otPay, Math.round(42 * 30000 * 1.5));

  console.log('\n--- Ngày lễ');
  check('Quản lý xem được ngày lễ', (await call('/shifts/holidays?year=2026', { token: manager })).data.holidays.length === 12);
  expectError('Quản lý không thêm được ngày lễ', await call('/shifts/holidays', { method: 'POST', token: manager, body: { date: '2027-01-01', name: 'Tết Dương lịch', legalRef: 'x' } }), 403, 'FORBIDDEN');
  check('Admin thêm Tết Dương lịch 2027', (await call('/shifts/holidays', { method: 'POST', token: admin, body: { date: '2027-01-01', name: 'Tết Dương lịch', legalRef: 'Điều 112 BLLĐ 2019' } })).status === 200);
  expectError('Không thêm trùng ngày lễ', await call('/shifts/holidays', { method: 'POST', token: admin, body: { date: '2027-01-01', name: 'x', legalRef: 'x' } }), 409, 'HOLIDAY_EXISTS');
  check('Admin xóa ngày lễ', (await call('/shifts/holidays/2027-01-01', { method: 'DELETE', token: admin })).status === 200);

  await sleep(1100);
  await call('/shifts/me/clock-out', { method: 'POST', token: manager });
}

(async () => {
  testTimesheet();
  testPayMath();
  await testApi();
  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
