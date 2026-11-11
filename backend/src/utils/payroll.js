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

// Tính một phiếu lương. Hàm thuần, không đụng CSDL, để kiểm thử được bằng số cụ thể.
// input: lương hợp đồng và chấm công; p: tham số pháp lý đang hiệu lực của kỳ lương.
function computePayslip(input, p) {
  const { baseSalary, allowance, insuredSalary, dependents, workDays, standardDays, otWeekdayMinutes, otWeekendMinutes, otHolidayMinutes, nightMinutes, minWage } = input;
  const hourly = baseSalary / (standardDays * 8);
  const hoursPay = (minutes, rateBp) => (hourly * minutes * rateBp) / (60 * BP);

  const basePay = Math.round((baseSalary * workDays) / standardDays);
  const otPay = Math.round(hoursPay(otWeekdayMinutes, p.otWeekdayRate) + hoursPay(otWeekendMinutes, p.otWeekendRate) + hoursPay(otHolidayMinutes, p.otHolidayRate));
  const nightPay = Math.round(hoursPay(nightMinutes, p.nightRate));
  const grossPay = basePay + allowance + otPay + nightPay;

  // Phần tiền làm thêm cao hơn lương giờ bình thường được miễn thuế TNCN
  const otMinutes = otWeekdayMinutes + otWeekendMinutes + otHolidayMinutes;
  const taxExemptOt = Math.max(0, otPay - Math.round(hoursPay(otMinutes, BP)));

  // Nghỉ quá nhiều trong tháng thì không đóng bảo hiểm tháng đó
  const insured = workDays >= p.siMinWorkDays;
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

module.exports = { computePayslip, progressiveTax };
