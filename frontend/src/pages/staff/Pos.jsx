import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { fullDate, todayVN, vnd } from '../../lib/format';
import { useSlotsWatch } from '../../lib/socket';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import SlotMatrix, { Legend } from '../../components/SlotMatrix';
import ServiceCart, { cartItems, cartTotal } from '../../components/ServiceCart';
import QrPayPanel from '../../components/QrPayPanel';
import { Alert, Button, Card, Input, Spinner } from '../../components/ui';

// US-S04, US-S06: lễ tân đặt sân cho khách vãng lai, bán kèm dịch vụ, thu tiền mặt hoặc VietQR
export default function Pos() {
  const scope = useVenueScope();
  const { venueId } = scope;
  const { can } = useAuth();
  const { notify, confirm } = useFeedback();
  const [checkedIn, setCheckedIn] = useState(new Set());
  const [date, setDate] = useState(todayVN());
  const [data, setData] = useState(null);
  const [services, setServices] = useState([]);
  const [selection, setSelection] = useState(null);
  const [guest, setGuest] = useState({ name: '', phone: '' });
  const [cart, setCart] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [qrBooking, setQrBooking] = useState(null);

  const load = useCallback(() => {
    if (!venueId) return;
    api(`/venues/${venueId}/availability?date=${date}`).then(setData).catch((e) => setError(e.message));
    // Lịch công khai không lộ ai đã đến; danh sách đơn của cơ sở chỉ nhân sự có quyền mới xem được
    if (can('booking.view_venue')) {
      api(`/venues/${venueId}/bookings?date=${date}`).then((d) => setCheckedIn(new Set(
        d.bookings.filter((b) => b.checkinStatus === 'CHECKED_IN').flatMap((b) => b.slots.map((s) => `${s.courtId}_${s.startTime}`)),
      ))).catch(() => {});
    }
  }, [venueId, date, can]);
  useEffect(() => { setData(null); setSelection(null); load(); }, [load]);
  useEffect(() => { if (venueId) api(`/venues/${venueId}/services`).then((d) => setServices(d.services)).catch(() => {}); }, [venueId]);
  useSlotsWatch(venueId, date, load);

  const court = data?.courts.find((c) => c.id === selection?.courtId);
  const picked = court ? court.slots.slice(selection.startIdx, selection.endIdx + 1) : [];
  const courtTotal = picked.reduce((s, x) => s + x.price, 0);
  const serviceTotal = cartTotal(services, cart);
  const phoneOk = /^0\d{9}$/.test(guest.phone);

  const onCellClick = useCallback((c, idx) => {
    setSelection((sel) => {
      if (!sel || sel.courtId !== c.id) return { courtId: c.id, startIdx: idx, endIdx: idx };
      if (sel.startIdx === sel.endIdx && sel.startIdx === idx) return null;
      const start = Math.min(sel.startIdx, idx);
      const end = Math.max(sel.endIdx, idx);
      const ok = c.slots.slice(start, end + 1).every((s) => s.state === 'FREE') && (end - start + 1) * 30 <= data.limits.maxMinutes;
      return ok ? { courtId: c.id, startIdx: start, endIdx: end } : { courtId: c.id, startIdx: idx, endIdx: idx };
    });
  }, [data]);

  function reset() { setSelection(null); setCart({}); setGuest({ name: '', phone: '' }); }

  async function submit(paymentMethod) {
    if (paymentMethod === 'CASH') {
      const ok = await confirm({
        title: 'Xác nhận thu tiền mặt',
        message: 'Đơn sẽ được tạo và tính vào doanh thu ca của bạn.',
        details: [['Khách', `${guest.name.trim()} · ${guest.phone}`], ['Sân', court.name], ['Giờ chơi', `${picked[0].start}–${picked.at(-1).end}`], ['Tổng thu', vnd(courtTotal + serviceTotal)]],
        confirmText: 'Đã thu tiền',
        cancelText: 'Xem lại',
      });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const { booking } = await api('/bookings', {
        method: 'POST',
        body: { courtId: court.id, date, start: picked[0].start, end: picked.at(-1).end, guestName: guest.name.trim(), guestPhone: guest.phone, paymentMethod, services: cartItems(cart) },
      });
      if (paymentMethod === 'CASH') { notify.success(`Đã thu ${vnd(booking.totalAmount)} tiền mặt · đơn ${booking.bookingCode}`); reset(); }
      else setQrBooking(booking);
      load();
    } catch (e) { notify.error(e.message); load(); } finally { setBusy(false); }
  }

  const ready = picked.length * 30 >= (data?.limits.minMinutes ?? 60) && guest.name.trim() && phoneOk;

  return (
    <div>
      <PageHeader title="Đặt tại quầy" subtitle={`${fullDate(date)} · ${data?.dayType === 'WEEKEND' ? 'Giá cuối tuần' : 'Giá ngày thường'}`} scope={scope}>
        <Input label="Ngày" type="date" value={date} min={todayVN()} onChange={(e) => setDate(e.target.value)} />
      </PageHeader>
      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Alert>{error}</Alert>
          <Card className="p-4">
            <p className="mb-2 font-semibold">Lịch sân {data?.venue.name}</p>
            {data ? <SlotMatrix courts={data.courts} selection={selection} onCellClick={onCellClick} compact checkedIn={checkedIn} /> : <Spinner />}
          </Card>
          <Legend showCheckedIn />
        </div>
        <Card className="flex flex-col gap-3 p-4">
          <h2 className="text-xl font-semibold">Đơn mới tại quầy</h2>
          {qrBooking ? (
            <QrPayPanel booking={qrBooking} onPaid={(b) => { notify.success(`Đã nhận chuyển khoản ${vnd(b.totalAmount)} · đơn ${b.bookingCode}`); setQrBooking(null); reset(); load(); }} onClose={() => { setQrBooking(null); reset(); }} />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Input label="Tên khách" value={guest.name} onChange={(e) => setGuest({ ...guest, name: e.target.value })} />
                <Input label="Số điện thoại" inputMode="numeric" value={guest.phone} onChange={(e) => setGuest({ ...guest, phone: e.target.value })} error={guest.phone && !phoneOk ? 'Cần 10 chữ số' : ''} />
              </div>
              <div className="flex items-center justify-between font-semibold">
                <span>{court ? `${court.name.replace(/\s*\(.*\)/, '')} · ${picked[0].start}–${picked.at(-1).end} (${picked.length} ô)` : 'Chọn ô trống trên lịch'}</span>
                <span>{vnd(courtTotal)}</span>
              </div>
              <ServiceCart services={services} cart={cart} onChange={setCart} />
              <hr className="border-slate-200" />
              <div className="flex justify-between text-sm"><span className="text-slate-600">Tiền sân</span><span>{vnd(courtTotal)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-600">Dịch vụ</span><span>{vnd(serviceTotal)}</span></div>
              <div className="flex items-center justify-between"><span className="font-semibold">Tổng cộng</span><span className="text-xl font-semibold">{vnd(courtTotal + serviceTotal)}</span></div>
              <div className="flex gap-2">
                <Button kind="secondary" className="flex-1" disabled={!ready} loading={busy} onClick={() => submit('VIETQR')}>VietQR</Button>
                <Button className="flex-1" disabled={!ready} loading={busy} onClick={() => submit('CASH')}>Thu tiền mặt</Button>
              </div>
              {!ready && <p className="text-xs text-slate-600">Cần chọn tối thiểu {data?.limits.minMinutes ?? 60} phút, nhập tên và số điện thoại khách.</p>}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
