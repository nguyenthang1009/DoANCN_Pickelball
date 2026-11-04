import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dateTime, vnd } from '../../lib/format';
import { Ball } from '../../components/motion';
import { Alert, Button, Spinner } from '../../components/ui';

const percent = (bp) => `${(bp / 100).toLocaleString('vi-VN')}%`;

// Hóa đơn in được. Chưa kết nối nhà cung cấp hóa đơn điện tử nên đây là chứng từ nội bộ, ghi rõ trên hóa đơn.
export default function InvoiceDetail() {
  const { no } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/invoices/${no}`).then((d) => setInvoice(d.invoice)).catch((e) => setError(e.message)); }, [no]);

  if (!invoice) return <div className="p-6">{error ? <Alert>{error}</Alert> : <Spinner label="Đang tải hóa đơn…" />}</div>;
  const credit = invoice.type === 'CREDIT';
  return (
    <div className="mx-auto max-w-3xl p-4 lg:py-8">
      <div className="no-print mb-4 flex items-center justify-between">
        <button type="button" onClick={() => navigate(-1)} className="text-sm font-semibold text-teal-700">← Quay lại</button>
        <Button onClick={() => window.print()}>In hóa đơn</Button>
      </div>
      <article className="invoice-paper page-enter">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-slate-900 pb-4">
          <div>
            <p className="flex items-center gap-2 text-lg font-black italic"><Ball className="h-5 w-5" />{invoice.seller.name || 'Hệ thống sân Pickleball'}</p>
            {invoice.seller.address && <p className="text-sm text-slate-600">{invoice.seller.address}</p>}
            <p className="text-sm text-slate-600">Mã số thuế: {invoice.seller.taxCode || 'chưa cập nhật'}{invoice.seller.hotline ? ` · ${invoice.seller.hotline}` : ''}</p>
            <p className="text-sm text-slate-600">Cơ sở: {invoice.venueName}</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-black uppercase">{credit ? 'Hóa đơn điều chỉnh giảm' : 'Hóa đơn bán hàng'}</h1>
            <p className="font-semibold">Số {invoice.invoiceNo}</p>
            <p className="text-sm text-slate-600">{dateTime(invoice.createdAt)}</p>
            {credit && <p className="text-sm text-red-700">Điều chỉnh cho {invoice.originalNo}</p>}
          </div>
        </header>

        <dl className="grid gap-x-6 gap-y-1 py-4 text-sm sm:grid-cols-2">
          <div className="flex gap-2"><dt className="text-slate-600">Người mua:</dt><dd className="font-semibold">{invoice.buyerName}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-600">Điện thoại:</dt><dd>{invoice.buyerPhone || '—'}</dd></div>
          <div className="flex gap-2"><dt className="text-slate-600">Thanh toán:</dt><dd>{invoice.paymentMethod === 'CASH' ? 'Tiền mặt' : 'Chuyển khoản VietQR'}</dd></div>
          {invoice.bookingCode && <div className="flex gap-2"><dt className="text-slate-600">Mã đơn:</dt><dd>{invoice.bookingCode}</dd></div>}
        </dl>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-y border-slate-900 text-left">
                <th className="py-2 pr-2 font-semibold">Nội dung</th><th className="px-2 text-right font-semibold">SL</th>
                <th className="px-2 text-right font-semibold">Chưa thuế</th><th className="px-2 text-right font-semibold">Thuế</th><th className="pl-2 text-right font-semibold">Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {invoice.lines.map((l, i) => (
                <tr key={i} className="border-b border-slate-200">
                  <td className="py-2 pr-2">{l.description}</td><td className="px-2 text-right">{l.quantity} {l.unit.toLowerCase()}</td>
                  <td className="px-2 text-right">{vnd(l.net)}</td><td className="px-2 text-right">{vnd(l.vat)}</td><td className="pl-2 text-right font-medium">{vnd(l.gross)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="ml-auto mt-4 w-full max-w-xs text-sm">
          <div className="flex justify-between py-1"><dt>Cộng tiền hàng</dt><dd>{vnd(invoice.subtotal)}</dd></div>
          <div className="flex justify-between py-1"><dt>Thuế GTGT ({percent(invoice.vatRateBp)})</dt><dd>{vnd(invoice.vatAmount)}</dd></div>
          <div className="flex justify-between border-t-2 border-slate-900 py-2 text-lg font-black"><dt>{credit ? 'Hoàn lại' : 'Tổng thanh toán'}</dt><dd>{vnd(invoice.total)}</dd></div>
        </dl>

        <p className="mt-6 border-t border-dashed border-slate-300 pt-3 text-xs text-slate-600">
          Chứng từ nội bộ của hệ thống, chưa phải hóa đơn điện tử có mã của cơ quan thuế. Giá đã bao gồm thuế GTGT.
          {invoice.issuedBy ? ` Người lập: ${invoice.issuedBy}.` : ' Phát hành tự động khi nhận thanh toán.'}
        </p>
      </article>
      {user.role === 'CUSTOMER' && <Link to="/hoa-don" className="no-print mt-4 block text-center text-sm font-semibold text-teal-700">Tất cả hóa đơn của tôi</Link>}
    </div>
  );
}
