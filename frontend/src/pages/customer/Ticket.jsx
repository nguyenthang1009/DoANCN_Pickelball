import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { api } from '../../lib/api';
import { fullDate, minutesOf, vnd } from '../../lib/format';
import { useBookingWatch } from '../../lib/socket';
import { Alert, Card, CheckinBadge, PaymentBadge, Spinner } from '../../components/ui';

// Vé điện tử: mã QR chứa mã đơn + chữ ký HMAC (BR13), lễ tân quét để nhận sân
export default function Ticket() {
  const { code } = useParams();
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api(`/bookings/${code}`).then((d) => setBooking(d.booking)).catch((e) => setError(e.message)), [code]);
  useEffect(() => { load(); }, [load]);
  useBookingWatch(code, load);

  if (!booking) return error ? <Alert>{error}</Alert> : <Spinner />;
  const opensAt = minutesOf(booking.startTime) - booking.checkinEarlyMinutes;
  const opens = `${String(Math.floor(opensAt / 60)).padStart(2, '0')}:${String(opensAt % 60).padStart(2, '0')}`;

  return (
    <div className="mx-auto flex max-w-sm flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Vé của bạn</h1>
        <PaymentBadge status={booking.paymentStatus} />
      </div>
      <Card className="flex flex-col items-center gap-4">
        <div className="w-full">
          <p className="text-xl font-semibold">{booking.courtName}</p>
          <p className="text-xs text-slate-600">{booking.venueName}</p>
        </div>
        <div className="flex w-full items-center justify-between rounded-lg bg-teal-50 px-4 py-3">
          <div><p className="text-xs text-slate-600">{fullDate(booking.bookingDate).split(',')[0]}</p><p className="font-semibold">{fullDate(booking.bookingDate).split(', ')[1]}</p></div>
          <div className="text-right"><p className="text-xs text-slate-600">{booking.slots.length} ô · {booking.slots.length * 30} phút</p><p className="font-semibold">{booking.startTime} – {booking.endTime}</p></div>
        </div>
        {booking.qrPayload ? <QRCodeSVG value={booking.qrPayload} size={200} aria-label="Mã QR check-in" /> : <Alert kind="warning">Vé chưa có hiệu lực ({booking.paymentStatus}).</Alert>}
        <p className="font-semibold">{booking.bookingCode}</p>
        <div className="flex w-full flex-col gap-2 border-t border-dashed border-slate-200 pt-3 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Khách hàng</span><span>{booking.customerName}</span></div>
          <div className="flex justify-between"><span className="text-slate-600">Đã thanh toán</span><span>{vnd(booking.totalAmount)} · {booking.paymentMethod === 'CASH' ? 'Tiền mặt' : 'VietQR'}</span></div>
          <div className="flex items-center justify-between"><span className="text-slate-600">Check-in</span><CheckinBadge status={booking.checkinStatus} /></div>
        </div>
      </Card>
      <p className="rounded-lg bg-white px-3 py-2 text-xs text-slate-600">Đưa mã QR cho lễ tân từ {opens}. Hủy online được đến trước giờ chơi {booking.cancelDeadlineHours} giờ, quản lý cơ sở sẽ xử lý hoàn tiền.</p>
      {booking.invoiceNo && <Link to={`/hoa-don/${booking.invoiceNo}`} className="text-center text-sm font-semibold text-teal-700">Xem hóa đơn {booking.invoiceNo}</Link>}
      <Link to="/lich-dat" className="text-center text-sm font-semibold text-teal-700">← Lịch đặt của tôi</Link>
    </div>
  );
}
