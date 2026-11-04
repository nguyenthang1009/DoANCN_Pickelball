import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth, homeFor } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { useSite } from '../../lib/site';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';

// US-S10: tài khoản nội bộ phải đổi mật khẩu tạm ở lần đăng nhập đầu
export default function ChangePassword() {
  const { user, ready, changePassword } = useAuth();
  const { notify } = useFeedback();
  const { media } = useSite();
  const navigate = useNavigate();
  const [form, setForm] = useState({ current: '', next: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  if (ready && !user) return <Navigate to="/dang-nhap" replace />;

  async function submit(e) {
    e.preventDefault();
    if (form.next !== form.confirm) { setError('Mật khẩu nhập lại không khớp'); return; }
    setError(''); setLoading(true);
    try {
      const u = await changePassword(form.current, form.next);
      notify.success('Đã đổi mật khẩu, các thiết bị khác đã được đăng xuất');
      navigate(homeFor(u), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell images={[media('auth.password')]} eyebrow="Bảo mật tài khoản" title="Đặt mật khẩu của riêng bạn">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="sport-title text-3xl">Đổi mật khẩu</h2>
          {user?.mustChangePassword && <p className="text-sm text-slate-600">Đây là lần đăng nhập đầu, bạn cần đặt mật khẩu mới trước khi tiếp tục.</p>}
        </div>
        <Alert>{error}</Alert>
        <Input label="Mật khẩu hiện tại" type="password" required value={form.current} onChange={(e) => setForm({ ...form, current: e.target.value })} />
        <Input label="Mật khẩu mới (tối thiểu 8 ký tự)" type="password" minLength={8} required value={form.next} onChange={(e) => setForm({ ...form, next: e.target.value })} />
        <Input label="Nhập lại mật khẩu mới" type="password" required value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        <Button type="submit" loading={loading} className="w-full">Lưu mật khẩu mới</Button>
      </form>
    </AuthShell>
  );
}
