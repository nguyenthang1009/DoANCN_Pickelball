import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth, homeFor } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { useSite } from '../../lib/site';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';

const IMAGES = ['auth.login.1', 'auth.login.2', 'auth.login.3'];

export default function Login() {
  const { login } = useAuth();
  const { notify } = useFeedback();
  const { media } = useSite();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const user = await login(form.identifier.trim(), form.password);
      notify.success(`Chào ${user.fullName}, sẵn sàng ra sân!`);
      const back = location.state?.from;
      navigate(user.role === 'CUSTOMER' && back ? back : homeFor(user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      images={IMAGES.map(media)}
      eyebrow="Sẵn sàng ra sân"
      title="Giờ đẹp đang chờ bạn"
      points={['Xem lịch trống theo thời gian thực', 'Giữ chỗ, thanh toán VietQR, tự xác nhận', 'Đến sân, đưa mã QR cho lễ tân là vào chơi']}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="sport-title text-3xl">Đăng nhập</h2>
          <p className="text-sm text-slate-600">Dùng email hoặc số điện thoại đã đăng ký</p>
        </div>
        <Alert>{error}</Alert>
        <Input label="Email hoặc số điện thoại" name="identifier" autoComplete="username" required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
        <Input label="Mật khẩu" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <Button type="submit" loading={loading} className="w-full">Đăng nhập</Button>
        <p className="text-center text-sm text-slate-600">Chưa có tài khoản? <Link to="/dang-ky" className="font-semibold text-teal-700">Đăng ký</Link></p>
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Nhân viên và quản lý đăng nhập lần đầu bằng mật khẩu được cấp sẽ phải đổi mật khẩu mới.</p>
        <Link to="/dat-san" className="text-center text-sm text-slate-600 hover:text-slate-900">← Xem lịch sân không cần đăng nhập</Link>
      </form>
    </AuthShell>
  );
}
