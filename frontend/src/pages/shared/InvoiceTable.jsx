import { Link } from 'react-router';
import { dateTime, vnd } from '../../lib/format';
import { Badge } from '../../components/ui';

// Bảng hóa đơn dùng chung cho khách và nhân sự
export default function InvoiceTable({ invoices, showVenue = false }) {
  const headers = ['Số hóa đơn', 'Loại', ...(showVenue ? ['Cơ sở'] : []), 'Người mua', 'Thời gian', 'Thanh toán', 'Chưa thuế', 'Thuế', 'Tổng'];
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-xs text-slate-600"><tr>{headers.map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {invoices.length === 0 && <tr><td colSpan={headers.length} className="px-4 py-8 text-center text-slate-600">Chưa có hóa đơn nào.</td></tr>}
          {invoices.map((i) => (
            <tr key={i.invoiceNo} className="border-t border-slate-200">
              <td className="px-4 py-3 font-semibold"><Link to={`/hoa-don/${i.invoiceNo}`} className="text-teal-700 hover:underline">{i.invoiceNo}</Link></td>
              <td className="px-4 py-3">{i.type === 'CREDIT' ? <Badge tone="amber">Điều chỉnh giảm</Badge> : <Badge tone="green">Bán hàng</Badge>}</td>
              {showVenue && <td className="px-4 py-3">{i.venueName}</td>}
              <td className="px-4 py-3">{i.buyerName}</td>
              <td className="px-4 py-3">{dateTime(i.createdAt)}</td>
              <td className="px-4 py-3">{i.paymentMethod === 'CASH' ? 'Tiền mặt' : 'VietQR'}</td>
              <td className="px-4 py-3">{vnd(i.subtotal)}</td>
              <td className="px-4 py-3">{vnd(i.vatAmount)}</td>
              <td className="px-4 py-3 font-semibold">{i.type === 'CREDIT' ? '−' : ''}{vnd(i.total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
