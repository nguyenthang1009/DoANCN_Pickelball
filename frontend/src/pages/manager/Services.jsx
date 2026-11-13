import { useCallback, useEffect, useState } from 'react';
import { api, uploadImage } from '../../lib/api';
import { ServiceThumb } from '../../components/ServiceCart';
import { useFeedback } from '../../lib/feedback';
import { vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import { Alert, Badge, Button, Card, Input, Select, Spinner } from '../../components/ui';

const GROUP = { DRINK: 'Nước uống', EQUIPMENT: 'Dụng cụ', OTHER: 'Khác' };

// US-M05: danh mục dịch vụ tại quầy; món đã bán không xóa, chỉ ngừng bán (BR16)
export default function Services() {
  const scope = useVenueScope();
  const { notify, confirm } = useFeedback();
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ name: '', category: 'DRINK', unit: 'Chai', unitPrice: 10000 });
  const [error, setError] = useState('');
  const load = useCallback(() => { if (scope.venueId) api(`/venues/${scope.venueId}/services?includeInactive=true`).then((d) => setItems(d.services)).catch((e) => setError(e.message)); }, [scope.venueId]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => { try { await fn(); notify.success(ok); load(); } catch (e) { notify.error(e.message); } };

  function editPrice(s) {
    confirm({
      title: `Đổi giá ${s.name}`,
      message: 'Giá mới áp dụng từ đơn bán sau, hóa đơn cũ giữ nguyên.',
      confirmText: 'Lưu giá mới',
      input: {
        label: 'Giá mới (VND)',
        type: 'number',
        defaultValue: String(s.unitPrice),
        validate: (v) => (Number(v) > 0 && Number(v) % 1000 === 0 ? '' : 'Giá phải là bội số của 1.000'),
      },
    }).then((v) => { if (v) run(() => api(`/services/${s.id}`, { method: 'PATCH', body: { unitPrice: Number(v) } }), `Đã đổi giá ${s.name}`); });
  }

  // Ảnh món giúp lễ tân nhận đúng loại nước, loại vợt khi bán
  function pickImage(s, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { notify.error('Ảnh tối đa 6 MB'); return; }
    run(() => uploadImage(`/services/${s.id}/image`, file), `Đã đổi ảnh ${s.name}`);
  }
  async function removeImage(s) {
    if (await confirm({ title: `Gỡ ảnh ${s.name}?`, message: 'Màn bán hàng sẽ hiện biểu tượng theo nhóm thay cho ảnh.', tone: 'warning', confirmText: 'Gỡ ảnh' })) {
      run(() => api(`/services/${s.id}/image`, { method: 'DELETE' }), `Đã gỡ ảnh ${s.name}`);
    }
  }

  async function toggle(s) {
    if (s.isActive && !(await confirm({ title: `Ngừng bán ${s.name}?`, message: 'Món sẽ biến mất khỏi màn hình bán tại quầy. Lịch sử bán hàng vẫn được giữ.', tone: 'warning', confirmText: 'Ngừng bán' }))) return;
    run(() => api(`/services/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }), `${s.isActive ? 'Đã ngừng bán' : 'Đã mở bán lại'} ${s.name}`);
  }

  return (
    <div>
      <PageHeader title="Danh mục dịch vụ" subtitle={scope.venue?.name} scope={scope} />
      <Alert>{error}</Alert>
      <Card className="mt-4 overflow-x-auto p-0">
        {!items ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Ảnh', 'Tên', 'Nhóm', 'Đơn vị', 'Đơn giá', 'Trạng thái', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {items.map((s) => (
                <tr key={s.id} className={`border-t border-slate-200 ${s.isActive ? '' : 'text-slate-600'}`}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <ServiceThumb item={s} className="h-14 w-14" />
                      <div className="flex flex-col items-start gap-0.5 text-xs">
                        <label className="cursor-pointer font-semibold text-teal-700 hover:underline">
                          {s.imageUrl ? 'Đổi ảnh' : 'Thêm ảnh'}
                          <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => pickImage(s, e)} />
                        </label>
                        {s.imageUrl && <button type="button" className="text-slate-600 hover:text-red-700" onClick={() => removeImage(s)}>Gỡ ảnh</button>}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium">{s.name}</td>
                  <td className="px-4 py-3">{GROUP[s.category]}</td>
                  <td className="px-4 py-3">{s.unit}</td>
                  <td className="px-4 py-3">{vnd(s.unitPrice)}</td>
                  <td className="px-4 py-3"><Badge tone={s.isActive ? 'green' : 'slate'}>{s.isActive ? 'Đang bán' : 'Ngừng bán'}</Badge></td>
                  <td className="flex justify-end gap-2 px-4 py-3">
                    <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => editPrice(s)}>Sửa giá</Button>
                    <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => toggle(s)}>{s.isActive ? 'Ngừng bán' : 'Bán lại'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-4" onSubmit={(e) => { e.preventDefault(); run(() => api(`/venues/${scope.venueId}/services`, { method: 'POST', body: { ...form, unitPrice: Number(form.unitPrice) } }), `Đã thêm ${form.name}`); }}>
          <Input label="Tên món" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Nhóm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {Object.entries(GROUP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Input label="Đơn vị" required value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} className="w-28" />
          <Input label="Đơn giá" type="number" step="1000" min="1000" required value={form.unitPrice} onChange={(e) => setForm({ ...form, unitPrice: e.target.value })} className="w-32" />
          <Button type="submit">Thêm món</Button>
        </form>
      </Card>
    </div>
  );
}
