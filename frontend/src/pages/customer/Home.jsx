import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useSlotsWatch } from '../../lib/socket';
import { fullDate, todayVN, vnd } from '../../lib/format';
import DateStrip from '../../components/DateStrip';
import SlotMatrix, { Legend } from '../../components/SlotMatrix';
import { Alert, Button, Card, Select, Spinner } from '../../components/ui';

// Màn ma trận chọn sân: chọn cơ sở, ngày, kéo chọn các ô liền nhau trên một sân rồi giữ chỗ
export default function Home() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  const [venueId, setVenueId] = useState(null);
  const [date, setDate] = useState(todayVN());
  const [data, setData] = useState(null);
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState('');
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    api('/venues').then((d) => { setVenues(d.venues); setVenueId((id) => id ?? d.venues[0]?.id ?? null); }).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    if (!venueId) return;
    api(`/venues/${venueId}/availability?date=${date}`).then(setData).catch((e) => setError(e.message));
  }, [venueId, date]);

  useEffect(() => { setData(null); setSelection(null); load(); }, [load]);

  // Ô đang chọn bị người khác giữ mất -> bỏ chọn
  useEffect(() => {
    if (!data || !selection) return;
    const c = data.courts.find((x) => x.id === selection.courtId);
    if (!c || c.slots.slice(selection.startIdx, selection.endIdx + 1).some((s) => s.state !== 'FREE')) {
      setSelection(null);
      setError('Một ô bạn đang chọn vừa có người giữ chỗ, vui lòng chọn lại.');
    }
  }, [data, selection]);

  const limits = data?.limits;
  const court = data?.courts.find((c) => c.id === selection?.courtId);
  const picked = court ? court.slots.slice(selection.startIdx, selection.endIdx + 1) : [];
  const minutes = picked.length * 30;
  const total = picked.reduce((s, x) => s + x.price, 0);
  const tooShort = limits && minutes > 0 && minutes < limits.minMinutes;

  // Chọn một ô bắt đầu, bấm ô khác cùng sân để mở rộng; ô xen giữa phải trống, không vượt thời lượng tối đa
  const onCellClick = useCallback((c, idx) => {
    setSelection((sel) => {
      if (!sel || sel.courtId !== c.id) return { courtId: c.id, startIdx: idx, endIdx: idx };
      if (sel.startIdx === sel.endIdx && sel.startIdx === idx) return null;
      const start = Math.min(sel.startIdx, idx);
      const end = Math.max(sel.endIdx, idx);
      const range = c.slots.slice(start, end + 1);
      const fits = range.every((s) => s.state === 'FREE') && range.length * 30 <= limits.maxMinutes;
      return fits ? { courtId: c.id, startIdx: start, endIdx: end } : { courtId: c.id, startIdx: idx, endIdx: idx };
    });
  }, [limits]);

  const venue = useMemo(() => venues.find((v) => v.id === venueId), [venues, venueId]);

  // Ô đổi trạng thái ở máy khác (giữ chỗ, thanh toán, hết hạn) -> tải lại ma trận ngay
  useSlotsWatch(venueId, date, load);

  async function hold() {
    if (!user) { navigate('/dang-nhap', { state: { from: '/' } }); return; }
    if (user.role !== 'CUSTOMER') { navigate('/pos'); return; }
    setError(''); setHolding(true);
    try {
      const { booking } = await api('/bookings', { method: 'POST', body: { courtId: court.id, date, start: picked[0].start, end: picked.at(-1).end } });
      navigate(`/thanh-toan/${booking.bookingCode}`);
    } catch (err) {
      setError(err.message);
      setSelection(null);
      load();
    } finally {
      setHolding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Đặt sân</h1>
          {venue && <p className="text-sm text-slate-600">{venue.address} · Mở cửa {venue.openTime}–{venue.closeTime}{limits && ` · Đặt ${limits.minMinutes}–${limits.maxMinutes} phút`}</p>}
        </div>
        <Select label="Cơ sở" value={venueId ?? ''} onChange={(e) => setVenueId(Number(e.target.value))} className="w-72">
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
      </div>

      <DateStrip start={todayVN()} days={limits?.maxAdvanceDays ?? 14} value={date} onChange={setDate} />
      <Alert>{error}</Alert>

      <Card className="p-4">
        {data ? (
          <>
            <div className="mb-3 flex items-center justify-between text-sm">
              <span className="font-semibold">{fullDate(date)}</span>
              <span className="text-slate-600">{data.holiday ? `Ngày lễ: ${data.holiday} · ` : ''}{data.dayType === 'WEEKEND' ? 'Giá cuối tuần' : 'Giá ngày thường'} · giá mỗi ô 30 phút</span>
            </div>
            <SlotMatrix courts={data.courts} selection={selection} onCellClick={onCellClick} />
          </>
        ) : <Spinner />}
      </Card>
      <Legend />

      {picked.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-10 px-4">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-700 bg-white px-6 py-4 shadow-lg">
            <div>
              <p className="font-semibold">{court.name} · {fullDate(date)}</p>
              <p className="text-sm text-slate-600">
                {picked[0].start} – {picked.at(-1).end} · {picked.length} ô
                {tooShort && <span className="ml-2 text-red-700">Cần đặt tối thiểu {limits.minMinutes} phút</span>}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-slate-600">Tạm tính</p>
                <p className="text-xl font-semibold">{vnd(total)}</p>
              </div>
              <Button kind="ghost" onClick={() => setSelection(null)}>Bỏ chọn</Button>
              <Button onClick={hold} loading={holding} disabled={tooShort}>Giữ chỗ {limits?.holdMinutes} phút</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
