const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { nowInVietnam } = require('../utils/time');
const withTransaction = require('../utils/transaction');
const { computePayslip } = require('../utils/payroll');
const audit = require('./audit.service');
const ledger = require('./ledger.service');
const legal = require('./legal.service');

const assertVenue = (user, venueId) => {
  if (user.role !== 'ADMIN' && user.venueId !== venueId) throw new HttpError(403, 'FORBIDDEN', 'Bạn chỉ được thao tác trên cơ sở của mình');
};
const positiveInt = (v) => Number.isInteger(v) && v >= 0;

// Ngày cuối tháng: mốc lấy tham số pháp lý và hợp đồng của kỳ lương
function monthEnd(month) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

function toContract(r) {
  return {
    id: r.id, userId: r.user_id, position: r.position, baseSalary: r.base_salary, allowance: r.allowance, insuredSalary: r.insured_salary,
    dependents: r.dependents, wageRegion: r.wage_region, effectiveFrom: r.effective_from, effectiveTo: r.effective_to,
  };
}

async function listContracts(user, venueId) {
  const scope = user.role === 'ADMIN' ? Number(venueId) : user.venueId;
  if (!scope) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần chọn cơ sở');
  const [rows] = await pool.query(
    `SELECT u.id AS staff_id, u.full_name, u.role, c.*
       FROM users u LEFT JOIN employee_contracts c ON c.user_id = u.id AND c.effective_to IS NULL
      WHERE u.venue_id = ? AND u.role IN ('MANAGER', 'STAFF') AND u.is_active = TRUE ORDER BY u.role, u.id`,
    [scope],
  );
  return rows.map((r) => ({ userId: r.staff_id, fullName: r.full_name, role: r.role, contract: r.id ? toContract(r) : null }));
}

// Đổi hợp đồng là thêm phiên bản mới có ngày hiệu lực, kỳ lương cũ vẫn giữ nguyên số liệu
async function saveContract(userId, body, actor) {
  const { position, baseSalary, allowance = 0, insuredSalary, dependents = 0, wageRegion = 1, effectiveFrom } = body;
  if (typeof position !== 'string' || !position.trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần nhập vị trí');
  if (![baseSalary, allowance, insuredSalary, dependents].every(positiveInt) || baseSalary === 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Lương, phụ cấp, số người phụ thuộc phải là số nguyên không âm');
  if (![1, 2, 3, 4].includes(wageRegion)) throw new HttpError(400, 'VALIDATION_ERROR', 'Vùng lương phải từ 1 đến 4');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom || '')) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần ngày hiệu lực');
  const [users] = await pool.query("SELECT id, venue_id FROM users WHERE id = ? AND role IN ('MANAGER', 'STAFF')", [userId]);
  if (!users[0]) throw new HttpError(404, 'USER_NOT_FOUND', 'Không tìm thấy nhân sự');
  assertVenue(actor, users[0].venue_id);
  if (actor.id === userId) throw new HttpError(409, 'CANNOT_EDIT_OWN_CONTRACT', 'Không được tự sửa hợp đồng của mình');

  const minWage = await legal.valueOn(`MIN_WAGE_REGION_${wageRegion}`, effectiveFrom);
  if (baseSalary < minWage) throw new HttpError(409, 'BELOW_MIN_WAGE', `Lương thấp hơn lương tối thiểu vùng ${wageRegion} (${minWage.toLocaleString('vi-VN')}đ)`);

  return withTransaction(async (conn) => {
    const [current] = await conn.query('SELECT * FROM employee_contracts WHERE user_id = ? AND effective_to IS NULL FOR UPDATE', [userId]);
    if (current[0] && effectiveFrom <= current[0].effective_from) throw new HttpError(409, 'INVALID_EFFECTIVE_DATE', 'Ngày hiệu lực phải sau hợp đồng hiện tại');
    if (current[0]) await conn.query('UPDATE employee_contracts SET effective_to = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?', [effectiveFrom, current[0].id]);
    const [res] = await conn.query(
      `INSERT INTO employee_contracts (user_id, position, base_salary, allowance, insured_salary, dependents, wage_region, effective_from, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, position.trim(), baseSalary, allowance, insuredSalary, dependents, wageRegion, effectiveFrom, actor.id],
    );
    await audit.log(conn, { actorId: actor.id, venueId: users[0].venue_id, actionType: 'SAVE_CONTRACT', entityType: 'USER', entityId: userId, newValues: { effectiveFrom, position: position.trim() } });
    return { id: res.insertId };
  });
}

function toSlip(r) {
  return {
    id: r.id, userId: r.user_id, fullName: r.full_name, position: r.position, month: r.period_month, venueName: r.venue_name, status: r.status,
    workDays: Number(r.work_days), standardDays: r.standard_days, otWeekdayMinutes: r.ot_weekday_minutes, otWeekendMinutes: r.ot_weekend_minutes, otHolidayMinutes: r.ot_holiday_minutes, nightMinutes: r.night_minutes,
    basePay: r.base_pay, allowance: r.allowance, otPay: r.ot_pay, nightPay: r.night_pay, grossPay: r.gross_pay,
    siEmployee: r.si_employee, hiEmployee: r.hi_employee, uiEmployee: r.ui_employee, siEmployer: r.si_employer, hiEmployer: r.hi_employer, uiEmployer: r.ui_employer,
    taxExemptOt: r.tax_exempt_ot, selfDeduction: r.self_deduction, dependentDeduction: r.dependent_deduction, assessableIncome: r.assessable_income, pit: r.pit, netPay: r.net_pay,
  };
}

const SLIP_SELECT = `
  SELECT s.*, u.full_name, c.position, p.period_month, p.standard_days, p.status, v.name AS venue_name
    FROM payslips s JOIN users u ON u.id = s.user_id JOIN employee_contracts c ON c.id = s.contract_id
    JOIN payroll_periods p ON p.id = s.period_id JOIN venues v ON v.id = p.venue_id`;

function toPeriod(r, slips) {
  const sum = (key) => slips.reduce((t, s) => t + s[key], 0);
  return {
    id: r.id, venueId: r.venue_id, month: r.period_month, standardDays: r.standard_days, status: r.status, createdBy: r.created_by, approvedBy: r.approved_by, slips,
    totals: { gross: sum('grossPay'), net: sum('netPay'), pit: sum('pit'), employeeInsurance: sum('siEmployee') + sum('hiEmployee') + sum('uiEmployee'), employerInsurance: sum('siEmployer') + sum('hiEmployer') + sum('uiEmployer') },
  };
}

async function getPeriodRow(id, db = pool, lock = false) {
  const [rows] = await db.query(`SELECT * FROM payroll_periods WHERE id = ? ${lock ? 'FOR UPDATE' : ''}`, [id]);
  if (!rows[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy kỳ lương');
  return rows[0];
}

async function getPeriod(id, user) {
  const row = await getPeriodRow(id);
  assertVenue(user, row.venue_id);
  const [slips] = await pool.query(`${SLIP_SELECT} WHERE s.period_id = ? ORDER BY s.id`, [id]);
  return toPeriod(row, slips.map(toSlip));
}

async function listPeriods(user, venueId) {
  const scope = user.role === 'ADMIN' ? Number(venueId) || null : user.venueId;
  const [rows] = await pool.query(
    `SELECT p.*, v.name AS venue_name, COUNT(s.id) AS staff, COALESCE(SUM(s.net_pay), 0) AS net
       FROM payroll_periods p JOIN venues v ON v.id = p.venue_id LEFT JOIN payslips s ON s.period_id = p.id
      ${scope ? 'WHERE p.venue_id = ?' : ''} GROUP BY p.id ORDER BY p.period_month DESC, p.id DESC LIMIT 60`,
    scope ? [scope] : [],
  );
  return rows.map((r) => ({ id: r.id, venueId: r.venue_id, venueName: r.venue_name, month: r.period_month, status: r.status, staff: Number(r.staff), net: Number(r.net) }));
}

async function recompute(conn, slip, period, input) {
  const [contracts] = await conn.query('SELECT * FROM employee_contracts WHERE id = ?', [slip.contract_id]);
  const c = contracts[0];
  const params = await legal.payrollParametersOn(monthEnd(period.period_month), c.wage_region, conn);
  const result = computePayslip({
    baseSalary: c.base_salary, allowance: c.allowance, insuredSalary: c.insured_salary, dependents: c.dependents, standardDays: period.standard_days, minWage: params.minWage, ...input,
  }, params);
  await conn.query(
    `UPDATE payslips SET work_days = ?, ot_weekday_minutes = ?, ot_weekend_minutes = ?, ot_holiday_minutes = ?, night_minutes = ?,
            base_pay = ?, allowance = ?, ot_pay = ?, night_pay = ?, gross_pay = ?, si_employee = ?, hi_employee = ?, ui_employee = ?, si_employer = ?, hi_employer = ?, ui_employer = ?,
            tax_exempt_ot = ?, self_deduction = ?, dependent_deduction = ?, assessable_income = ?, pit = ?, net_pay = ?, parameters = ? WHERE id = ?`,
    [input.workDays, input.otWeekdayMinutes, input.otWeekendMinutes, input.otHolidayMinutes, input.nightMinutes,
      result.basePay, result.allowance, result.otPay, result.nightPay, result.grossPay, result.siEmployee, result.hiEmployee, result.uiEmployee, result.siEmployer, result.hiEmployer, result.uiEmployer,
      result.taxExemptOt, result.selfDeduction, result.dependentDeduction, result.assessableIncome, result.pit, result.netPay, JSON.stringify(params), slip.id],
  );
}

// Tạo kỳ lương cho cả cơ sở: mỗi nhân sự đang có hợp đồng một phiếu, mặc định đủ công
async function createPeriod({ venueId, month, standardDays = 26 }, actor) {
  const venue = actor.role === 'ADMIN' ? Number(venueId) : actor.venueId;
  if (!venue) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần chọn cơ sở');
  assertVenue(actor, venue);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new HttpError(400, 'VALIDATION_ERROR', 'month phải có dạng YYYY-MM');
  if (!Number.isInteger(standardDays) || standardDays < 20 || standardDays > 27) throw new HttpError(400, 'VALIDATION_ERROR', 'Ngày công chuẩn phải từ 20 đến 27');
  const end = monthEnd(month);
  return withTransaction(async (conn) => {
    const [contracts] = await conn.query(
      `SELECT c.id, c.user_id FROM employee_contracts c JOIN users u ON u.id = c.user_id
        WHERE u.venue_id = ? AND u.is_active = TRUE AND c.effective_from <= ? AND (c.effective_to IS NULL OR c.effective_to >= ?)`,
      [venue, end, end],
    );
    if (!contracts.length) throw new HttpError(409, 'NO_CONTRACTS', 'Cơ sở chưa có nhân sự nào có hợp đồng trong tháng này');
    let res;
    try {
      [res] = await conn.query('INSERT INTO payroll_periods (venue_id, period_month, standard_days, created_by) VALUES (?, ?, ?, ?)', [venue, month, standardDays, actor.id]);
    } catch (err) {
      if (err.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'PERIOD_EXISTS', `Cơ sở đã có bảng lương tháng ${month}`);
      throw err;
    }
    const period = { period_month: month, standard_days: standardDays };
    for (const c of contracts) {
      const [slip] = await conn.query('INSERT INTO payslips (period_id, user_id, contract_id) VALUES (?, ?, ?)', [res.insertId, c.user_id, c.id]);
      await recompute(conn, { id: slip.insertId, contract_id: c.id }, period, { workDays: standardDays, otWeekdayMinutes: 0, otWeekendMinutes: 0, otHolidayMinutes: 0, nightMinutes: 0 });
    }
    await audit.log(conn, { actorId: actor.id, venueId: venue, actionType: 'CREATE_PAYROLL', entityType: 'PAYROLL', entityId: res.insertId, newValues: { month, standardDays } });
    return res.insertId;
  }).then((id) => getPeriod(id, actor));
}

// Nhập chấm công rồi tính lại. Chỉ sửa được khi bảng lương còn nháp.
async function updateSlip(periodId, slipId, body, actor) {
  const input = {
    workDays: Number(body.workDays), otWeekdayMinutes: Number(body.otWeekdayMinutes ?? 0), otWeekendMinutes: Number(body.otWeekendMinutes ?? 0),
    otHolidayMinutes: Number(body.otHolidayMinutes ?? 0), nightMinutes: Number(body.nightMinutes ?? 0),
  };
  if (![input.otWeekdayMinutes, input.otWeekendMinutes, input.otHolidayMinutes, input.nightMinutes].every(positiveInt)) throw new HttpError(400, 'VALIDATION_ERROR', 'Thời gian làm thêm phải là số phút nguyên');
  await withTransaction(async (conn) => {
    const period = await getPeriodRow(periodId, conn, true);
    assertVenue(actor, period.venue_id);
    if (period.status !== 'DRAFT') throw new HttpError(409, 'PAYROLL_LOCKED', 'Bảng lương đã duyệt, không sửa được');
    if (!(input.workDays >= 0 && input.workDays <= period.standard_days + 5) || (input.workDays * 2) % 1 !== 0) throw new HttpError(400, 'VALIDATION_ERROR', 'Ngày công không hợp lệ');
    const [slips] = await conn.query('SELECT * FROM payslips WHERE id = ? AND period_id = ?', [slipId, periodId]);
    if (!slips[0]) throw new HttpError(404, 'NOT_FOUND', 'Không tìm thấy phiếu lương');
    await recompute(conn, slips[0], period, input);
  });
  return getPeriod(periodId, actor);
}

// Duyệt: khóa số liệu và ghi sổ. Người lập không được tự duyệt.
async function approve(id, actor) {
  await withTransaction(async (conn) => {
    const period = await getPeriodRow(id, conn, true);
    if (period.status !== 'DRAFT') throw new HttpError(409, 'PAYROLL_LOCKED', 'Bảng lương đã được duyệt');
    if (period.created_by === actor.id) throw new HttpError(409, 'CANNOT_APPROVE_OWN', 'Người lập bảng lương không được tự duyệt');
    const [[t]] = await conn.query(
      `SELECT COALESCE(SUM(gross_pay), 0) AS gross, COALESCE(SUM(net_pay), 0) AS net, COALESCE(SUM(pit), 0) AS pit,
              COALESCE(SUM(si_employee + si_employer), 0) AS si, COALESCE(SUM(hi_employee + hi_employer), 0) AS hi, COALESCE(SUM(ui_employee + ui_employer), 0) AS ui,
              COALESCE(SUM(si_employer + hi_employer + ui_employer), 0) AS employer
         FROM payslips WHERE period_id = ?`,
      [id],
    );
    const n = Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Number(v)]));
    await ledger.post(conn, {
      date: monthEnd(period.period_month), venueId: period.venue_id, sourceType: 'PAYROLL_ACCRUAL', sourceId: id, memo: `Lương tháng ${period.period_month}`, actorId: actor.id,
      lines: [['6421', n.gross, 0], ['6422', n.employer, 0], ['334', 0, n.net], ['3335', 0, n.pit], ['3383', 0, n.si], ['3384', 0, n.hi], ['3386', 0, n.ui]],
    });
    await conn.query("UPDATE payroll_periods SET status = 'APPROVED', approved_by = ?, approved_at = NOW() WHERE id = ?", [actor.id, id]);
    await audit.log(conn, { actorId: actor.id, venueId: period.venue_id, actionType: 'APPROVE_PAYROLL', entityType: 'PAYROLL', entityId: id, newValues: n });
  });
  return getPeriod(id, actor);
}

async function markPaid(id, actor) {
  await withTransaction(async (conn) => {
    const period = await getPeriodRow(id, conn, true);
    if (period.status !== 'APPROVED') throw new HttpError(409, 'PAYROLL_NOT_APPROVED', 'Chỉ chi trả bảng lương đã duyệt và chưa trả');
    const [[{ net }]] = await conn.query('SELECT COALESCE(SUM(net_pay), 0) AS net FROM payslips WHERE period_id = ?', [id]);
    await ledger.post(conn, {
      date: nowInVietnam().date, venueId: period.venue_id, sourceType: 'PAYROLL_PAYMENT', sourceId: id, memo: `Trả lương tháng ${period.period_month}`, actorId: actor.id,
      lines: [['334', Number(net), 0], ['1121', 0, Number(net)]],
    });
    await conn.query("UPDATE payroll_periods SET status = 'PAID', paid_at = NOW() WHERE id = ?", [id]);
    await audit.log(conn, { actorId: actor.id, venueId: period.venue_id, actionType: 'PAY_PAYROLL', entityType: 'PAYROLL', entityId: id, newValues: { net: Number(net) } });
  });
  return getPeriod(id, actor);
}

// Nhân viên chỉ thấy phiếu của mình, và chỉ sau khi bảng lương đã duyệt
async function myPayslips(user) {
  const [rows] = await pool.query(`${SLIP_SELECT} WHERE s.user_id = ? AND p.status IN ('APPROVED', 'PAID') ORDER BY p.period_month DESC LIMIT 36`, [user.id]);
  return rows.map(toSlip);
}

module.exports = { listContracts, saveContract, listPeriods, getPeriod, createPeriod, updateSlip, approve, markPaid, myPayslips };
