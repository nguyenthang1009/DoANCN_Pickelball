import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import PageHeader from '../../components/PageHeader';
import { Alert, Badge, Button, Card, Input, Spinner } from '../../components/ui';

// Admin: quản lý cụm sân, giờ mở cửa, gán Manager (US-A01)
export default function Venues() {
  const [venues, setVenues] = useState(null);
  const [managers, setManagers] = useState([]);
  const [form, setForm] = useState({ name: '', address: '', openTime: '06:00', closeTime: '22:00' });
  const [error, setError] = useState('');
  const { notify, confirm } = useFeedback();
  const load = useCallback(() => {
    api('/admin/venues').then((d) => setVenues(d.venues)).catch((e) => setError(e.message));
    api('/admin/users?role=MANAGER').then((d) => setManagers(d.users)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  const run = async (fn, ok) => { try { await fn(); notify.success(ok); load(); } catch (e) { notify.error(e.message); } };

  function editHours(v) {
    confirm({
      title: `Đổi giờ mở cửa ${v.name}`,
      message: 'Giờ mới ảnh hưởng tới lịch đặt và bảng giá của mọi sân trong cơ sở.',
      tone: 'warning',
      confirmText: 'Lưu giờ mới',
      input: {
        label: 'Giờ mở – đóng cửa (VD 06:00-22:00)',
        defaultValue: `${v.openTime}-${v.closeTime}`,
        validate: (s) => (/^\d{2}:\d{2}\s*-\s*\d{2}:\d{2}$/.test(s) ? '' : 'Nhập theo dạng 06:00-22:00'),
      },
    }).then((val) => {
      if (!val) return;
      const [openTime, closeTime] = val.split('-').map((s) => s.trim());
      run(() => api(`/venues/${v.id}`, { method: 'PATCH', body: { openTime, closeTime } }), `Đã cập nhật giờ ${v.name}`);
    });
  }

  async function changeManager(v, managerId) {
    const name = managers.find((m) => m.id === Number(managerId))?.fullName;
    const ok = await confirm({
      title: name ? `Gán quản lý cho ${v.name}?` : `Bỏ quản lý của ${v.name}?`,
      details: name ? [['Quản lý mới', name]] : [],
      tone: 'warning',
      confirmText: 'Xác nhận',
    });
    if (ok) run(() => api(`/venues/${v.id}`, { method: 'PATCH', body: { managerId: managerId ? Number(managerId) : null } }), `Đã cập nhật quản lý ${v.name}`);
  }

  async function toggleVenue(v) {
    if (v.isActive && !(await confirm({ title: `Tạm ngừng ${v.name}?`, message: 'Khách sẽ không thấy và không đặt được cơ sở này.', tone: 'danger', confirmText: 'Tạm ngừng', cancelText: 'Giữ lại' }))) return;
    run(() => api(`/venues/${v.id}`, { method: 'PATCH', body: { isActive: !v.isActive } }), `${v.isActive ? 'Đã tạm ngừng' : 'Đã mở lại'} ${v.name}`);
  }

  return (
    <div>
      <PageHeader title="Cụm sân" subtitle="Thêm cơ sở, đổi giờ mở cửa, gán quản lý" />
      <Alert>{error}</Alert>
      <Card className="mt-4 overflow-x-auto p-0">
        {!venues ? <Spinner /> : (
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Cơ sở', 'Địa chỉ', 'Giờ mở cửa', 'Quản lý', 'Trạng thái', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {venues.map((v) => (
                <tr key={v.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold">{v.name}</td>
                  <td className="px-4 py-3">{v.address}</td>
                  <td className="px-4 py-3">{v.openTime}–{v.closeTime}</td>
                  <td className="px-4 py-3">
                    <select aria-label={`Quản lý ${v.name}`} className="h-9 rounded-lg border border-slate-200 px-2" value={v.managerId ?? ''} onChange={(e) => changeManager(v, e.target.value)}>
                      <option value="">Chưa có</option>
                      {managers.map((m) => <option key={m.id} value={m.id}>{m.fullName}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3"><Badge tone={v.isActive ? 'green' : 'slate'}>{v.isActive ? 'Hoạt động' : 'Ngừng'}</Badge></td>
                  <td className="flex justify-end gap-2 px-4 py-3">
                    <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => editHours(v)}>Đổi giờ</Button>
                    <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => toggleVenue(v)}>{v.isActive ? 'Tạm ngừng' : 'Mở lại'}</Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <form className="flex flex-wrap items-end gap-2 border-t border-slate-200 p-4" onSubmit={(e) => { e.preventDefault(); run(() => api('/venues', { method: 'POST', body: form }), `Đã thêm ${form.name}`); }}>
          <Input label="Tên cơ sở" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Input label="Địa chỉ" required value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="min-w-64" />
          <Input label="Mở cửa" type="time" step="1800" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} />
          <Input label="Đóng cửa" type="time" step="1800" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} />
          <Button type="submit">Thêm cơ sở</Button>
        </form>
      </Card>
      <p className="mt-2 text-xs text-slate-600">Cơ sở mới cần thêm sân và bảng giá ở mục “Sân & bảng giá” trước khi nhận đặt.</p>
    </div>
  );
}
