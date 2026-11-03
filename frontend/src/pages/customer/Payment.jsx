import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { vnd } from '../../lib/format';
import { useBookingWatch } from '../../lib/socket';
import BookingSummary from '../../components/BookingSummary';
import Countdown from '../../components/Countdown';
import { Alert, Button, Card, Spinner } from '../../components/ui';

// Trang thanh toán VietQR: mã QR từ PayOS, đếm ngược giữ chỗ, tự chuyển sang vé khi webhook xác nhận
export default function Payment() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [booking, setBooking] = useState(null);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try {
      const { booking: b } = await api(`/bookings/${code}`);
      if (b.paymentStatus === 'PAID') { navigate(`/ve/${code}`, { replace: true }); return; }
      setBooking(b);
      if (b.paymentStatus === 'PENDING_PAYMENT' && b.holdSecondsLeft > 0) {
        setPayment((await api(`/bookings/${code}/payment-link`, { method: 'POST', body: {} })).payment);
      }
    } catch (e) { setError(e.message); }
  }, [code, navigate]);

  useEffect(() => { load(); }, [load]);
  useBookingWatch(code, load);

  async function cancel() {
    setBusy('cancel');
    try { setBooking((await api(`/bookings/${code}/cancel`, { method: 'POST', body: {} })).booking); setPayment(null); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  // Chế độ mock: giả lập ngân hàng gửi webhook PayOS báo đã nhận tiền
  async function simulate() {
    setBusy('pay');
    try { await api(`/payments/mock/${code}/pay`, { method: 'POST', body: {} }); await load(); } catch (e) { setError(e.message); } finally { setBusy(''); }
  }

  if (!booking) return error ? <Alert>{error}</Alert> : <Spinner />;
  const pending = booking.paymentStatus === 'PENDING_PAYMENT' && booking.holdSecondsLeft > 0;

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
              <Countdown seconds={booking.holdSecondsLeft} onEnd={load} />
              {payment ? <QRCodeSVG value={payment.qrCode} size={240} marginSize={2} aria-label="Mã VietQR" /> : <Spinner label="Đang tạo mã VietQR…" />}
              <p className="text-[32px] font-bold">{vnd(booking.totalAmount)}</p>
              <p className="text-sm text-slate-600">Mở app ngân hàng, chọn Quét QR. Số tiền và nội dung chuyển khoản <b>{payment?.description}</b> đã điền sẵn.</p>
              {payment?.checkoutUrl && <a href={payment.checkoutUrl} className="text-sm font-semibold text-teal-700" target="_blank" rel="noreferrer">Mở trang thanh toán PayOS</a>}
              {payment?.mode === 'mock' && (
                <div className="w-full rounded-lg bg-slate-50 p-3 text-left text-xs text-slate-600">
                  Đang chạy chế độ thử (chưa cấu hình khóa PayOS). Nút dưới gửi một webhook ký đúng chuẩn PayOS như khi ngân hàng báo đã nhận tiền.
                  <Button kind="secondary" className="mt-2 w-full" loading={busy === 'pay'} onClick={simulate}>Giả lập chuyển khoản thành công</Button>
                </div>
              )}
            </>
          ) : (
            <Link to="/" className="font-semibold text-teal-700">← Chọn khung giờ khác</Link>
          )}
        </Card>
        <Card>
          <BookingSummary booking={booking} />
          <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Trang tự chuyển sang vé điện tử ngay khi PayOS báo đã nhận tiền. Không cần tải lại trang.</p>
          {pending && <Button kind="ghost" className="mt-4 w-full" loading={busy === 'cancel'} onClick={cancel}>Hủy giữ chỗ</Button>}
        </Card>
      </div>
    </div>
  );
}
