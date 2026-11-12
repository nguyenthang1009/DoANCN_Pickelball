import { useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../lib/api';
import { vnd } from '../lib/format';
import { useBookingWatch } from '../lib/socket';
import { Alert, Button, Spinner } from './ui';

// Mã VietQR cho đơn tại quầy khách chọn chuyển khoản; tự báo khi webhook xác nhận
export default function QrPayPanel({ booking, onPaid, onClose }) {
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api(`/bookings/${booking.bookingCode}/payment-link`, { method: 'POST', body: {} }).then((d) => setPayment(d.payment)).catch((e) => setError(e.message));
  }, [booking.bookingCode]);

  const refresh = useCallback(async () => {
    const { booking: b } = await api(`/bookings/${booking.bookingCode}`);
    if (b.paymentStatus === 'PAID') onPaid(b);
  }, [booking.bookingCode, onPaid]);
  useBookingWatch(booking.bookingCode, refresh);

  async function simulate() {
    setBusy(true);
    try { await api(`/payments/mock/${booking.bookingCode}/pay`, { method: 'POST', body: {} }); await refresh(); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-teal-700 p-4 text-center">
      <p className="font-semibold">Khách quét VietQR · {booking.bookingCode}</p>
      <Alert>{error}</Alert>
      {payment ? <QRCodeSVG value={payment.qrCode} size={180} aria-label="Mã VietQR tại quầy" /> : !error && <Spinner label="Đang tạo mã…" />}
      <p className="text-xl font-semibold">{vnd(booking.totalAmount)}</p>
      {payment?.mode === 'mock' && <Button kind="secondary" className="w-full" loading={busy} onClick={simulate}>Giả lập khách chuyển khoản</Button>}
      <Button kind="ghost" className="w-full" onClick={onClose}>Đóng (giữ chỗ vẫn còn hiệu lực)</Button>
    </div>
  );
}
