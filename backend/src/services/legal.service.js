const pool = require('../config/db');
const HttpError = require('../utils/httpError');
const { assertDate } = require('../utils/time');
const withTransaction = require('../utils/transaction');
const audit = require('./audit.service');

// Giá trị của một tham số tại đúng một ngày: kỳ cũ tính lại vẫn ra đúng số cũ
async function valueOn(code, date, db = pool) {
  const [rows] = await db.query(
    `SELECT value FROM legal_parameters
      WHERE code = ? AND effective_from <= ? AND (effective_to IS NULL OR effective_to >= ?)
      ORDER BY effective_from DESC LIMIT 1`,
    [code, date, date],
  );
  if (!rows[0]) throw new HttpError(409, 'LEGAL_PARAMETER_MISSING', `Chưa có tham số ${code} hiệu lực ngày ${date}`);
  return Number(rows[0].value);
}

const vatRateOn = (date, db = pool) => valueOn('VAT_RATE', date, db);

const loadCodes = async (codes, date, db) => Object.fromEntries(await Promise.all(Object.entries(codes).map(async ([key, code]) => [key, await valueOn(code, date, db)])));

// Toàn bộ tham số dùng cho một kỳ lương, chốt tại ngày cuối tháng.
// PIT_WITHHOLDING = 0: chưa khấu trừ thuế TNCN, không cần giảm trừ gia cảnh và biểu thuế.
async function payrollParametersOn(date, region, db = pool) {
  const base = await loadCodes({
    siEmployee: 'SI_EMPLOYEE', hiEmployee: 'HI_EMPLOYEE', uiEmployee: 'UI_EMPLOYEE', siEmployer: 'SI_EMPLOYER', hiEmployer: 'HI_EMPLOYER', uiEmployer: 'UI_EMPLOYER',
    siSalaryCap: 'SI_SALARY_CAP', uiCapMultiple: 'UI_CAP_MULTIPLE', siMinWorkDays: 'SI_MIN_WORK_DAYS',
    otWeekdayRate: 'OT_WEEKDAY_RATE', otWeekendRate: 'OT_WEEKEND_RATE', otHolidayRate: 'OT_HOLIDAY_RATE', nightRate: 'NIGHT_RATE',
    minWage: `MIN_WAGE_REGION_${region}`, pitWithholding: 'PIT_WITHHOLDING',
  }, date, db);
  if (!base.pitWithholding) return { ...base, pitSelfDeduction: 0, pitDependentDeduction: 0, brackets: [] };
  const pit = await loadCodes({ pitSelfDeduction: 'PIT_SELF_DEDUCTION', pitDependentDeduction: 'PIT_DEPENDENT_DEDUCTION' }, date, db);
  const [[{ version }]] = await db.query('SELECT MAX(effective_from) AS version FROM pit_brackets WHERE effective_from <= ?', [date]);
  if (!version) throw new HttpError(409, 'LEGAL_PARAMETER_MISSING', `Chưa có biểu thuế TNCN hiệu lực ngày ${date}`);
  const [brackets] = await db.query('SELECT upper_limit, rate_bp FROM pit_brackets WHERE effective_from = ? ORDER BY upper_limit IS NULL, upper_limit', [version]);
  return { ...base, ...pit, brackets: brackets.map((b) => ({ upperLimit: b.upper_limit === null ? null : Number(b.upper_limit), rateBp: b.rate_bp })) };
}

async function list() {
  const [params] = await pool.query('SELECT * FROM legal_parameters ORDER BY code, effective_from DESC');
  const [brackets] = await pool.query('SELECT * FROM pit_brackets ORDER BY effective_from DESC, upper_limit IS NULL, upper_limit');
  return {
    parameters: params.map((p) => ({ id: p.id, code: p.code, label: p.label, value: Number(p.value), unit: p.unit, effectiveFrom: p.effective_from, effectiveTo: p.effective_to, legalRef: p.legal_ref })),
    pitBrackets: brackets.map((b) => ({ effectiveFrom: b.effective_from, upperLimit: b.upper_limit === null ? null : Number(b.upper_limit), rateBp: b.rate_bp, legalRef: b.legal_ref })),
  };
}

// Luật đổi: thêm một phiên bản mới có ngày hiệu lực và tự đóng phiên bản trước, không sửa số cũ
async function addVersion({ code, value, effectiveFrom, legalRef }, actor) {
  assertDate(effectiveFrom, 'effectiveFrom');
  if (!Number.isInteger(value) || value < 0) throw new HttpError(400, 'VALIDATION_ERROR', 'value phải là số nguyên không âm');
  if (typeof legalRef !== 'string' || !legalRef.trim()) throw new HttpError(400, 'VALIDATION_ERROR', 'Cần ghi căn cứ pháp lý');
  if (code === 'PIT_WITHHOLDING' && value > 1) throw new HttpError(400, 'VALIDATION_ERROR', 'Khấu trừ thuế TNCN chỉ nhận 1 (bật) hoặc 0 (tắt)');
  return withTransaction(async (conn) => {
    const [current] = await conn.query('SELECT * FROM legal_parameters WHERE code = ? ORDER BY effective_from DESC LIMIT 1 FOR UPDATE', [code]);
    if (!current[0]) throw new HttpError(404, 'NOT_FOUND', 'Không có tham số này');
    if (effectiveFrom <= current[0].effective_from) throw new HttpError(409, 'INVALID_EFFECTIVE_DATE', 'Ngày hiệu lực phải sau phiên bản mới nhất');
    await conn.query('UPDATE legal_parameters SET effective_to = DATE_SUB(?, INTERVAL 1 DAY) WHERE id = ?', [effectiveFrom, current[0].id]);
    const [res] = await conn.query(
      'INSERT INTO legal_parameters (code, label, value, unit, effective_from, legal_ref, updated_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [code, current[0].label, value, current[0].unit, effectiveFrom, legalRef.trim(), actor.id],
    );
    await audit.log(conn, { actorId: actor.id, actionType: 'ADD_LEGAL_PARAMETER', entityType: 'LEGAL_PARAMETER', entityId: res.insertId, oldValues: { value: Number(current[0].value) }, newValues: { code, value, effectiveFrom }, reason: legalRef.trim() });
    return { id: res.insertId };
  });
}

module.exports = { valueOn, vatRateOn, payrollParametersOn, list, addVersion };
