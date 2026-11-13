import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import PageHeader from '../../components/PageHeader';
import { Alert, Badge, Button, Card, Input, Select, Spinner } from '../../components/ui';

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// Ma trận vai trò × quyền. Backend mới là nơi chặn thật; ô bị khóa ở đây chỉ để người dùng thấy trước.
export default function Roles() {
  const { user: me } = useAuth();
  const { notify, confirm } = useFeedback();
  const [data, setData] = useState(null);
  const [draft, setDraft] = useState({});
  const [form, setForm] = useState({ name: '', baseRole: 'STAFF' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => api('/admin/roles').then((d) => {
    setData(d);
    setDraft(Object.fromEntries(d.roles.map((r) => [r.id, r.permissions])));
  }).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const modules = useMemo(() => {
    const groups = new Map();
    for (const p of data?.permissions || []) groups.set(p.module, [...(groups.get(p.module) || []), p]);
    return [...groups];
  }, [data]);

  const changed = data ? data.roles.filter((r) => !sameSet(draft[r.id] || [], r.permissions)) : [];
  // Admin không tự dùng quyền tại quầy nhưng vẫn cấp được cho vai trò của nhân sự cơ sở
  const grantable = (permission) => me.permissions.includes(permission.code) || (me.role === 'ADMIN' && permission.frontline);
  const locked = (role, permission) => role.code === 'ADMIN' || role.id === me.roleId || permission.adminOnly || !grantable(permission);
  const toggle = (role, code) => setDraft((d) => ({ ...d, [role.id]: d[role.id].includes(code) ? d[role.id].filter((c) => c !== code) : [...d[role.id], code] }));

  async function run(fn, ok) {
    setBusy(true);
    try { await fn(); notify.success(ok); await load(); } catch (e) { notify.error(e.message); } finally { setBusy(false); }
  }

  async function save() {
    const ok = await confirm({
      title: 'Lưu thay đổi phân quyền?',
      message: 'Quyền mới có hiệu lực ngay với người đang đăng nhập, kể cả khi đang thao tác.',
      details: changed.map((r) => [r.name, `${r.userCount} tài khoản`]),
      tone: 'warning',
      confirmText: 'Lưu thay đổi',
    });
    if (ok) run(() => Promise.all(changed.map((r) => api(`/admin/roles/${r.id}`, { method: 'PUT', body: { permissions: draft[r.id] } }))), `Đã lưu ${changed.length} vai trò`);
  }

  async function removeRole(r) {
    const ok = await confirm({ title: `Xóa vai trò ${r.name}?`, message: 'Thao tác này không hoàn tác được.', tone: 'danger', confirmText: 'Xóa vai trò', cancelText: 'Giữ lại' });
    if (ok) run(() => api(`/admin/roles/${r.id}`, { method: 'DELETE' }), `Đã xóa vai trò ${r.name}`);
  }

  function create(e) {
    e.preventDefault();
    run(() => api('/admin/roles', { method: 'POST', body: { ...form, permissions: [] } }), `Đã tạo vai trò ${form.name}. Hãy tích quyền rồi lưu.`)
      .then(() => setForm({ name: '', baseRole: 'STAFF' }));
  }

  if (!data) return error ? <Alert>{error}</Alert> : <Spinner />;
  return (
    <div className="pb-24">
      <PageHeader title="Phân quyền" subtitle="Vai trò nào được dùng chức năng nào. Mọi thay đổi đều ghi nhật ký." />
      <Card className="mt-4 overflow-x-auto p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="align-top">
              <th className="sticky left-0 bg-white px-4 py-3 font-medium text-slate-600">Quyền</th>
              {data.roles.map((r) => (
                <th key={r.id} className="px-3 py-3 text-center font-semibold">
                  {r.name}
                  <div className="text-xs font-normal text-slate-600">{r.userCount} tài khoản</div>
                  {!r.isSystem && r.userCount === 0 && (
                    <button type="button" disabled={busy} className="text-xs font-normal text-red-700 hover:underline" onClick={() => removeRole(r)}>Xóa</button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          {modules.map(([module, permissions]) => (
            <tbody key={module}>
              <tr className="border-t border-slate-200 bg-slate-50"><th colSpan={data.roles.length + 1} className="sticky left-0 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600">{module}</th></tr>
              {permissions.map((p) => (
                <tr key={p.code} className="border-t border-slate-200">
                  <td className="sticky left-0 bg-white px-4 py-2">
                    {p.description}
                    <div className="flex flex-wrap items-center gap-1 text-xs text-slate-600">
                      {p.code}
                      {p.frontline && <Badge tone="teal">Tại quầy</Badge>}
                      {p.requiresShift && <Badge tone="amber">Cần đang trong ca</Badge>}
                    </div>
                  </td>
                  {data.roles.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-teal-700 disabled:opacity-40"
                        aria-label={`${r.name}: ${p.description}`}
                        checked={(draft[r.id] || []).includes(p.code)}
                        disabled={busy || locked(r, p)}
                        onChange={() => toggle(r, p.code)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          ))}
        </table>
      </Card>
      <p className="mt-2 text-sm text-slate-600">Ô bị khóa: vai trò Admin cố định, quyền quản trị chỉ dành cho Admin, và bạn chỉ cấp được quyền mình đang có.</p>

      <Card className="mt-6 max-w-2xl">
        <form className="flex flex-wrap items-end gap-3" onSubmit={create}>
          <h2 className="w-full text-xl font-semibold">Thêm vai trò</h2>
          <Input label="Tên vai trò" required className="min-w-56 flex-1" placeholder="VD: Thu ngân, Kế toán" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <Select label="Phạm vi dữ liệu theo" value={form.baseRole} onChange={(e) => setForm({ ...form, baseRole: e.target.value })}>
            <option value="STAFF">Lễ tân: ca của mình tại cơ sở</option>
            <option value="MANAGER">Quản lý: toàn bộ cơ sở</option>
          </Select>
          <Button type="submit" disabled={busy}>Tạo vai trò</Button>
        </form>
      </Card>

      {changed.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-10 px-4 lg:left-60">
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 rounded-xl border border-teal-700 bg-white px-6 py-3 shadow-lg">
            <p className="font-semibold">{changed.length} vai trò có thay đổi chưa lưu</p>
            <div className="flex gap-2">
              <Button kind="ghost" onClick={() => setDraft(Object.fromEntries(data.roles.map((r) => [r.id, r.permissions])))}>Bỏ</Button>
              <Button loading={busy} onClick={save}>Lưu thay đổi</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
