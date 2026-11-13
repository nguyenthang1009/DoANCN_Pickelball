import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useAuth, homeFor } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { useSite } from '../../lib/site';
import { useSlotsWatch } from '../../lib/socket';
import { fullDate, todayVN, vnd } from '../../lib/format';
import DateStrip from '../../components/DateStrip';
import SlotMatrix, { Legend } from '../../components/SlotMatrix';
import { ImageRotator, Reveal } from '../../components/motion';
import { Alert, Button, Card, Select, Spinner } from '../../components/ui';

const BANNER = ['booking.banner.1', 'booking.banner.2', 'booking.banner.3', 'booking.banner.4', 'booking.banner.5'];
const TIPS = [
  { key: 'booking.tip.1', title: 'Rủ bạn cùng chơi', text: 'Một sân đủ cho 4 người đánh đôi, chia tiền sân là vừa đẹp.' },
  { key: 'booking.tip.2', title: 'Thuê vợt tại quầy', text: 'Quên vợt cũng không sao, lễ tân có sẵn vợt, bóng và nước uống.' },
  { key: 'booking.tip.3', title: 'Đưa mã QR là vào sân', text: 'Thanh toán xong, vé QR nằm ngay trong Lịch đặt của bạn.' },
];
const COURT_TYPES = [['ALL', 'Tất cả sân'], ['OUTDOOR', 'Ngoài trời'], ['INDOOR', 'Trong nhà']];

// Màn ma trận chọn sân: chọn cơ sở, ngày, kéo chọn các ô liền nhau trên một sân rồi giữ chỗ
export default function Home() {
  const { user } = useAuth();
  // Nhân sự và Admin không đặt sân như khách: tránh tự giữ chỗ cho mình hay người quen mà không qua quầy
  const internal = Boolean(user && user.role !== 'CUSTOMER');
  const { notify } = useFeedback();
  const { media } = useSite();
  const navigate = useNavigate();
  const [venues, setVenues] = useState([]);
  // Trang chủ chuyển sang kèm ?venue=&date= để mở đúng cơ sở, đúng ngày khách đã chọn
  const [params] = useSearchParams();
  const [venueId, setVenueId] = useState(Number(params.get('venue')) || null);
  const [date, setDate] = useState(/^\d{4}-\d{2}-\d{2}$/.test(params.get('date') || '') ? params.get('date') : todayVN());
  const [data, setData] = useState(null);
  const [courtType, setCourtType] = useState(['OUTDOOR', 'INDOOR'].includes(params.get('type')) ? params.get('type') : 'ALL');
  const [selection, setSelection] = useState(null);
  const [error, setError] = useState('');
  const [holding, setHolding] = useState(false);

  useEffect(() => {
    api('/venues').then((d) => { setVenues(d.venues); setVenueId((id) => (d.venues.some((v) => v.id === id) ? id : d.venues[0]?.id ?? null)); }).catch((e) => setError(e.message));
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
      notify.warning('Một ô bạn đang chọn vừa có người giữ chỗ, vui lòng chọn lại');
    }
  }, [data, selection, notify]);

  const limits = data?.limits;
  const courts = data?.courts.filter((c) => courtType === 'ALL' || c.courtType === courtType);
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
    if (!user) { navigate('/dang-nhap', { state: { from: '/dat-san' } }); return; }
    if (user.role !== 'CUSTOMER') { navigate(homeFor(user)); return; }
    setHolding(true);
    try {
      const { booking } = await api('/bookings', { method: 'POST', body: { courtId: court.id, date, start: picked[0].start, end: picked.at(-1).end } });
      notify.success(`Đã giữ ${court.name.replace(/\s*\(.*\)/, '')} cho bạn, thanh toán để chốt sân nhé`);
      navigate(`/thanh-toan/${booking.bookingCode}`);
    } catch (err) {
      notify.error(err.message);
      setSelection(null);
      load();
    } finally {
      setHolding(false);
    }
  }

  return (
    <div className="flex flex-col gap-6 pb-28">
      <section className="relative flex min-h-56 flex-wrap items-end justify-between gap-4 overflow-hidden rounded-xl bg-slate-900 p-6 text-white lg:min-h-64 lg:p-8">
        <ImageRotator images={BANNER.map(media)} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/55 to-slate-950/10" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-widest text-lime-300">Chọn giờ của bạn</p>
          <h1 className="sport-title text-3xl lg:text-4xl">Đặt sân</h1>
          {venue && <p className="mt-1 max-w-xl text-sm text-slate-100">{venue.address} · Mở cửa {venue.openTime}–{venue.closeTime}{limits && ` · Đặt ${limits.minMinutes}–${limits.maxMinutes} phút`}</p>}
        </div>
        <div className="relative w-full rounded-lg bg-white/95 p-3 text-slate-900 sm:w-72">
          <Select label="Cơ sở" value={venueId ?? ''} onChange={(e) => setVenueId(Number(e.target.value))}>
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
        </div>
      </section>

      <DateStrip start={todayVN()} days={limits?.maxAdvanceDays ?? 14} value={date} onChange={setDate} />
      <Alert>{error}</Alert>

      <Card className="p-4">
        {data ? (
          <>
            <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Lọc loại sân">
              {COURT_TYPES.map(([value, label]) => {
                const count = value === 'ALL' ? data.courts.length : data.courts.filter((c) => c.courtType === value).length;
                return (
                  <button key={value} type="button" aria-pressed={courtType === value} onClick={() => { setCourtType(value); setSelection(null); }} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${courtType === value ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}>
                    {label} · {count}
                  </button>
                );
              })}
            </div>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold">{fullDate(date)}</span>
              <span className="text-slate-600">{data.holiday ? `Ngày lễ: ${data.holiday} · ` : ''}{data.dayType === 'WEEKEND' ? 'Giá cuối tuần' : 'Giá ngày thường'} · giá mỗi ô 30 phút</span>
            </div>
            <SlotMatrix courts={courts} selection={selection} onCellClick={onCellClick} />
          </>
        ) : <Spinner />}
      </Card>
      <Legend />

      <div className="grid gap-4 md:grid-cols-3">
        {TIPS.map((tip, i) => (
          <Reveal key={tip.key} delay={i * 100} className="lift overflow-hidden rounded-xl border border-slate-200 bg-white">
            <img src={media(tip.key).src} style={media(tip.key).style} alt="" loading="lazy" className="h-40 w-full object-cover" />
            <div className="p-4">
              <h2 className="font-semibold">{tip.title}</h2>
              <p className="text-sm text-slate-600">{tip.text}</p>
            </div>
          </Reveal>
        ))}
      </div>

      {picked.length > 0 && (
        <div className="summary-enter fixed inset-x-0 bottom-4 z-10 px-4">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 rounded-xl border border-teal-700 bg-white px-6 py-4 shadow-lg">
            <div>
              <p className="font-semibold">{court.name} · {fullDate(date)}</p>
              <p className="text-sm text-slate-600">
                {picked[0].start} – {picked.at(-1).end} · {picked.length} ô
                {tooShort && <span className="ml-2 text-red-700">Cần đặt tối thiểu {limits.minMinutes} phút</span>}
                {internal && <span className="ml-2 block text-amber-700 sm:inline">Tài khoản nội bộ chỉ xem lịch. Đặt cho khách ở mục Đặt tại quầy, trong ca trực.</span>}
              </p>
            </div>
            <div className="flex items-center gap-6">
              <div className="text-right">
                <p className="text-xs text-slate-600">Tạm tính</p>
                <p className="text-xl font-semibold">{vnd(total)}</p>
              </div>
              <Button kind="ghost" onClick={() => setSelection(null)}>Bỏ chọn</Button>
              <Button onClick={hold} loading={holding} disabled={tooShort || internal}>Giữ chỗ {limits?.holdMinutes} phút</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
