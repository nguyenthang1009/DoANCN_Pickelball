import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { todayVN, vnd } from '../../lib/format';
import { useSlotsWatch } from '../../lib/socket';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import { Alert, Button, Card, CheckinBadge, Input, PaymentBadge, Spinner } from '../../components/ui';

// Danh sách đơn trong ngày của cơ sở; Manager/Admin hủy được đơn (chuyển chờ hoàn tiền)
export default function DayBookings() {
  const { can } = useAuth();
  const { notify, confirm } = useFeedback();
  const scope = useVenueScope();
  const [date, setDate] = useState(todayVN());
  const [list, setList] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    if (scope.venueId) api(`/venues/${scope.venueId}/bookings?date=${date}`).then((d) => setList(d.bookings)).catch((e) => setError(e.message));
  }, [scope.venueId, date]);
  useEffect(() => { load(); }, [load]);
  useSlotsWatch(scope.venueId, date, load);

  async function cancel(b) {
    const paid = b.paymentStatus === 'PAID';
    const answer = await confirm({
      title: paid ? 'Hủy đơn đã thanh toán?' : 'Hủy giữ chỗ?',
      message: paid ? 'Đơn chuyển sang chờ hoàn tiền. Thao tác này không hoàn tác được.' : 'Ô lịch sẽ mở lại ngay.',
      details: [['Mã đơn', b.bookingCode], ['Khách', b.customerName], ['Số tiền', vnd(b.totalAmount)]],
      tone: 'danger',
      confirmText: 'Hủy đơn',
      cancelText: 'Giữ lại',
      input: paid ? { label: 'Lý do hủy', placeholder: 'VD: Khách báo bận đột xuất' } : undefined,
    });
    if (!answer) return;
    try {
      await api(`/bookings/${b.bookingCode}/cancel`, { method: 'POST', body: { reason: paid ? answer : 'Hủy giữ chỗ tại quầy' } });
      notify.success(`Đã hủy đơn ${b.bookingCode}`);
      load();
    } catch (e) { notify.error(e.message); }
  }

  const canCancel = can('booking.cancel');
  return (
    <div>
      <PageHeader title="Đơn trong ngày" subtitle={list ? `${list.length} đơn` : ''} scope={scope}>
        <Input label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </PageHeader>
      <Alert>{error}</Alert>
      <Card className="overflow-x-auto p-0">
        {!list ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Mã đơn', 'Khách', 'Sân · giờ', 'Nguồn', 'Tổng', 'Thanh toán', 'Check-in', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-600">Chưa có đơn nào.</td></tr>}
              {list.map((b) => (
                <tr key={b.bookingCode} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-medium">{b.bookingCode}</td>
                  <td className="px-4 py-3">{b.customerName}<div className="text-xs text-slate-600">{b.customerPhone}</div></td>
                  <td className="px-4 py-3">{b.courtName?.replace(/\s*\(.*\)/, '')} · {b.startTime}–{b.endTime}</td>
                  <td className="px-4 py-3">{b.source === 'POS' ? 'Tại quầy' : 'Online'}</td>
                  <td className="px-4 py-3">{vnd(b.totalAmount)}</td>
                  <td className="px-4 py-3"><PaymentBadge status={b.paymentStatus} /></td>
                  <td className="px-4 py-3">{b.paymentStatus === 'PAID' ? <CheckinBadge status={b.checkinStatus} /> : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {canCancel && (b.paymentStatus === 'PENDING_PAYMENT' || (b.paymentStatus === 'PAID' && b.checkinStatus === 'PENDING')) && (
                      <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => cancel(b)}>Hủy</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
