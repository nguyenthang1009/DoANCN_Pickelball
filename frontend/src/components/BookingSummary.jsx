import { fullDate, vnd } from '../lib/format';
import { CheckinBadge, PaymentBadge } from './ui';

const Row = ({ label, children, strong }) => (
  <div className="flex items-center justify-between gap-4">
    <span className="text-sm text-slate-600">{label}</span>
    <span className={strong ? 'text-xl font-semibold' : 'text-sm text-right'}>{children}</span>
  </div>
);

// Tóm tắt một đơn đặt sân, dùng ở trang thanh toán, vé, check-in
export default function BookingSummary({ booking, showCheckin = false }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{booking.bookingCode}</h2>
        <PaymentBadge status={booking.paymentStatus} />
      </div>
      <Row label="Cơ sở">{booking.venueName}</Row>
      <Row label="Sân">{booking.courtName}</Row>
      <Row label="Ngày chơi">{fullDate(booking.bookingDate)}</Row>
      <Row label="Giờ chơi">{booking.startTime} – {booking.endTime} · {booking.slots.length} ô</Row>
      <Row label="Khách hàng">{booking.customerName}{booking.isGuest ? ' (vãng lai)' : ''}</Row>
      {booking.totalServiceAmount > 0 && <Row label="Dịch vụ">{vnd(booking.totalServiceAmount)}</Row>}
      {showCheckin && <Row label="Check-in"><CheckinBadge status={booking.checkinStatus} /></Row>}
      {booking.cancelReason && <Row label="Lý do hủy">{booking.cancelReason}</Row>}
      <hr className="border-slate-200" />
      <Row label="Tổng tiền" strong>{vnd(booking.totalAmount)}</Row>
    </div>
  );
}
