import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import MaintenanceModal from '../../components/MaintenanceModal';
import { Alert, Badge, Button, Card, Input, Select, Spinner } from '../../components/ui';

const STATUS = { ACTIVE: ['green', 'Hoạt động'], MAINTENANCE: ['amber', 'Bảo trì'], INACTIVE: ['slate', 'Ngừng sử dụng'] };

// US-M01, US-M02, US-M04: sân con, trạng thái bảo trì và bảng giá theo khung giờ
export default function Courts() {
  const scope = useVenueScope();
  const { can } = useAuth();
  const { notify, confirm } = useFeedback();
  const [courts, setCourts] = useState(null);
  const [editing, setEditing] = useState(null);
  const [closing, setClosing] = useState(null);
  const [form, setForm] = useState({ name: '', courtType: 'INDOOR', copyPriceFrom: '' });
  const [error, setError] = useState('');

  const load = useCallback(() => {
    if (scope.venueId) api(`/venues/${scope.venueId}/courts`).then((d) => setCourts(d.courts)).catch((e) => setError(e.message));
  }, [scope.venueId]);
  useEffect(() => { setEditing(null); load(); }, [load]);

  // ok: chuỗi thông báo, hoặc hàm dựng thông báo từ kết quả API
  const run = async (fn, ok) => {
    try { await fn(); notify.success(ok); load(); } catch (e) { notify.error(e.message); }
  };

  function afterMaintenance(c, r, moved) {
    setClosing(null);
    const cancelled = r.affectedBookings.map((b) => `${b.bookingCode} → ${b.newStatus === 'REFUND_PENDING' ? 'chờ hoàn tiền' : 'đã hủy'}`);
    notify.success([`Đã chuyển ${c.name} sang bảo trì`, moved.length && `Đổi sân: ${moved.join(', ')}`, cancelled.length && `Bị hủy: ${cancelled.join(', ')}`].filter(Boolean).join('. '));
    load();
  }

  async function reopen(c) {
    if (await confirm({ title: `Mở lại ${c.name}?`, message: 'Khách sẽ đặt được sân này ngay.', confirmText: 'Mở lại sân' })) {
      run(() => api(`/courts/${c.id}/status`, { method: 'PATCH', body: { status: 'ACTIVE' } }), `Đã mở lại ${c.name}`);
    }
  }

  async function remove(c) {
    const ok = await confirm({ title: `Xóa ${c.name}?`, message: 'Sân và bảng giá sẽ bị xóa vĩnh viễn. Sân đã có lịch đặt thì không xóa được, hãy chuyển sang ngừng sử dụng.', tone: 'danger', confirmText: 'Xóa sân', cancelText: 'Giữ lại' });
    if (ok) run(() => api(`/courts/${c.id}`, { method: 'DELETE' }), `Đã xóa ${c.name}`);
  }

  return (
    <div>
      <PageHeader title="Sân & bảng giá" subtitle={scope.venue ? `${scope.venue.name} · mở cửa ${scope.venue.openTime}–${scope.venue.closeTime}` : ''} scope={scope} />
      <Alert>{error}</Alert>
      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-x-auto p-0">
          {!courts ? <Spinner /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-600"><tr>{['Sân', 'Loại', 'Trạng thái', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {courts.map((c) => (
                  <tr key={c.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-semibold">{c.name}</td>
                    <td className="px-4 py-3">{c.courtType === 'INDOOR' ? 'Trong nhà' : 'Ngoài trời'}</td>
                    <td className="px-4 py-3"><Badge tone={STATUS[c.status][0]}>{STATUS[c.status][1]}</Badge></td>
                    <td className="flex flex-wrap justify-end gap-2 px-4 py-3">
                      {can('price.manage') && <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setEditing(c)}>Sửa giá</Button>}
                      {can('court.manage') && (c.status === 'ACTIVE'
                        ? <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => setClosing(c)}>Đặt bảo trì</Button>
                        : <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => reopen(c)}>Mở lại sân</Button>)}
                      {can('court.manage') && <Button kind="ghost" className="px-3 py-1 text-sm text-red-700" onClick={() => remove(c)}>Xóa</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {can('court.manage') && <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-4" onSubmit={(e) => {
            e.preventDefault();
            run(() => api(`/venues/${scope.venueId}/courts`, { method: 'POST', body: { name: form.name, courtType: form.courtType, copyPriceFrom: form.copyPriceFrom ? Number(form.copyPriceFrom) : undefined } }), `Đã thêm ${form.name}`)
              .then(() => setForm({ name: '', courtType: 'INDOOR', copyPriceFrom: '' }));
          }}>
            <Input label="Tên sân mới" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <Select label="Loại" value={form.courtType} onChange={(e) => setForm({ ...form, courtType: e.target.value })}>
              <option value="INDOOR">Trong nhà</option><option value="OUTDOOR">Ngoài trời</option>
            </Select>
            <Select label="Chép bảng giá từ" value={form.copyPriceFrom} onChange={(e) => setForm({ ...form, copyPriceFrom: e.target.value })}>
              <option value="">Không chép</option>
              {courts?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
            <Button type="submit">Thêm sân</Button>
          </form>}
        </Card>
        {editing && <PriceEditor key={editing.id} court={editing} venue={scope.venue} onSaved={(msg) => { notify.success(msg); setEditing(null); }} onClose={() => setEditing(null)} />}
      </div>
      {closing && <MaintenanceModal court={closing} onClose={() => { setClosing(null); load(); }} onDone={(r, moved) => afterMaintenance(closing, r, moved)} />}
    </div>
  );
}

// Bảng giá phủ kín giờ mở cửa cho ngày thường và cuối tuần; server kiểm tra hở/chồng lấn.
// Xóa một khung thì giờ của khung đó gộp vào khung liền trước (hoặc liền sau nếu là khung đầu) để không bỏ trống giờ nào.
// Đơn đã đặt chốt giá theo từng ô lúc giữ chỗ, nên sửa hay xóa khung không làm đổi tiền của khách đã đặt.
const DAY_LABEL = { WEEKDAY: 'Ngày thường (T2–T6)', WEEKEND: 'Cuối tuần & ngày lễ' };
const DAY_NAME = { WEEKDAY: 'ngày thường', WEEKEND: 'cuối tuần và ngày lễ' };

function PriceEditor({ court, venue, onSaved, onClose }) {
  const { notify, confirm } = useFeedback();
  const [rules, setRules] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  useEffect(() => { api(`/courts/${court.id}/price-rules`).then((d) => setRules(d.rules.map(({ dayType, startTime, endTime, pricePerHour }) => ({ dayType, startTime, endTime, pricePerHour })))).catch((e) => setError(e.message)); }, [court.id]);
  const change = (next) => { setRules(next); setDirty(true); };
  const update = (i, k, v) => change(rules.map((r, j) => (j === i ? { ...r, [k]: k === 'pricePerHour' ? Number(v) : v } : r)));

  // Thêm khung bằng cách chia đôi khung dài nhất (tròn 30 phút), nên bảng giá luôn liền mạch
  function addFrame(dt) {
    const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const toHHMM = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const candidates = rules.map((r, j) => ({ ...r, j, len: toMin(r.endTime) - toMin(r.startTime) })).filter((r) => r.dayType === dt && r.len >= 60);
    if (!candidates.length) { notify.error('Các khung đều chỉ 30 phút, không chia thêm được'); return; }
    const longest = candidates.reduce((a, b) => (b.len > a.len ? b : a));
    const mid = toMin(longest.startTime) + Math.round(longest.len / 60) * 30;
    const next = rules.map((r, j) => (j === longest.j ? { ...r, endTime: toHHMM(mid) } : r));
    change([...next, { dayType: dt, startTime: toHHMM(mid), endTime: longest.endTime, pricePerHour: longest.pricePerHour }].sort((x, y) => x.dayType.localeCompare(y.dayType) || x.startTime.localeCompare(y.startTime)));
  }

  async function removeFrame(i) {
    const target = rules[i];
    const sameDay = rules.map((r, j) => ({ ...r, j })).filter((r) => r.dayType === target.dayType).sort((a, b) => a.startTime.localeCompare(b.startTime));
    const pos = sameDay.findIndex((r) => r.j === i);
    const neighbour = sameDay[pos - 1] ?? sameDay[pos + 1];
    const merged = pos > 0 ? { ...neighbour, endTime: target.endTime } : { ...neighbour, startTime: target.startTime };
    const ok = await confirm({
      title: `Xóa khung ${target.startTime}–${target.endTime}?`,
      message: `Giờ của khung này gộp vào khung bên cạnh để giá ${DAY_NAME[target.dayType]} không bị trống giờ. Đơn khách đã đặt giữ nguyên giá đã chốt. Bấm "Lưu bảng giá" để áp dụng.`,
      details: [
        ['Khung bị xóa', `${target.startTime}–${target.endTime} · ${vnd(target.pricePerHour)}/giờ`],
        ['Sau khi gộp', `${merged.startTime}–${merged.endTime} · ${vnd(merged.pricePerHour)}/giờ`],
      ],
      tone: 'warning',
      confirmText: 'Xóa khung',
      cancelText: 'Giữ lại',
    });
    if (!ok) return;
    change(rules.map((r, j) => (j === neighbour.j ? { dayType: r.dayType, startTime: merged.startTime, endTime: merged.endTime, pricePerHour: r.pricePerHour } : r)).filter((_, j) => j !== i));
  }

  async function save() {
    const ok = await confirm({
      title: `Lưu bảng giá ${court.name}?`,
      message: 'Giá mới áp dụng cho đơn đặt từ bây giờ. Đơn đã giữ chỗ hoặc đã thanh toán giữ nguyên giá đã chốt, kể cả khách đang chơi.',
      tone: 'warning',
      confirmText: 'Lưu bảng giá',
    });
    if (!ok) return;
    setBusy(true); setError('');
    try {
      const r = await api(`/courts/${court.id}/price-rules`, { method: 'PUT', body: { rules } });
      onSaved(`Đã lưu bảng giá ${court.name}${r.keptSlots ? `. ${r.keptSlots} ô đã đặt sắp tới giữ nguyên giá cũ` : ''}`);
    } catch (e) { setError(e.message); notify.error(e.message); } finally { setBusy(false); }
  }

  async function close() {
    if (dirty && !(await confirm({ title: 'Bỏ thay đổi bảng giá?', message: 'Các khung vừa sửa hoặc xóa chưa được lưu.', tone: 'warning', confirmText: 'Bỏ thay đổi', cancelText: 'Tiếp tục sửa' }))) return;
    onClose();
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Bảng giá · {court.name}</h2><button type="button" onClick={close} className="text-sm text-slate-600">Đóng</button></div>
      <Alert>{error}</Alert>
      {!rules ? <Spinner /> : ['WEEKDAY', 'WEEKEND'].map((dt) => {
        const count = rules.filter((r) => r.dayType === dt).length;
        return (
          <div key={dt} className="flex flex-col gap-2">
            <p className="text-sm font-semibold">{DAY_LABEL[dt]}</p>
            {rules.map((r, i) => r.dayType === dt && (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 p-2">
                <div className="flex min-w-[220px] flex-1 items-center gap-2">
                  <input aria-label="Giờ bắt đầu" type="time" step="1800" value={r.startTime} onChange={(e) => update(i, 'startTime', e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-2" />
                  <span>–</span>
                  <input aria-label="Giờ kết thúc" type="time" step="1800" value={r.endTime} onChange={(e) => update(i, 'endTime', e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 px-2" />
                </div>
                <div className="flex flex-1 items-center gap-2">
                <input aria-label="Giá mỗi giờ" type="number" step="1000" min="1000" value={r.pricePerHour} onChange={(e) => update(i, 'pricePerHour', e.target.value)} className="h-10 w-28 rounded-lg border border-slate-200 px-2" />
                <span className="flex-1 text-xs text-slate-600">đ/giờ</span>
                <button
                  type="button"
                  aria-label={`Xóa khung ${r.startTime}–${r.endTime}`}
                  title={count === 1 ? 'Phải còn ít nhất một khung giá' : 'Xóa khung, giờ gộp vào khung bên cạnh'}
                  disabled={count === 1}
                  onClick={() => removeFrame(i)}
                  className="rounded-lg px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent"
                >Xóa</button>
                </div>
              </div>
            ))}
            <button type="button" className="self-start text-sm font-semibold text-teal-700" onClick={() => addFrame(dt)}>+ Thêm khung giờ</button>
          </div>
        );
      })}
      <p className="text-xs text-slate-600">Giá mỗi ô 30 phút = giá giờ ÷ 2, ví dụ 180.000đ/giờ → {vnd(90000)}/ô. Đơn đã đặt giữ nguyên giá cũ.</p>
      {dirty && <Alert kind="warning">Có thay đổi chưa lưu.</Alert>}
      <Button loading={busy} onClick={save} disabled={!rules || !dirty}>Lưu bảng giá</Button>
    </Card>
  );
}
