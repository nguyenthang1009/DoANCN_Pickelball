import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { api } from '../../lib/api';
import { useBookingWatch } from '../../lib/socket';
import BookingSummary from '../../components/BookingSummary';
import Countdown from '../../components/Countdown';
import { Alert, Button, Card, Spinner } from '../../components/ui';

// Trang giữ chỗ / thanh toán: đếm ngược 10 phút, tự chuyển sang vé khi đơn được xác nhận
export default function Payment() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/bookings/${code}`).then((d) => {
      if (d.booking.paymentStatus === 'PAID') navigate(`/ve/${code}`, { replace: true });
      else setBooking(d.booking);
    }).catch((e) => setError(e.message));
  }, [code, navigate]);

  useEffect(load, [load]);
  useBookingWatch(code, load);

  async function cancel() {
    setBusy(true);
    try { setBooking((await api(`/bookings/${code}/cancel`, { method: 'POST', body: {} })).booking); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  if (!booking) return error ? <Alert>{error}</Alert> : <Spinner />;
  const pending = booking.paymentStatus === 'PENDING_PAYMENT';

  return (
    <div className="mx-auto flex max-w-4xl flex-col items-center gap-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold">{pending ? 'Thanh toán giữ chỗ' : 'Đơn không còn giữ chỗ'}</h1>
        <p className="text-sm text-slate-600">
          {pending ? 'Ô lịch đang được giữ riêng cho bạn. Hết giờ, chỗ sẽ trả lại cho người khác.' : 'Đơn đã hết hạn hoặc đã hủy, vui lòng đặt lại.'}
        </p>
      </div>
      <Alert>{error}</Alert>
      <div className="grid w-full gap-6 md:grid-cols-2">
        <Card className="flex flex-col items-center gap-4 text-center">
          {pending ? (
            <>
              <Countdown seconds={booking.holdSecondsLeft ?? 0} onEnd={load} />
              <p className="text-sm text-slate-600">Thanh toán VietQR sẽ được bật ở tuần 8.</p>
            </>
          ) : (
            <Link to="/" className="font-semibold text-teal-700">← Chọn khung giờ khác</Link>
          )}
        </Card>
        <Card>
          <BookingSummary booking={booking} />
          {pending && <Button kind="ghost" className="mt-4 w-full" loading={busy} onClick={cancel}>Hủy giữ chỗ</Button>}
        </Card>
      </div>
    </div>
  );
}
