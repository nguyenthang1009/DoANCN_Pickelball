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

// Bảng giá phủ kín giờ mở cửa cho ngày thường và cuối tuần; server kiểm tra hở/chồng lấn
function PriceEditor({ court, venue, onSaved, onClose }) {
  const [rules, setRules] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { api(`/courts/${court.id}/price-rules`).then((d) => setRules(d.rules.map(({ dayType, startTime, endTime, pricePerHour }) => ({ dayType, startTime, endTime, pricePerHour })))).catch((e) => setError(e.message)); }, [court.id]);
  const update = (i, k, v) => setRules(rules.map((r, j) => (j === i ? { ...r, [k]: k === 'pricePerHour' ? Number(v) : v } : r)));

  async function save() {
    const ok = await confirm({
      title: `Lưu bảng giá ${court.name}?`,
      message: 'Giá mới áp dụng từ đơn đặt sau. Các đơn đã giữ chỗ hoặc đã thanh toán giữ nguyên giá cũ.',
      tone: 'warning',
      confirmText: 'Lưu bảng giá',
    });
    if (!ok) return;
    setBusy(true); setError('');
    try { await api(`/courts/${court.id}/price-rules`, { method: 'PUT', body: { rules } }); onSaved(`Đã lưu bảng giá ${court.name}`); } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><h2 className="text-xl font-semibold">Bảng giá · {court.name}</h2><button type="button" onClick={onClose} className="text-sm text-slate-600">Đóng</button></div>
      <Alert>{error}</Alert>
      {!rules ? <Spinner /> : ['WEEKDAY', 'WEEKEND'].map((dt) => (
        <div key={dt} className="flex flex-col gap-2">
          <p className="text-sm font-semibold">{dt === 'WEEKDAY' ? 'Ngày thường (T2–T6)' : 'Cuối tuần & ngày lễ'}</p>
          {rules.map((r, i) => r.dayType === dt && (
            <div key={i} className="flex items-center gap-2">
              <input aria-label="Giờ bắt đầu" type="time" step="1800" value={r.startTime} onChange={(e) => update(i, 'startTime', e.target.value)} className="h-10 rounded-lg border border-slate-200 px-2" />
              <span>–</span>
              <input aria-label="Giờ kết thúc" type="time" step="1800" value={r.endTime} onChange={(e) => update(i, 'endTime', e.target.value)} className="h-10 rounded-lg border border-slate-200 px-2" />
              <input aria-label="Giá mỗi giờ" type="number" step="1000" min="1000" value={r.pricePerHour} onChange={(e) => update(i, 'pricePerHour', e.target.value)} className="h-10 w-28 rounded-lg border border-slate-200 px-2" />
              <span className="text-xs text-slate-600">đ/giờ</span>
              <button type="button" aria-label="Xóa khung" onClick={() => setRules(rules.filter((_, j) => j !== i))} className="text-red-700">✕</button>
            </div>
          ))}
          <button type="button" className="self-start text-sm font-semibold text-teal-700" onClick={() => setRules([...rules, { dayType: dt, startTime: venue?.openTime || '06:00', endTime: venue?.closeTime || '22:00', pricePerHour: 100000 }])}>+ Thêm khung giờ</button>
        </div>
      ))}
      <p className="text-xs text-slate-600">Giá mỗi ô 30 phút = giá giờ ÷ 2, ví dụ 180.000đ/giờ → {vnd(90000)}/ô. Đơn đã đặt giữ nguyên giá cũ.</p>
      <Button loading={busy} onClick={save} disabled={!rules}>Lưu bảng giá</Button>
    </Card>
  );
}
