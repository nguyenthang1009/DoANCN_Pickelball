import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, fullDate, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import { Alert, Button, Card, PaymentBadge, Spinner } from '../../components/ui';

// UC20, US-M10: đơn chờ hoàn tiền (khách hủy, sân bảo trì, tiền về trễ khi ô đã có người)
export default function Refunds() {
  const scope = useVenueScope();
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const load = useCallback(() => {
    const q = scope.isAdmin && scope.venueId ? `?venueId=${scope.venueId}` : '';
    api(`/bookings/refunds${q}`).then((d) => setList(d.bookings)).catch((e) => setError(e.message));
  }, [scope.isAdmin, scope.venueId]);
  useEffect(() => { load(); }, [load]);

  async function confirm(b) {
    const note = window.prompt(`Ghi chú hoàn ${vnd(b.totalAmount)} cho ${b.customerName} (VD: mã giao dịch chuyển khoản):`, 'Đã chuyển khoản hoàn tiền');
    if (!note) return;
    setError(''); setNotice('');
    try { await api(`/bookings/${b.bookingCode}/refund`, { method: 'POST', body: { note } }); setNotice(`Đã xác nhận hoàn tiền đơn ${b.bookingCode}`); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <PageHeader title="Hoàn tiền" subtitle="Xác nhận sau khi đã chuyển trả tiền cho khách" scope={scope} allowAll />
      <Alert>{error}</Alert>
      <Alert kind="success">{notice}</Alert>
      <Card className="mt-4 overflow-x-auto p-0">
        {!list ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Mã đơn', 'Khách', 'Ngày chơi', 'Lý do', 'Hủy lúc', 'Số tiền', 'Trạng thái', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-600">Không có đơn nào chờ hoàn tiền.</td></tr>}
              {list.map((b) => (
                <tr key={b.bookingCode} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium">{b.bookingCode}</td>
                  <td className="px-4 py-3">{b.customerName}<div className="text-xs text-slate-600">{b.customerPhone}</div></td>
                  <td className="px-4 py-3">{fullDate(b.bookingDate)}</td>
                  <td className="px-4 py-3">{b.cancelReason || (b.paymentStatus === 'CONFLICT_REFUND_PENDING' ? 'Tiền về sau khi ô đã có người đặt' : '')}</td>
                  <td className="px-4 py-3">{dateTime(b.cancelledAt)}</td>
                  <td className="px-4 py-3 font-medium">{vnd(b.totalAmount)}</td>
                  <td className="px-4 py-3"><PaymentBadge status={b.paymentStatus} /></td>
                  <td className="px-4 py-3 text-right"><Button className="px-3 py-1 text-sm" onClick={() => confirm(b)}>Xác nhận đã hoàn</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
