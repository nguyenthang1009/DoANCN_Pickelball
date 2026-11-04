// Kiểm thử hóa đơn, VAT, sổ cái, tiền lương, nội dung website. Số kỳ vọng được tính tay, không lấy từ chính code.
// Chạy khi server đang chạy, trên CSDL vừa khởi tạo lại:
//   DB_NAME=pickleball_booking_e2e node scripts/finance-test.js http://localhost:3000/api
require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const mysql = require('mysql2/promise');
const { computePayslip, progressiveTax } = require('../src/utils/payroll');
const { splitVat } = require('../src/services/invoice.service');

const BASE = process.argv[2] || 'http://localhost:3000/api';
const ORIGIN = BASE.replace(/\/api$/, '');
const CHECKSUM = process.env.PAYOS_CHECKSUM_KEY || 'mock-checksum-key-chi-dung-khi-dev';
let passed = 0;
let failed = 0;

function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`ĐẠT  ${name}`); } else { failed++; console.log(`LỖI  ${name} ${detail}`); }
}
const same = (name, actual, expected) => check(name, actual === expected, `-> ${actual}, cần ${expected}`);
const code = (r) => r.data?.error?.code;
const expectError = (name, r, status, errorCode) => check(name, r.status === status && code(r) === errorCode, `-> ${r.status} ${code(r)}`);

async function call(path, { method = 'GET', body, token, raw, type } = {}) {
  const headers = { ...(raw ? { 'Content-Type': type } : { 'Content-Type': 'application/json' }), ...(token && { Authorization: `Bearer ${token}` }) };
  const res = await fetch(`${BASE}${path}`, { method, headers, body: raw ?? (body && JSON.stringify(body)) });
  return { status: res.status, data: await res.json().catch(() => null) };
}
const login = async (identifier) => (await call('/auth/login', { method: 'POST', body: { identifier, password: '12345678' } })).data.token;
const day = (n) => new Date(Date.now() + 7 * 3600e3 + n * 86400e3).toISOString().slice(0, 10);
const signData = (data) => crypto.createHmac('sha256', CHECKSUM).update(Object.keys(data).sort().map((k) => `${k}=${data[k] ?? ''}`).join('&')).digest('hex');

const PARAMS = {
  siEmployee: 800, hiEmployee: 150, uiEmployee: 100, siEmployer: 1750, hiEmployer: 300, uiEmployer: 100, siSalaryCap: 50600000, uiCapMultiple: 20, siMinWorkDays: 14,
  pitSelfDeduction: 15500000, pitDependentDeduction: 6200000, otWeekdayRate: 15000, otWeekendRate: 20000, otHolidayRate: 30000, nightRate: 3000,
  brackets: [{ upperLimit: 10000000, rateBp: 500 }, { upperLimit: 30000000, rateBp: 1000 }, { upperLimit: 60000000, rateBp: 2000 }, { upperLimit: 100000000, rateBp: 3000 }, { upperLimit: null, rateBp: 3500 }],
};
const slip = (o) => computePayslip({ allowance: 0, dependents: 0, workDays: 26, standardDays: 26, otWeekdayMinutes: 0, otWeekendMinutes: 0, otHolidayMinutes: 0, nightMinutes: 0, minWage: 5310000, ...o }, PARAMS);

function testPayrollMath() {
  console.log('\n--- Công thức tính lương (số tính tay)');
  same('Thuế 5 bậc với 120 triệu', progressiveTax(120000000, PARAMS.brackets), 500000 + 2000000 + 6000000 + 12000000 + 7000000);
  same('Thuế bậc 1 với 8 triệu', progressiveTax(8000000, PARAMS.brackets), 400000);
  same('Thu nhập 0 không có thuế', progressiveTax(0, PARAMS.brackets), 0);

  const a = slip({ baseSalary: 20000000, insuredSalary: 20000000, dependents: 1 });
  same('Lương 20 triệu, 1 người phụ thuộc: bảo hiểm 10,5%', a.siEmployee + a.hiEmployee + a.uiEmployee, 2100000);
  same('Thấp hơn mức giảm trừ thì không có thuế', a.pit, 0);
  same('Thực nhận 17,9 triệu', a.netPay, 17900000);

  const b = slip({ baseSalary: 40000000, insuredSalary: 40000000 });
  same('Lương 40 triệu: thu nhập tính thuế 20,3 triệu', b.assessableIncome, 20300000);
  same('Lương 40 triệu: thuế 1,53 triệu', b.pit, 1530000);
  same('Lương 40 triệu: thực nhận 34,27 triệu', b.netPay, 34270000);

  const c = slip({ baseSalary: 80000000, insuredSalary: 80000000 });
  same('Lương 80 triệu: BHXH chạm trần 50,6 triệu', c.siEmployee, 4048000);
  same('Lương 80 triệu: BHTN tính theo trần riêng', c.uiEmployee, 800000);
  same('Lương 80 triệu: thuế', c.pit, 8278600);
  same('Lương 80 triệu: thực nhận', c.netPay, 66114400);

  const d = slip({ baseSalary: 10400000, insuredSalary: 10400000, otWeekdayMinutes: 120, otWeekendMinutes: 60, otHolidayMinutes: 60, nightMinutes: 60 });
  same('Làm thêm: 2 giờ thường, 1 giờ nghỉ, 1 giờ lễ', d.otPay, 150000 + 100000 + 150000);
  same('Phần cao hơn giờ thường được miễn thuế', d.taxExemptOt, 200000);
  same('Phụ cấp đêm 30%', d.nightPay, 15000);

  const e = slip({ baseSalary: 10400000, insuredSalary: 10400000, workDays: 13 });
  same('Dưới 14 ngày công không đóng bảo hiểm', e.siEmployee + e.hiEmployee + e.uiEmployee + e.siEmployer, 0);
  same('Lương theo ngày công thực tế', e.basePay, 5200000);
  same('Doanh nghiệp đóng 21,5%', ((s) => s.siEmployer + s.hiEmployer + s.uiEmployer)(slip({ baseSalary: 20000000, insuredSalary: 20000000 })), 4300000);
}

async function testInvoices(db, tokens) {
  console.log('\n--- Hóa đơn và VAT');
  const { customer, staff, manager, admin } = tokens;
  const services = (await call('/venues/1/services', { token: staff })).data.services;
  const pos = await call('/bookings', { method: 'POST', token: staff, body: { courtId: 1, date: day(2), start: '08:00', end: '09:00', guestName: 'Khách quầy', guestPhone: '0912000111', paymentMethod: 'CASH', services: [{ serviceId: services[0].id, quantity: 2 }] } });
  const [[row]] = await db.query("SELECT invoice_no FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE b.booking_code = ?", [pos.data.booking.bookingCode]);
  check('Thu tiền mặt tại quầy tự có hóa đơn', Boolean(row?.invoice_no));
  const inv = (await call(`/invoices/${row.invoice_no}`, { token: staff })).data.invoice;
  same('Tổng hóa đơn đúng bằng tiền khách trả', inv.total, pos.data.booking.totalAmount);
  same('Hóa đơn gồm tiền sân và dịch vụ', inv.lines.length, 2);
  same('Tiền trước thuế + thuế = tổng', inv.subtotal + inv.vatAmount, inv.total);
  same('Cộng các dòng khớp đầu hóa đơn', inv.lines.reduce((s, l) => s + l.net + l.vat, 0), inv.total);
  same('Thuế suất đang áp dụng 8%', inv.vatRateBp, 800);
  same('Giá 120.000đ tách thuế 8%: 111.111đ + 8.889đ', Object.values(splitVat(120000, 800)).join(), '111111,8889');
  same('Giá 108.000đ tách thuế 8%: 100.000đ + 8.000đ', Object.values(splitVat(108000, 800)).join(), '100000,8000');
  same('Giá 110.000đ tách thuế 10%: 100.000đ + 10.000đ', Object.values(splitVat(110000, 1000)).join(), '100000,10000');
  let drift = 0;
  for (let gross = 1000; gross <= 2000000; gross += 500) { const { net, vat } = splitVat(gross, 800); if (net + vat !== gross) drift++; }
  same('Tách thuế không lệch đồng nào trên 4.000 mức giá', drift, 0);

  const online = (await call('/bookings', { method: 'POST', token: customer, body: { courtId: 1, date: day(5), start: '09:00', end: '10:00' } })).data.booking;
  const [[before]] = await db.query('SELECT COUNT(*) AS n FROM invoices');
  await call(`/bookings/${online.bookingCode}/cancel`, { method: 'POST', token: customer, body: {} });
  const [[afterCancel]] = await db.query('SELECT COUNT(*) AS n FROM invoices');
  same('Giữ chỗ chưa trả tiền rồi hủy thì không phát sinh hóa đơn', afterCancel.n, before.n);

  const paid = (await call('/bookings', { method: 'POST', token: customer, body: { courtId: 1, date: day(5), start: '10:00', end: '11:00' } })).data.booking;
  await call(`/payments/mock/${paid.bookingCode}/pay`, { method: 'POST', token: customer });
  const paidView = (await call(`/bookings/${paid.bookingCode}`, { token: customer })).data.booking;
  check('Thanh toán VietQR tự có hóa đơn', Boolean(paidView.invoiceNo));
  const mine = (await call('/invoices/my', { token: customer })).data.invoices;
  check('Khách thấy hóa đơn của mình', mine.some((i) => i.invoiceNo === paidView.invoiceNo));
  expectError('Khách không xem được hóa đơn người khác', await call(`/invoices/${row.invoice_no}`, { token: customer }), 403, 'FORBIDDEN');
  expectError('Lễ tân không dùng được danh sách của khách', await call('/invoices/my', { token: staff }), 403, 'FORBIDDEN');

  const other = await call('/bookings', { method: 'POST', token: admin, body: { courtId: 5, date: day(2), start: '08:00', end: '09:00', guestName: 'Khách TĐ', guestPhone: '0912000222', paymentMethod: 'CASH' } });
  const [[tdInvoice]] = await db.query('SELECT invoice_no FROM invoices i JOIN bookings b ON b.id = i.booking_id WHERE b.booking_code = ?', [other.data.booking.bookingCode]);
  expectError('Quản lý cơ sở này không xem được hóa đơn cơ sở khác', await call(`/invoices/${tdInvoice.invoice_no}`, { token: manager }), 403, 'FORBIDDEN');
  check('Admin xem được hóa đơn mọi cơ sở', (await call(`/invoices/${tdInvoice.invoice_no}`, { token: admin })).status === 200);

  const sale = await call('/venues/1/service-orders', { method: 'POST', token: staff, body: { items: [{ serviceId: services[1].id, quantity: 3 }], paymentMethod: 'CASH' } });
  check('Bán lẻ tự có hóa đơn', Boolean(sale.data.order.invoiceNo), JSON.stringify(sale.data));

  console.log('\n--- Hoàn tiền');
  await call(`/bookings/${paid.bookingCode}/cancel`, { method: 'POST', token: customer, body: {} });
  const overviewBefore = (await call(`/finance/overview?from=${day(-1)}&to=${day(1)}`, { token: admin })).data.totals;
  await call(`/bookings/${paid.bookingCode}/refund`, { method: 'POST', token: manager, body: { note: 'CK hoàn' } });
  const credit = (await call(`/invoices?from=${day(-1)}&to=${day(1)}&type=CREDIT`, { token: manager })).data.invoices[0];
  check('Hoàn tiền phát hành hóa đơn điều chỉnh giảm', credit?.originalNo === paidView.invoiceNo, JSON.stringify(credit));
  const overviewAfter = (await call(`/finance/overview?from=${day(-1)}&to=${day(1)}`, { token: admin })).data.totals;
  same('Doanh thu giảm đúng phần chưa thuế', overviewBefore.revenue - overviewAfter.revenue, credit.subtotal);
  same('Thuế đầu ra giảm đúng phần thuế', overviewBefore.vatOutput - overviewAfter.vatOutput, credit.vatAmount);
  same('Đơn đã hoàn không tính vào tiền ngân hàng', overviewBefore.bankIn - overviewAfter.bankIn, credit.total);

  console.log('\n--- Tiền về trễ khi ô đã có người');
  const late = (await call('/bookings', { method: 'POST', token: customer, body: { courtId: 2, date: day(6), start: '10:00', end: '11:00' } })).data.booking;
  const link = (await call(`/bookings/${late.bookingCode}/payment-link`, { method: 'POST', token: customer, body: {} })).data.payment;
  await db.query('UPDATE bookings SET hold_expires_at = NOW() - INTERVAL 1 MINUTE WHERE booking_code = ?', [late.bookingCode]);
  const taker = await call('/bookings', { method: 'POST', token: staff, body: { courtId: 2, date: day(6), start: '10:00', end: '11:00', guestName: 'Khách đến trước', guestPhone: '0912000333', paymentMethod: 'CASH' } });
  check('Người khác lấy được ô đã hết hạn', taker.status === 201, JSON.stringify(taker.data));
  const data = { orderCode: link.orderCode, amount: late.totalAmount, description: 'x', reference: `LATE${Date.now()}`, code: '00', desc: 'success' };
  await call('/payments/payos/webhook', { method: 'POST', body: { code: '00', desc: 'success', success: true, data, signature: signData(data) } });
  const lateView = (await call(`/bookings/${late.bookingCode}`, { token: customer })).data.booking;
  same('Đơn chuyển chờ hoàn tiền', lateView.paymentStatus, 'CONFLICT_REFUND_PENDING');
  same('Không phát hành hóa đơn cho tiền không thành doanh thu', lateView.invoiceNo, null);
  const [[held]] = await db.query("SELECT COALESCE(SUM(credit) - SUM(debit), 0) AS v FROM gl_lines WHERE account_code = '3388'");
  same('Tiền nằm ở khoản giữ hộ khách', Number(held.v), late.totalAmount);
  await call(`/bookings/${late.bookingCode}/refund`, { method: 'POST', token: manager, body: { note: 'Trả lại' } });
  const [[heldAfter]] = await db.query("SELECT COALESCE(SUM(credit) - SUM(debit), 0) AS v FROM gl_lines WHERE account_code = '3388'");
  same('Hoàn xong, khoản giữ hộ về 0', Number(heldAfter.v), 0);

  console.log('\n--- Chứng từ không sửa được');
  const blocked = async (sql) => { try { await db.query(sql); return false; } catch (e) { return e.code === 'ER_SIGNAL_EXCEPTION'; } };
  check('CSDL chặn sửa hóa đơn', await blocked('UPDATE invoices SET total = 1 LIMIT 1'));
  check('CSDL chặn xóa hóa đơn', await blocked('DELETE FROM invoices LIMIT 1'));
  check('CSDL chặn sửa sổ cái', await blocked('UPDATE gl_lines SET debit = 1 LIMIT 1'));
  check('CSDL chặn xóa sổ cái', await blocked('DELETE FROM gl_entries LIMIT 1'));
}

async function testPayroll(tokens) {
  console.log('\n--- Quy trình tiền lương');
  const { staff, manager, admin } = tokens;
  const contract = (body) => ({ position: 'Lễ tân', baseSalary: 12000000, allowance: 500000, insuredSalary: 12000000, dependents: 0, wageRegion: 1, effectiveFrom: '2026-01-01', ...body });
  expectError('Từ chối lương thấp hơn lương tối thiểu vùng', await call('/payroll/contracts/3', { method: 'PUT', token: manager, body: contract({ baseSalary: 3000000 }) }), 409, 'BELOW_MIN_WAGE');
  expectError('Lễ tân không sửa được hợp đồng', await call('/payroll/contracts/3', { method: 'PUT', token: staff, body: contract() }), 403, 'FORBIDDEN');
  expectError('Quản lý không tự sửa hợp đồng của mình', await call('/payroll/contracts/2', { method: 'PUT', token: manager, body: contract() }), 409, 'CANNOT_EDIT_OWN_CONTRACT');
  check('Quản lý lập hợp đồng cho lễ tân', (await call('/payroll/contracts/3', { method: 'PUT', token: manager, body: contract() })).status === 200);
  check('Admin lập hợp đồng cho quản lý', (await call('/payroll/contracts/2', { method: 'PUT', token: admin, body: contract({ position: 'Quản lý', baseSalary: 25000000, insuredSalary: 25000000, dependents: 1 }) })).status === 200);

  const created = await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-11', standardDays: 26 } });
  check('Tạo bảng lương cho cả cơ sở', created.status === 200 && created.data.period.slips.length === 2, JSON.stringify(created.data));
  const period = created.data.period;
  expectError('Không tạo trùng kỳ lương', await call('/payroll/periods', { method: 'POST', token: manager, body: { month: '2026-11', standardDays: 26 } }), 409, 'PERIOD_EXISTS');
  const staffSlip = period.slips.find((s) => s.userId === 3);
  const updated = await call(`/payroll/periods/${period.id}/payslips/${staffSlip.id}`, { method: 'PATCH', token: manager, body: { workDays: 24, otWeekdayMinutes: 120 } });
  const after = updated.data.period.slips.find((s) => s.userId === 3);
  same('Nhập chấm công thì tính lại', after.basePay, Math.round((12000000 * 24) / 26));
  same('Tiền làm thêm 2 giờ', after.otPay, Math.round((12000000 / 208) * 3));
  same('Lễ tân chưa thấy phiếu khi chưa duyệt', (await call('/payroll/my', { token: staff })).data.payslips.length, 0);
  expectError('Quản lý không tự duyệt được', await call(`/payroll/periods/${period.id}/approve`, { method: 'POST', token: manager }), 403, 'FORBIDDEN');
  expectError('Chưa duyệt thì chưa chi trả được', await call(`/payroll/periods/${period.id}/pay`, { method: 'POST', token: admin }), 409, 'PAYROLL_NOT_APPROVED');

  const approved = await call(`/payroll/periods/${period.id}/approve`, { method: 'POST', token: admin });
  same('Admin duyệt bảng lương', approved.data.period?.status, 'APPROVED');
  expectError('Đã duyệt thì khóa số liệu', await call(`/payroll/periods/${period.id}/payslips/${staffSlip.id}`, { method: 'PATCH', token: manager, body: { workDays: 26 } }), 409, 'PAYROLL_LOCKED');
  const paid = await call(`/payroll/periods/${period.id}/pay`, { method: 'POST', token: admin });
  same('Chi trả lương', paid.data.period?.status, 'PAID');
  const mine = (await call('/payroll/my', { token: staff })).data.payslips;
  check('Lễ tân chỉ thấy đúng phiếu của mình', mine.length === 1 && mine[0].userId === 3);
  expectError('Lễ tân không xem được bảng lương', await call(`/payroll/periods/${period.id}`, { token: staff }), 403, 'FORBIDDEN');

  const own = await call('/payroll/periods', { method: 'POST', token: admin, body: { venueId: 1, month: '2026-10', standardDays: 26 } });
  expectError('Người lập không được tự duyệt, kể cả Admin', await call(`/payroll/periods/${own.data.period.id}/approve`, { method: 'POST', token: admin }), 409, 'CANNOT_APPROVE_OWN');
  return paid.data.period;
}

async function testReports(db, tokens, period) {
  console.log('\n--- Báo cáo tài chính và đối soát');
  const { staff, manager, admin } = tokens;
  expectError('Lễ tân không xem được báo cáo tài chính', await call('/finance/overview', { token: staff }), 403, 'FORBIDDEN');
  expectError('Quản lý không xem được đối soát toàn hệ thống', await call('/finance/reconciliation', { token: manager }), 403, 'FORBIDDEN');

  const trial = (await call(`/finance/trial-balance?from=2026-01-01&to=${day(30)}`, { token: admin })).data;
  same('Bảng cân đối: tổng nợ bằng tổng có', trial.totals.debit, trial.totals.credit);
  const salary = trial.accounts.find((a) => a.code === '6421');
  same('Chi phí lương đúng bằng bảng lương', salary.debit, period.totals.gross);
  const pit = trial.accounts.find((a) => a.code === '3335');
  same('Thuế TNCN phải nộp đúng bằng bảng lương', pit.credit, period.totals.pit);
  const payable = trial.accounts.find((a) => a.code === '334');
  same('Đã trả hết lương, tài khoản 334 về 0', payable.closing, 0);

  const q7 = (await call(`/finance/overview?from=2026-01-01&to=${day(30)}`, { token: manager })).data;
  const chain = (await call(`/finance/overview?from=2026-01-01&to=${day(30)}`, { token: admin })).data;
  same('Quản lý chỉ thấy số liệu cơ sở mình', q7.venueId, 1);
  same('Tổng các cơ sở khớp toàn chuỗi', chain.byVenue.reduce((s, v) => s + v.revenue, 0), chain.totals.revenue);
  same('Tổng theo ngày khớp doanh thu', chain.daily.reduce((s, d) => s + d.revenue, 0), chain.totals.revenue);
  const sumVenues = async (key) => {
    const [a, b] = await Promise.all([1, 2].map((id) => call(`/finance/overview?from=2026-01-01&to=${day(30)}&venueId=${id}`, { token: admin })));
    return a.data.totals[key] + b.data.totals[key];
  };
  same('Lọc từng cơ sở: cộng doanh thu bằng toàn chuỗi', await sumVenues('revenue'), chain.totals.revenue);
  same('Lọc từng cơ sở: cộng thuế bằng toàn chuỗi', await sumVenues('vatOutput'), chain.totals.vatOutput);
  same('Lọc từng cơ sở: cộng tiền ngân hàng bằng toàn chuỗi', await sumVenues('bankIn'), chain.totals.bankIn);
  same('Quản lý thấy đúng doanh thu cơ sở mình', q7.totals.revenue, chain.byVenue.find((v) => v.venueId === 1).revenue);
  same('Bảng cân đối lọc theo cơ sở vẫn cân', ((t) => t.debit - t.credit)((await call(`/finance/trial-balance?from=2026-01-01&to=${day(30)}&venueId=1`, { token: admin })).data.totals), 0);
  same('Lợi nhuận = doanh thu - chi phí', chain.totals.operatingProfit, chain.totals.revenue - chain.totals.salaryCost - chain.totals.insuranceCost);

  const vat = (await call(`/finance/vat?year=${day(0).slice(0, 4)}`, { token: admin })).data;
  same('Bảng kê VAT khớp sổ cái', vat.totals.vat, chain.totals.vatOutput);

  const rec = (await call('/finance/reconciliation', { token: admin })).data;
  for (const c of rec.checks) check(`Đối soát: ${c.name}`, c.ok, `${c.leftLabel} ${c.left} / ${c.rightLabel} ${c.right}`);
  const [[gap]] = await db.query('SELECT MAX(seq) AS maxSeq, COUNT(*) AS n FROM invoices');
  same('Số hóa đơn liên tục', Number(gap.maxSeq), Number(gap.n));
}

async function testLegalAndSite(db, tokens) {
  console.log('\n--- Tham số pháp lý');
  const { customer, manager, admin } = tokens;
  const add = (body, token = admin) => call('/finance/legal-parameters', { method: 'POST', token, body });
  expectError('Quản lý không sửa được tham số thuế', await add({ code: 'VAT_RATE', value: 500, effectiveFrom: '2030-01-01', legalRef: 'x' }, manager), 403, 'FORBIDDEN');
  expectError('Phải có căn cứ pháp lý', await add({ code: 'VAT_RATE', value: 500, effectiveFrom: '2030-01-01', legalRef: ' ' }), 400, 'VALIDATION_ERROR');
  expectError('Không ghi đè phiên bản đã có', await add({ code: 'VAT_RATE', value: 500, effectiveFrom: '2026-01-01', legalRef: 'x' }), 409, 'INVALID_EFFECTIVE_DATE');
  check('Thêm phiên bản mới', (await add({ code: 'VAT_RATE', value: 500, effectiveFrom: '2030-01-01', legalRef: 'Thử nghiệm' })).status === 200);
  const [[closed]] = await db.query("SELECT DATE_FORMAT(effective_to, '%Y-%m-%d') AS d FROM legal_parameters WHERE code = 'VAT_RATE' AND value = 1000");
  same('Phiên bản trước tự đóng ngày hiệu lực', closed.d, '2029-12-31');

  console.log('\n--- Ảnh và thông tin website');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
  const put = (key, raw, type, token = admin) => call(`/admin/site/media/${key}`, { method: 'PUT', token, raw, type });
  expectError('Khách không đổi được ảnh hệ thống', await put('hero.1', png, 'image/png', customer), 403, 'FORBIDDEN');
  expectError('Quản lý không đổi được ảnh hệ thống', await put('hero.1', png, 'image/png', manager), 403, 'FORBIDDEN');
  expectError('Không nhận file giả ảnh', await put('hero.1', Buffer.from('<svg onload="alert(1)"/>'), 'image/png'), 415, 'UNSUPPORTED_IMAGE');
  expectError('Không có vị trí ảnh của khách hàng', await put('customer.avatar', png, 'image/png'), 400, 'VALIDATION_ERROR');
  const up = await put('hero.1', png, 'image/png');
  check('Admin thay được ảnh', up.status === 200 && up.data.url.endsWith('.png'), JSON.stringify(up.data));
  const file = await fetch(`${ORIGIN}${up.data.url}`);
  check('Ảnh mới truy cập được', file.status === 200 && (await file.arrayBuffer()).byteLength === png.length);
  const meta = await call('/admin/site/media/hero.1', { method: 'PATCH', token: admin, body: { alt: 'Ảnh thử', focusX: 30, focusY: 70 } });
  check('Đổi điểm lấy nét', meta.status === 200);
  const content = (await call('/site/content')).data;
  same('Trang công khai đọc được ảnh mới', content.media['hero.1']?.url, up.data.url);
  same('Trang công khai đọc được điểm lấy nét', content.media['hero.1']?.focusX, 30);
  check('Khôi phục ảnh mặc định', (await call('/admin/site/media/hero.1', { method: 'DELETE', token: admin })).status === 200);
  await new Promise((r) => setTimeout(r, 200));
  same('Xóa file cũ khỏi máy chủ', (await fetch(`${ORIGIN}${up.data.url}`)).status, 404);
  same('Vị trí ảnh trở về mặc định', (await call('/site/content')).data.media['hero.1'], undefined);

  const [[oldInvoice]] = await db.query('SELECT invoice_no FROM invoices ORDER BY id LIMIT 1');
  await call('/admin/site/settings', { method: 'PUT', token: admin, body: { settings: { seller_tax_code: '0312345678', team_members: 'Thành viên A' } } });
  expectError('Quản lý không sửa được thông tin website', await call('/admin/site/settings', { method: 'PUT', token: manager, body: { settings: { project_name: 'x' } } }), 403, 'FORBIDDEN');
  same('Thông tin đồ án cập nhật', (await call('/site/content')).data.settings.team_members, 'Thành viên A');
  same('Hóa đơn cũ giữ nguyên thông tin bên bán đã chốt', (await call(`/invoices/${oldInvoice.invoice_no}`, { token: admin })).data.invoice.seller.taxCode, '');
}

(async () => {
  const db = await mysql.createPool({ host: process.env.DB_HOST || '127.0.0.1', user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '', database: process.env.DB_NAME });
  testPayrollMath();
  const tokens = {
    customer: await login('customer1@gmail.com'), staff: await login('staff.q7@pickleball.vn'),
    manager: await login('manager.q7@pickleball.vn'), admin: await login('admin@pickleball.vn'),
  };
  await testInvoices(db, tokens);
  const period = await testPayroll(tokens);
  await testReports(db, tokens, period);
  await testLegalAndSite(db, tokens);
  console.log(`\nTổng: ${passed} đạt, ${failed} lỗi`);
  await db.end();
  process.exit(failed ? 1 : 0);
})().catch((err) => { console.error(err); process.exit(1); });
