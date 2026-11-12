const HttpError = require('../utils/httpError');

// Ghi một bút toán kép trong transaction của nghiệp vụ gốc: nghiệp vụ lỗi thì sổ cũng không ghi.
// lines: [[mã tài khoản, nợ, có], ...]. Tổng nợ phải bằng tổng có, nếu không dừng cả nghiệp vụ.
async function post(conn, { date, venueId, sourceType, sourceId, memo, actorId = null, lines }) {
  const rows = lines.filter(([, debit, credit]) => debit > 0 || credit > 0);
  const debit = rows.reduce((sum, l) => sum + l[1], 0);
  const credit = rows.reduce((sum, l) => sum + l[2], 0);
  if (!rows.length || debit !== credit) {
    throw new HttpError(500, 'UNBALANCED_ENTRY', `Bút toán ${sourceType} #${sourceId} lệch: nợ ${debit}, có ${credit}`);
  }
  const [res] = await conn.query(
    'INSERT INTO gl_entries (entry_date, venue_id, source_type, source_id, memo, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [date, venueId, sourceType, sourceId, memo.slice(0, 255), actorId],
  );
  await conn.query('INSERT INTO gl_lines (entry_id, account_code, debit, credit) VALUES ?', [rows.map(([account, d, c]) => [res.insertId, account, d, c])]);
  return res.insertId;
}

module.exports = { post };
