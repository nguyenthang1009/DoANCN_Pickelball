import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { fullDate, vnd } from '../../lib/format';
import { Alert, Button, Card, CheckinBadge, PaymentBadge, Spinner } from '../../components/ui';

// US-C06: lịch sử đặt sân của khách, kèm thanh toán tiếp / xem vé / hủy
export default function MyBookings() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState('');
  const { notify, confirm } = useFeedback();

  const load = useCallback(() => api('/bookings/my').then((d) => setBookings(d.bookings)).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function cancel(b) {
    const paid = b.paymentStatus === 'PAID';
    const ok = await confirm({
      title: paid ? 'Hủy đơn đã thanh toán?' : 'Hủy giữ chỗ?',
      message: paid ? 'Sau khi hủy, quản lý cơ sở sẽ xử lý hoàn tiền cho bạn. Thao tác này không hoàn tác được.' : 'Ô lịch sẽ mở lại cho người khác đặt.',
      details: [['Mã đơn', b.bookingCode], ['Sân', b.courtName], ['Giờ chơi', `${b.startTime}–${b.endTime}`], ['Số tiền', vnd(b.totalAmount)]],
      tone: 'danger',
      confirmText: 'Hủy đơn',
      cancelText: 'Giữ lại',
    });
    if (!ok) return;
    try {
      const { booking } = await api(`/bookings/${b.bookingCode}/cancel`, { method: 'POST', body: {} });
      notify.success(booking.paymentStatus === 'REFUND_PENDING' ? 'Đã hủy đơn, quản lý cơ sở sẽ xử lý hoàn tiền cho bạn' : 'Đã hủy giữ chỗ');
      load();
    } catch (e) { notify.error(e.message); }
  }

  if (!bookings) return error ? <Alert>{error}</Alert> : <Spinner />;
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Lịch đặt của tôi</h1>
      {bookings.length === 0 && <Card><p className="text-slate-600">Bạn chưa có đơn đặt sân nào. <Link to="/dat-san" className="font-semibold text-teal-700">Đặt sân ngay</Link></p></Card>}
      <div className="grid gap-4 md:grid-cols-2">
        {bookings.map((b) => (
          <Card key={b.bookingCode} className="flex flex-col gap-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold">{b.courtName}</p>
                <p className="text-sm text-slate-600">{b.venueName}</p>
              </div>
              <PaymentBadge status={b.paymentStatus} />
            </div>
            <p>{fullDate(b.bookingDate)} · <span className="font-semibold">{b.startTime} – {b.endTime}</span></p>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{b.bookingCode}</span>
              <span className="font-semibold">{vnd(b.totalAmount)}</span>
            </div>
            {b.paymentStatus === 'PAID' && <div><CheckinBadge status={b.checkinStatus} /></div>}
            <div className="flex gap-2">
              {b.paymentStatus === 'PENDING_PAYMENT' && <Link to={`/thanh-toan/${b.bookingCode}`} className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white">Thanh toán</Link>}
              {b.paymentStatus === 'PAID' && <Link to={`/ve/${b.bookingCode}`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">Xem vé QR</Link>}
              {b.invoiceNo && <Link to={`/hoa-don/${b.invoiceNo}`} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold">Hóa đơn</Link>}
              {b.canCancelOnline && <Button kind="ghost" className="px-4 py-2 text-sm" onClick={() => cancel(b)}>Hủy đơn</Button>}
            </div>
            {b.paymentStatus === 'PAID' && b.checkinStatus === 'PENDING' && !b.canCancelOnline && (
              <p className="w-full text-xs text-slate-600">Còn dưới {b.cancelDeadlineHours} giờ trước giờ chơi nên không hủy online được, vui lòng liên hệ cơ sở.</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
