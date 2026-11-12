const BP = 10000; // 1 = 0,01%

const percent = (amount, bp) => Math.round((amount * bp) / BP);

// Thuế lũy tiến từng phần: mỗi bậc chỉ tính trên phần thu nhập nằm trong bậc đó
function progressiveTax(income, brackets) {
  let tax = 0;
  let lower = 0;
  for (const { upperLimit, rateBp } of brackets) {
    const top = upperLimit ?? Infinity;
    if (income <= lower) break;
    tax += ((Math.min(income, top) - lower) * rateBp) / BP;
    lower = top;
  }
  return Math.round(tax);
}

const NO_NIGHT_OT = { weekdayPlain: 0, weekdayAfterDayOt: 0, weekend: 0, holiday: 0 };

// Lương giờ làm căn cứ tính làm thêm, làm đêm (Điều 55 Nghị định 145/2020/NĐ-CP)
function hourlyRate({ payType = 'MONTHLY', baseSalary, standardDays, unitHours = 8 }, normalDailyHours = 8) {
  if (payType === 'MONTHLY') return baseSalary / (standardDays * normalDailyHours);
  if (payType === 'HOURLY') return baseSalary;
  return baseSalary / unitHours; // DAILY, SHIFT: đơn giá chia số giờ của một ngày công, một ca
}

// Lương trong giờ bình thường theo hình thức trả lương (Điều 96 Bộ luật Lao động 2019).
// Ngày lễ hưởng nguyên lương (Điều 112) tính cho lương tháng và lương ngày.
function basePayOf({ payType = 'MONTHLY', baseSalary, standardDays, workDays, paidHolidays = 0, units }) {
  if (payType === 'MONTHLY') return Math.round((baseSalary * Math.min(workDays + paidHolidays, standardDays)) / standardDays);
  if (payType === 'DAILY') return baseSalary * (workDays + paidHolidays);
  return Math.round(baseSalary * units); // HOURLY: số giờ, SHIFT: số ca
}

// Tính một phiếu lương. Hàm thuần, không đụng CSDL, để kiểm thử được bằng số cụ thể.
// input: hợp đồng và bảng công; p: tham số pháp lý đang hiệu lực của kỳ lương.
function computePayslip(input, p) {
  const { allowance, insuredSalary, dependents, workDays, otWeekdayMinutes, otWeekendMinutes, otHolidayMinutes, nightMinutes, minWage, paidHolidays = 0, nightOt = NO_NIGHT_OT } = input;
  const hourly = hourlyRate(input, p.normalDailyHours ?? 8);
  const hoursPay = (minutes, rateBp) => (hourly * minutes * rateBp) / (60 * BP);

  const basePay = basePayOf({ ...input, units: input.units ?? workDays });
  const otPay = Math.round(hoursPay(otWeekdayMinutes, p.otWeekdayRate) + hoursPay(otWeekendMinutes, p.otWeekendRate) + hoursPay(otHolidayMinutes, p.otHolidayRate));
  // Ban đêm thêm 30% cho cả giờ thường lẫn giờ làm thêm; làm thêm ban đêm thêm 20% lương giờ ban ngày (Điều 57 Nghị định 145/2020)
  const extra = p.nightOtExtraRate ?? 0;
  const otNightMinutes = nightOt.weekdayPlain + nightOt.weekdayAfterDayOt + nightOt.weekend + nightOt.holiday;
  const nightPay = Math.round(hoursPay(nightMinutes + otNightMinutes, p.nightRate)
    + hoursPay(nightOt.weekdayPlain, extra) + hoursPay(nightOt.weekdayAfterDayOt, (extra * p.otWeekdayRate) / BP)
    + hoursPay(nightOt.weekend, (extra * p.otWeekendRate) / BP) + hoursPay(nightOt.holiday, (extra * p.otHolidayRate) / BP));
  const grossPay = basePay + allowance + otPay + nightPay;

  // Phần trả cao hơn lương làm ban ngày, trong giờ được miễn thuế TNCN: chênh lệch làm thêm và toàn bộ phụ trội ban đêm
  const otMinutes = otWeekdayMinutes + otWeekendMinutes + otHolidayMinutes;
  const taxExemptOt = Math.max(0, otPay - Math.round(hoursPay(otMinutes, BP))) + nightPay;

  // Nghỉ không lương quá nhiều trong tháng thì không đóng bảo hiểm tháng đó; ngày lễ là ngày có lương
  const insured = workDays + paidHolidays >= p.siMinWorkDays;
  const siBase = insured ? Math.min(insuredSalary, p.siSalaryCap) : 0;
  const uiBase = insured ? Math.min(insuredSalary, minWage * p.uiCapMultiple) : 0;
  const siEmployee = percent(siBase, p.siEmployee);
  const hiEmployee = percent(siBase, p.hiEmployee);
  const uiEmployee = percent(uiBase, p.uiEmployee);
  const siEmployer = percent(siBase, p.siEmployer);
  const hiEmployer = percent(siBase, p.hiEmployer);
  const uiEmployer = percent(uiBase, p.uiEmployer);
  const employeeInsurance = siEmployee + hiEmployee + uiEmployee;

  const result = { basePay, allowance, otPay, nightPay, grossPay, siEmployee, hiEmployee, uiEmployee, siEmployer, hiEmployer, uiEmployer };

  // Tắt khấu trừ thuế TNCN (tham số PIT_WITHHOLDING): thực nhận chỉ trừ bảo hiểm
  if (!p.pitWithholding) {
    return { ...result, taxExemptOt: 0, selfDeduction: 0, dependentDeduction: 0, assessableIncome: 0, pit: 0, netPay: grossPay - employeeInsurance };
  }
  const selfDeduction = p.pitSelfDeduction;
  const dependentDeduction = p.pitDependentDeduction * dependents;
  const assessableIncome = Math.max(0, grossPay - taxExemptOt - employeeInsurance - selfDeduction - dependentDeduction);
  const pit = progressiveTax(assessableIncome, p.brackets);
  return { ...result, taxExemptOt, selfDeduction, dependentDeduction, assessableIncome, pit, netPay: grossPay - employeeInsurance - pit };
}

module.exports = { computePayslip, progressiveTax, hourlyRate };
