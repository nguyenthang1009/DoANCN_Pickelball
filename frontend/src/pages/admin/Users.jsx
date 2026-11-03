import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import PageHeader from '../../components/PageHeader';
import { Alert, Badge, Button, Card, Input, Select, Spinner } from '../../components/ui';

const ROLE = { ADMIN: 'Admin', MANAGER: 'Quản lý', STAFF: 'Lễ tân', CUSTOMER: 'Khách hàng' };

// US-A02, US-A03: Admin tạo tài khoản nội bộ (mật khẩu tạm, bắt đổi lần đầu), khóa / mở khóa
export default function Users() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState(null);
  const [venues, setVenues] = useState([]);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', role: 'STAFF', venueId: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const load = useCallback(() => { api(`/admin/users${filter ? `?role=${filter}` : ''}`).then((d) => setUsers(d.users)).catch((e) => setError(e.message)); }, [filter]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { api('/admin/venues').then((d) => setVenues(d.venues)).catch(() => {}); }, []);
  const venueName = (id) => venues.find((v) => v.id === id)?.name || '—';

  async function create(e) {
    e.preventDefault();
    setError(''); setCreated(null);
    try {
      const r = await api('/admin/users', { method: 'POST', body: { ...form, venueId: form.venueId ? Number(form.venueId) : undefined } });
      setCreated(r);
      setForm({ fullName: '', email: '', phone: '', role: 'STAFF', venueId: '' });
      load();
    } catch (err) { setError(err.message); }
  }

  async function toggle(u) {
    setError('');
    try { await api(`/admin/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }); load(); } catch (e) { setError(e.message); }
  }

  return (
    <div>
      <PageHeader title="Tài khoản" subtitle="Tạo tài khoản nhân sự, khóa / mở khóa">
        <Select label="Vai trò" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">Tất cả</option>
          {Object.entries(ROLE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
      </PageHeader>
      <Alert>{error}</Alert>
      {created && <Alert kind="success">Đã tạo {created.user.fullName}. Mật khẩu tạm: <b>{created.tempPassword}</b> (chỉ hiện một lần, nhân viên phải đổi ở lần đăng nhập đầu).</Alert>}
      <div className="mt-4 grid gap-6 xl:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto p-0">
          {!users ? <Spinner /> : (
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-600"><tr>{['Họ tên', 'Liên hệ', 'Vai trò', 'Cơ sở', 'Trạng thái', ''].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-slate-200">
                    <td className="px-4 py-3 font-medium">{u.fullName}{u.mustChangePassword && <div className="text-xs text-amber-700">Chưa đổi mật khẩu tạm</div>}</td>
                    <td className="px-4 py-3">{u.email}<div className="text-xs text-slate-600">{u.phone}</div></td>
                    <td className="px-4 py-3">{ROLE[u.role]}</td>
                    <td className="px-4 py-3">{u.venueId ? venueName(u.venueId) : '—'}</td>
                    <td className="px-4 py-3"><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Hoạt động' : 'Đã khóa'}</Badge></td>
                    <td className="px-4 py-3 text-right">{u.id !== me.id && <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => toggle(u)}>{u.isActive ? 'Khóa' : 'Mở khóa'}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
        <Card>
          <form className="flex flex-col gap-3" onSubmit={create}>
            <h2 className="text-xl font-semibold">Tạo tài khoản nội bộ</h2>
            <Input label="Họ tên" required value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            <Input label="Email" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <Input label="Số điện thoại" required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <Select label="Vai trò" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="STAFF">Lễ tân</option><option value="MANAGER">Quản lý</option><option value="ADMIN">Admin</option>
            </Select>
            {form.role !== 'ADMIN' && (
              <Select label="Cơ sở" required value={form.venueId} onChange={(e) => setForm({ ...form, venueId: e.target.value })}>
                <option value="">Chọn cơ sở</option>
                {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </Select>
            )}
            <Button type="submit">Tạo tài khoản</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
