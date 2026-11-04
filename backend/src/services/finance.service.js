const pool = require('../config/db');
const { assertDate, nowInVietnam } = require('../utils/time');

const scopeOf = (user, venueId) => (user.role === 'ADMIN' ? (venueId ? Number(venueId) : null) : user.venueId);

function range({ from, to } = {}) {
  const today = nowInVietnam().date;
  const end = to || today;
  const start = from || `${end.slice(0, 7)}-01`;
  assertDate(start, 'from');
  assertDate(end, 'to');
  return { start, end };
}

// Mọi con số đọc từ sổ cái, không cộng lại từ bảng nghiệp vụ, nên báo cáo luôn khớp với bảng cân đối
async function balances(start, end, venueId) {
  const [rows] = await pool.query(
    `SELECT a.code, a.name, a.account_type,
            COALESCE(SUM(CASE WHEN e.entry_date < ? THEN l.debit - l.credit END), 0) AS opening,
            COALESCE(SUM(CASE WHEN e.entry_date BETWEEN ? AND ? THEN l.debit END), 0) AS debit,
            COALESCE(SUM(CASE WHEN e.entry_date BETWEEN ? AND ? THEN l.credit END), 0) AS credit
       FROM gl_accounts a
       LEFT JOIN (gl_lines l JOIN gl_entries e ON e.id = l.entry_id ${venueId ? 'AND e.venue_id = ?' : ''}) ON l.account_code = a.code
      GROUP BY a.code, a.name, a.account_type ORDER BY a.code`,
    [start, start, end, start, end, ...(venueId ? [venueId] : [])],
  );
  return rows.map((r) => {
    const opening = Number(r.opening);
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    return { code: r.code, name: r.name, type: r.account_type, opening, debit, credit, closing: opening + debit - credit };
  });
}

async function overview(user, query = {}) {
  const { start, end } = range(query);
  const venueId = scopeOf(user, query.venueId);
  const accounts = await balances(start, end, venueId);
  const of = (code) => accounts.find((a) => a.code === code);
  const earned = (code) => of(code).credit - of(code).debit; // doanh thu ròng sau điều chỉnh giảm
  const courtRevenue = earned('5113');
  const serviceRevenue = earned('5111');
  const salaryCost = of('6421').debit - of('6421').credit;
  const insuranceCost = of('6422').debit - of('6422').credit;
  const params = [start, end, ...(venueId ? [venueId] : [])];
  const v = (alias) => (venueId ? `AND ${alias}.venue_id = ?` : '');

  const [daily] = await pool.query(
    `SELECT DATE_FORMAT(e.entry_date, '%Y-%m-%d') AS day,
            COALESCE(SUM(CASE WHEN l.account_code IN ('5111', '5113') THEN l.credit - l.debit END), 0) AS revenue,
            COALESCE(SUM(CASE WHEN l.account_code = '1111' THEN l.debit - l.credit END), 0) AS cash,
            COALESCE(SUM(CASE WHEN l.account_code = '1121' THEN l.debit - l.credit END), 0) AS bank
       FROM gl_entries e JOIN gl_lines l ON l.entry_id = e.id
      WHERE e.entry_date BETWEEN ? AND ? ${v('e')} GROUP BY e.entry_date ORDER BY e.entry_date`,
    params,
  );
  const [[counts]] = await pool.query(
    `SELECT COALESCE(SUM(i.invoice_type = 'SALE'), 0) AS sales, COALESCE(SUM(i.invoice_type = 'CREDIT'), 0) AS credits,
            COALESCE(SUM(CASE WHEN i.invoice_type = 'CREDIT' THEN i.total END), 0) AS refunded
       FROM invoices i WHERE i.invoice_date BETWEEN ? AND ? ${v('i')}`,
    params,
  );
  let byVenue = [];
  if (user.role === 'ADMIN' && !venueId) {
    const [rows] = await pool.query(
      `SELECT v.id, v.name,
              COALESCE(SUM(CASE WHEN l.account_code IN ('5111', '5113') THEN l.credit - l.debit END), 0) AS revenue,
              COALESCE(SUM(CASE WHEN l.account_code IN ('6421', '6422') THEN l.debit - l.credit END), 0) AS cost
         FROM venues v LEFT JOIN (gl_entries e JOIN gl_lines l ON l.entry_id = e.id) ON e.venue_id = v.id AND e.entry_date BETWEEN ? AND ?
        GROUP BY v.id, v.name ORDER BY v.id`,
      [start, end],
    );
    byVenue = rows.map((r) => ({ venueId: r.id, venue: r.name, revenue: Number(r.revenue), cost: Number(r.cost), profit: Number(r.revenue) - Number(r.cost) }));
  }
  const revenue = courtRevenue + serviceRevenue;
  return {
    from: start,
    to: end,
    venueId,
    totals: {
      revenue, courtRevenue, serviceRevenue,
      vatOutput: of('33311').credit - of('33311').debit,
      salaryCost, insuranceCost,
      operatingProfit: revenue - salaryCost - insuranceCost,
      cashIn: of('1111').debit - of('1111').credit,
      bankIn: of('1121').debit - of('1121').credit,
      refunded: Number(counts.refunded),
      invoices: Number(counts.sales),
      creditNotes: Number(counts.credits),
    },
    daily: daily.map((d) => ({ date: d.day, revenue: Number(d.revenue), cash: Number(d.cash), bank: Number(d.bank) })),
    byVenue,
  };
}

async function trialBalance(user, query = {}) {
  const { start, end } = range(query);
  const venueId = scopeOf(user, query.venueId);
  const accounts = await balances(start, end, venueId);
  return {
    from: start, to: end, venueId, accounts,
    totals: { debit: accounts.reduce((s, a) => s + a.debit, 0), credit: accounts.reduce((s, a) => s + a.credit, 0) },
  };
}

// Bảng kê VAT đầu ra theo tháng, đọc từ hóa đơn; hóa đơn điều chỉnh giảm trừ vào tháng phát hành
async function vatSummary(user, query = {}) {
  const year = /^\d{4}$/.test(query.year || '') ? query.year : nowInVietnam().date.slice(0, 4);
  const venueId = scopeOf(user, query.venueId);
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(i.invoice_date, '%Y-%m') AS month, i.vat_rate_bp,
            COALESCE(SUM(CASE WHEN i.invoice_type = 'SALE' THEN CAST(i.subtotal AS SIGNED) ELSE -CAST(i.subtotal AS SIGNED) END), 0) AS taxable,
            COALESCE(SUM(CASE WHEN i.invoice_type = 'SALE' THEN CAST(i.vat_amount AS SIGNED) ELSE -CAST(i.vat_amount AS SIGNED) END), 0) AS vat,
            COUNT(*) AS invoices
       FROM invoices i WHERE YEAR(i.invoice_date) = ? ${venueId ? 'AND i.venue_id = ?' : ''}
      GROUP BY month, i.vat_rate_bp ORDER BY month, i.vat_rate_bp`,
    [year, ...(venueId ? [venueId] : [])],
  );
  const months = rows.map((r) => ({ month: r.month, vatRateBp: r.vat_rate_bp, taxable: Number(r.taxable), vat: Number(r.vat), invoices: Number(r.invoices) }));
  return { year, venueId, months, totals: { taxable: months.reduce((s, m) => s + m.taxable, 0), vat: months.reduce((s, m) => s + m.vat, 0) } };
}

// Đối soát chéo giữa nghiệp vụ, hóa đơn, sổ cái và cổng thanh toán. Mỗi dòng có 2 số phải bằng nhau.
async function reconciliation() {
  const one = async (sql, params = []) => Number((await pool.query(sql, params))[0][0].v);
  const check = (name, left, right, leftLabel, rightLabel) => ({ name, left, right, leftLabel, rightLabel, ok: left === right });

  const invoiceNet = await one("SELECT COALESCE(SUM(CASE WHEN invoice_type = 'SALE' THEN CAST(total AS SIGNED) ELSE -CAST(total AS SIGNED) END), 0) AS v FROM invoices");
  const glRevenue = await one("SELECT COALESCE(SUM(credit) - SUM(debit), 0) AS v FROM gl_lines WHERE account_code IN ('5111', '5113', '33311')");
  const invoiceCashSale = await one("SELECT COALESCE(SUM(CASE WHEN invoice_type = 'SALE' THEN CAST(total AS SIGNED) ELSE -CAST(total AS SIGNED) END), 0) AS v FROM invoices WHERE payment_method = 'CASH'");
  const glCash = await one("SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS v FROM gl_lines WHERE account_code = '1111'");

  const checks = [
    check('Tổng nợ bằng tổng có trên sổ cái',
      await one('SELECT COALESCE(SUM(debit), 0) AS v FROM gl_lines'), await one('SELECT COALESCE(SUM(credit), 0) AS v FROM gl_lines'), 'Tổng nợ', 'Tổng có'),
    check('Không có bút toán lệch nợ có',
      await one('SELECT COUNT(*) AS v FROM (SELECT entry_id FROM gl_lines GROUP BY entry_id HAVING SUM(debit) <> SUM(credit)) x'), 0, 'Bút toán lệch', 'Cho phép'),
    check('Mỗi hóa đơn có đúng một bút toán',
      await one('SELECT COUNT(*) AS v FROM invoices'), await one("SELECT COUNT(*) AS v FROM gl_entries WHERE source_type = 'INVOICE'"), 'Số hóa đơn', 'Bút toán hóa đơn'),
    check('Tổng hóa đơn khớp doanh thu cộng thuế trên sổ', invoiceNet, glRevenue, 'Hóa đơn', 'Sổ cái'),
    check('Tiền mặt theo hóa đơn khớp sổ quỹ', invoiceCashSale, glCash, 'Hóa đơn tiền mặt', 'TK 1111'),
    check('Tổng dòng hóa đơn khớp đầu hóa đơn',
      await one('SELECT COALESCE(SUM(total), 0) AS v FROM invoices'), await one('SELECT COALESCE(SUM(gross_amount), 0) AS v FROM invoice_lines'), 'Đầu hóa đơn', 'Tổng dòng'),
    check('Mọi đơn đã thu tiền đều có hóa đơn',
      await one(`SELECT COUNT(*) AS v FROM bookings b LEFT JOIN invoices i ON i.booking_id = b.id AND i.invoice_type = 'SALE'
                  WHERE b.payment_status IN ('PAID', 'REFUND_PENDING', 'REFUNDED') AND i.id IS NULL
                    AND NOT EXISTS (SELECT 1 FROM gl_entries e WHERE e.source_type = 'HELD_REFUND' AND e.source_id = b.id)`), 0, 'Đơn thiếu hóa đơn', 'Cho phép'),
    check('Mọi đơn bán lẻ đều có hóa đơn',
      await one(`SELECT COUNT(*) AS v FROM service_orders o LEFT JOIN invoices i ON i.service_order_id = o.id AND i.invoice_type = 'SALE'
                  WHERE o.booking_id IS NULL AND i.id IS NULL`), 0, 'Đơn thiếu hóa đơn', 'Cho phép'),
    check('Số tiền hóa đơn khớp số tiền đơn đặt sân',
      await one("SELECT COALESCE(SUM(i.total), 0) AS v FROM invoices i WHERE i.invoice_type = 'SALE' AND i.booking_id IS NOT NULL"),
      await one("SELECT COALESCE(SUM(b.total_amount), 0) AS v FROM bookings b JOIN invoices i ON i.booking_id = b.id AND i.invoice_type = 'SALE'"), 'Hóa đơn', 'Đơn đặt sân'),
    check('Tiền PayOS báo về khớp sổ',
      await one("SELECT COALESCE(SUM(amount), 0) AS v FROM payment_transactions WHERE transaction_status = 'SUCCESS'"),
      await one(`SELECT COALESCE((SELECT SUM(i.total) FROM invoices i JOIN bookings b ON b.id = i.booking_id
                                   WHERE i.invoice_type = 'SALE' AND i.payment_method = 'VIETQR'), 0)
                      + COALESCE((SELECT SUM(l.credit) FROM gl_lines l JOIN gl_entries e ON e.id = l.entry_id WHERE e.source_type = 'HELD_RECEIPT'), 0) AS v`), 'Giao dịch PayOS', 'Hóa đơn + tiền giữ hộ'),
    check('Số hóa đơn liên tục, không nhảy số',
      await one('SELECT COALESCE(SUM(max_seq - cnt), 0) AS v FROM (SELECT MAX(seq) AS max_seq, COUNT(*) AS cnt FROM invoices GROUP BY series) x'), 0, 'Số bị thiếu', 'Cho phép'),
    check('Lương đã duyệt khớp chi phí trên sổ',
      await one(`SELECT COALESCE(SUM(p.gross_pay + p.si_employer + p.hi_employer + p.ui_employer), 0) AS v
                   FROM payslips p JOIN payroll_periods r ON r.id = p.period_id WHERE r.status IN ('APPROVED', 'PAID')`),
      await one("SELECT COALESCE(SUM(debit) - SUM(credit), 0) AS v FROM gl_lines WHERE account_code IN ('6421', '6422')"), 'Bảng lương', 'TK 6421, 6422'),
  ];
  return { checkedAt: new Date().toISOString(), allOk: checks.every((c) => c.ok), checks };
}

module.exports = { overview, trialBalance, vatSummary, reconciliation };
