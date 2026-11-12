import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { todayVN } from '../../lib/format';
import { useLightingWatch } from '../../lib/socket';
import { useVenueScope } from '../../lib/useVenueScope';
import FuzzyChart from '../../components/FuzzyChart';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Badge, Button, Card, Input, Spinner } from '../../components/ui';

const STATE = {
  ACTIVE: ['green', 'Đang có khách'],
  PREPARING: ['amber', 'Sắp tới giờ'],
  IDLE: ['slate', 'Không có đơn'],
  MAINTENANCE: ['red', 'Bảo trì'],
};
const SOURCE = { SIMULATOR: 'mô phỏng', DEVICE: 'thiết bị', DEFAULT: 'mặc định tối', CHECKIN: 'theo check-in' };
const fmt = (n, d = 2) => Number(n).toFixed(d).replace('.', ',');
// Điện năng tính theo Wh: dưới 1 kWh hiện Wh cho dễ đọc
const energyText = (wh) => (wh >= 1000 ? `${fmt(wh / 1000)} kWh` : `${Math.round(wh)} Wh`);

// Sân nhìn từ trên xuống, đèn chiếu sáng theo đúng độ sáng đang áp dụng
function CourtScene({ level, warning }) {
  const glow = level / 100;
  return (
    <div className={`court-scene ${warning ? 'court-warning' : ''}`} style={{ '--glow': glow }}>
      <svg viewBox="0 0 220 100" className="relative h-full w-full" aria-hidden="true">
        <rect x="10" y="10" width="200" height="80" rx="2" fill="#0f766e" fillOpacity={0.35 + glow * 0.5} stroke="#e2e8f0" strokeOpacity={0.3 + glow * 0.7} strokeWidth="2" />
        <path d="M78 10v80M142 10v80M10 50h68M142 50h68" stroke="#e2e8f0" strokeOpacity={0.3 + glow * 0.7} strokeWidth="1.5" fill="none" />
        <line x1="110" y1="6" x2="110" y2="94" stroke="#f8fafc" strokeOpacity={0.4 + glow * 0.6} strokeWidth="3" />
        {[[10, 10], [210, 10], [10, 90], [210, 90]].map(([cx, cy]) => (
          <g key={`${cx}-${cy}`}>
            <circle cx={cx} cy={cy} r={6 + glow * 26} fill="#fef9c3" fillOpacity={glow * 0.45} className="lamp-glow" />
            <circle cx={cx} cy={cy} r="4" fill={level > 0 ? '#fde047' : '#475569'} stroke="#0f172a" strokeWidth="1" />
          </g>
        ))}
      </svg>
    </div>
  );
}

function Gauge({ level }) {
  const r = 34;
  const length = 2 * Math.PI * r;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#e2e8f0" strokeWidth="7" />
        <circle cx="40" cy="40" r={r} fill="none" stroke="url(#gauge)" strokeWidth="7" strokeLinecap="round" strokeDasharray={length} strokeDashoffset={length * (1 - level / 100)} className="gauge-arc" />
        <defs><linearGradient id="gauge"><stop offset="0" stopColor="#0f766e" /><stop offset="1" stopColor="#bef264" /></linearGradient></defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-black italic">{level}%</span>
        <span className="text-[10px] text-slate-600">độ sáng</span>
      </div>
    </div>
  );
}

function Slider({ label, value, min, max, step, disabled, onChange, suffix }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="flex justify-between"><span className="text-slate-600">{label}</span><span className="font-semibold">{value}{suffix}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(e) => onChange(Number(e.target.value))} className="accent-teal-700 disabled:opacity-50" />
    </label>
  );
}

function CourtCard({ court, canControl, selected, onSelect, onSensor, onMode, onBulb }) {
  const [tone, label] = STATE[court.state];
  const [draft, setDraft] = useState(null);
  const [ip, setIp] = useState(court.bulb?.ip ?? '');
  const timer = useRef(null);
  useEffect(() => { setIp(court.bulb?.ip ?? ''); }, [court.bulb?.ip]);
  const lux = draft?.lux ?? court.inputs.lux;
  const activity = draft?.activity ?? court.inputs.activity;
  const maintenance = court.state === 'MAINTENANCE';

  // Gửi số đo sau khi người dùng ngừng kéo một chút, tránh gọi API theo từng pixel
  function change(key, value) {
    const next = { lux, activity, ...draft, [key]: value };
    setDraft(next);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => onSensor(court.courtId, { [key]: value }).finally(() => setDraft(null)), 250);
  }

  return (
    <Card className={`flex flex-col gap-4 p-4 transition ${selected ? 'ring-2 ring-teal-700' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-bold">{court.courtName}</h3>
          <p className="text-xs text-slate-600">{court.booking ? `${court.booking.start}–${court.booking.end} · ${court.booking.customer}${court.booking.checkedIn ? ' · đã nhận sân' : ''}` : court.courtType === 'INDOOR' ? 'Trong nhà' : 'Ngoài trời'}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge tone={tone}>{label}</Badge>
          {court.warning && <Badge tone="red">Có người, chưa đặt sân</Badge>}
          {court.mode === 'MANUAL' && <Badge tone="teal">Thủ công</Badge>}
        </div>
      </div>
      <div className="flex items-center gap-4">
        <div className="h-24 min-w-0 flex-1"><CourtScene level={court.level} warning={court.warning} /></div>
        <Gauge level={court.level} />
      </div>
      {!maintenance && (
        <div className="flex flex-col gap-3">
          <Slider label={`Ánh sáng môi trường (${SOURCE[court.inputs.luxSource]})`} value={lux} min={0} max={1000} step={10} suffix=" lux" disabled={!canControl} onChange={(v) => change('lux', v)} />
          <Slider label={`Mức hoạt động (${SOURCE[court.inputs.activitySource]})`} value={activity} min={0} max={10} step={0.5} suffix="/10" disabled={!canControl} onChange={(v) => change('activity', v)} />
          {canControl && court.inputs.activitySource !== 'CHECKIN' && (
            <button type="button" className="self-start text-xs font-semibold text-teal-700 hover:underline" onClick={() => onSensor(court.courtId, { activity: null })}>Dùng tín hiệu check-in thay cho cảm biến</button>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 pt-3">
        <Button kind={selected ? 'primary' : 'secondary'} className="px-3 py-1.5 text-sm" onClick={() => onSelect(court.courtId)}>Xem suy luận</Button>
        {canControl && !maintenance && (
          <Button kind="ghost" className="px-3 py-1.5 text-sm" onClick={() => onMode(court)}>{court.mode === 'AUTO' ? 'Chuyển thủ công' : 'Về tự động'}</Button>
        )}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-slate-600">
          <span className={`h-2 w-2 rounded-full ${!court.bulb ? 'bg-slate-300' : court.bulb.online ? 'bg-green-500' : court.bulb.online === false ? 'bg-red-500' : 'bg-amber-400'}`} />
          {!court.bulb ? 'Chưa gán đèn' : court.bulb.online ? `Đèn ${court.bulb.ip}` : court.bulb.online === false ? 'Đèn mất kết nối' : 'Đang chờ đèn'}
        </span>
      </div>
      {canControl && (
        <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); onBulb(court, ip.trim() || null); }}>
          <Input label="Địa chỉ IP đèn Yeelight" placeholder="VD 192.168.1.50" value={ip} onChange={(e) => setIp(e.target.value)} className="flex-1" />
          <Button kind="secondary" type="submit" className="h-11">Lưu</Button>
        </form>
      )}
      {court.bulb?.error && <p className="text-xs text-red-700">{court.bulb.error}</p>}
    </Card>
  );
}

const ruleText = (r, variables) => {
  const part = (name, key) => (key === '*' ? null : `${variables[name].label.toLowerCase()} ${variables[name].sets[key].label}`);
  return [part('lux', r.lux), part('activity', r.activity)].filter(Boolean).join(' VÀ ');
};

function Inference({ court, model }) {
  const v = model.variables;
  if (court.state === 'MAINTENANCE') return <Card><p className="text-slate-600">{court.courtName} đang bảo trì nên đèn luôn tắt, không chạy suy luận.</p></Card>;
  const rules = model.rules[court.state];
  return (
    <Card className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold">Suy luận cho {court.courtName}</h2>
        <p className="text-sm text-slate-600">Bộ luật: <b className="text-slate-900">{STATE[court.state][1]}</b> · Mamdani, AND = min, gộp = max, giải mờ trọng tâm</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <FuzzyChart variable={v.lux} value={court.inputs.lux} degrees={court.memberships.lux} />
        <FuzzyChart variable={v.activity} value={court.inputs.activity} degrees={court.memberships.activity} />
        <FuzzyChart variable={v.level} curve={court.curve} centroid={court.centroid} />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-slate-600"><tr>{['Luật', 'Kết luận', 'Độ mạnh', 'Ý nghĩa'].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rules.map((r, i) => {
              const fired = court.fired.find((f) => f.lux === r.lux && f.activity === r.activity);
              return (
                <tr key={i} className={`border-t border-slate-200 ${fired ? 'bg-lime-50 font-medium' : 'text-slate-500'}`}>
                  <td className="px-3 py-2">NẾU {ruleText(r, v) || 'mọi trường hợp'}</td>
                  <td className="px-3 py-2">{v.level.sets[r.level].label}</td>
                  <td className="px-3 py-2">{fired ? <span className="inline-flex items-center gap-2"><span className="h-1.5 rounded bg-teal-700" style={{ width: `${fired.strength * 48}px` }} />{fmt(fired.strength)}</span> : '0'}</td>
                  <td className="px-3 py-2 text-slate-600">{r.note}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm">
        Trọng tâm vùng gộp = <b>{fmt(court.centroid, 1)}%</b>{court.centroid < model.offThreshold ? ` (dưới ngưỡng ${model.offThreshold}% nên tắt hẳn)` : ''}
        {court.mode === 'MANUAL' ? <> · đang ở chế độ thủ công nên đèn dùng <b>{court.level}%</b></> : <> → đèn sáng <b>{court.level}%</b></>}
      </p>
    </Card>
  );
}

// Chiếu sáng thông minh: điều khiển mờ theo ánh sáng môi trường, mức hoạt động và lịch đặt sân
export default function Lighting() {
  const scope = useVenueScope();
  const { can } = useAuth();
  const { notify, confirm } = useFeedback();
  const canControl = can('lighting.control');
  const [data, setData] = useState(null);
  const [model, setModel] = useState(null);
  const [energy, setEnergy] = useState(null);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');

  const venueQuery = scope.isAdmin && scope.venueId ? `?venueId=${scope.venueId}` : '';
  const loadCourts = useCallback(() => {
    if (!scope.venueId) return;
    api(`/lighting${venueQuery}`).then((d) => { setData(d); setSelected((id) => id ?? d.courts[0]?.courtId ?? null); setError(''); }).catch((e) => setError(e.message));
  }, [scope.venueId, venueQuery]);
  const loadAll = useCallback(() => {
    if (!scope.venueId) return;
    loadCourts();
    const today = todayVN();
    api(`/lighting/energy?from=${today}&to=${today}${venueQuery.replace('?', '&')}`).then(setEnergy).catch(() => {});
  }, [scope.venueId, venueQuery, loadCourts]);
  useEffect(() => { api('/lighting/model').then(setModel).catch((e) => setError(e.message)); }, []);
  // Tải đầy đủ 15 giây một lần, bỏ qua khi tab đang ẩn; quay lại tab thì tải ngay
  useEffect(() => {
    setSelected(null);
    loadAll();
    const timer = setInterval(() => { if (!document.hidden) loadAll(); }, 15000);
    const onVisible = () => { if (!document.hidden) loadAll(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [loadAll]);
  // Cảm biến IoT có thể gửi số đo dồn dập: gom các thông báo trong 1,5 giây thành một lần tải danh sách sân
  const pending = useRef(null);
  const onChanged = useCallback(() => {
    if (pending.current || document.hidden) return;
    pending.current = setTimeout(() => { pending.current = null; loadCourts(); }, 1500);
  }, [loadCourts]);
  useEffect(() => () => clearTimeout(pending.current), []);
  useLightingWatch(scope.venueId, onChanged);

  const apply = (promise, ok) => promise.then((d) => { setData(d); if (ok) notify.success(ok); }).catch((e) => notify.error(e.message));
  const onSensor = (courtId, body) => apply(api(`/lighting/courts/${courtId}/sensor`, { method: 'PUT', body }));
  async function onMode(court) {
    if (court.mode === 'MANUAL') return apply(api(`/lighting/courts/${court.courtId}/mode`, { method: 'PUT', body: { mode: 'AUTO' } }), `${court.courtName} về điều khiển tự động`);
    const value = await confirm({
      title: `Điều khiển thủ công ${court.courtName}?`,
      message: 'Đèn sẽ giữ cố định độ sáng này, bỏ qua kết quả suy luận mờ cho tới khi chuyển lại tự động.',
      confirmText: 'Chuyển thủ công',
      input: { label: 'Độ sáng (%)', type: 'number', defaultValue: String(court.level), validate: (v) => (Number.isInteger(Number(v)) && v >= 0 && v <= 100 ? '' : 'Nhập số nguyên từ 0 đến 100') },
    });
    if (value) apply(api(`/lighting/courts/${court.courtId}/mode`, { method: 'PUT', body: { mode: 'MANUAL', manualLevel: Number(value) } }), `${court.courtName} giữ cố định ${value}%`);
    return undefined;
  }
  const onBulb = (court, ip) => apply(api(`/lighting/courts/${court.courtId}/bulb`, { method: 'PUT', body: { ip } }), ip ? `Đã gán đèn ${ip} cho ${court.courtName}` : `Đã gỡ đèn khỏi ${court.courtName}`);

  const court = useMemo(() => data?.courts.find((c) => c.courtId === selected), [data, selected]);
  const lit = data?.courts.filter((c) => c.level > 0).length ?? 0;
  const warnings = data?.courts.filter((c) => c.warning).length ?? 0;

  return (
    <div>
      <PageHeader title="Chiếu sáng thông minh" subtitle="Fuzzy logic tự chỉnh đèn theo ánh sáng trời, mức hoạt động và lịch đặt sân" scope={scope} />
      <Alert>{error}</Alert>
      {!data || !model ? <Spinner /> : (
        <div className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Điện tiết kiệm hôm nay" value={Math.round((energy?.savedKwh ?? 0) * 1000)} format={energyText} note={energy ? `So với bật 100% suốt giờ có khách (${energy.watts} W/sân)` : ''} icon="bulb" tone="teal" />
            <StatCard label="Tỷ lệ tiết kiệm" value={Math.round((energy?.savedPercent ?? 0) * 10)} format={(n) => `${fmt(n / 10, 1)}%`} note={energy ? `Thực tế ${energyText(energy.actualKwh * 1000)}, cách cũ ${energyText(energy.baselineKwh * 1000)}` : ''} icon="chart" tone="lime" delay={80} />
            <StatCard label="Sân đang bật đèn" value={lit} format={(n) => `${n}/${data.courts.length}`} icon="court" tone="slate" delay={160} />
            <StatCard label="Cảnh báo có người" value={warnings} format={(n) => `${n} sân`} note="Có người trên sân khi không có đơn" icon="shield" tone={warnings ? 'amber' : 'white'} delay={240} />
          </div>
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            {data.courts.map((c) => (
              <CourtCard key={c.courtId} court={c} canControl={canControl} selected={c.courtId === selected} onSelect={setSelected} onSensor={onSensor} onMode={onMode} onBulb={onBulb} />
            ))}
          </div>
          {court && <Inference court={court} model={model} />}
        </div>
      )}
    </div>
  );
}
