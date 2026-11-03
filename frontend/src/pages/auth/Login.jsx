import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth, homeFor } from '../../lib/auth';
import { Alert, Button, Card, Input } from '../../components/ui';

export default function Login() {
  const { login } = useAuth();
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
      const back = location.state?.from;
      navigate(user.role === 'CUSTOMER' && back ? back : homeFor(user), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-[640px_1fr]">
      <section className="hidden flex-col justify-center gap-6 bg-teal-700 px-20 text-white lg:flex">
        <div className="flex items-center gap-2 text-xl font-semibold"><span className="h-7 w-7 rounded-full bg-lime-300" />Pickleball Booking</div>
        <h1 className="text-[32px] font-bold leading-10">Đặt sân pickleball trong một phút, nhận vé QR ngay khi thanh toán</h1>
        <ul className="flex flex-col gap-3">
          {['Xem lịch trống của cả chuỗi sân theo thời gian thực', 'Giữ chỗ 10 phút, thanh toán VietQR, tự xác nhận', 'Đến sân, đưa mã QR cho lễ tân là vào chơi'].map((t) => (
            <li key={t} className="flex items-center gap-3"><span className="h-2 w-2 rounded-full bg-lime-300" />{t}</li>
          ))}
        </ul>
      </section>
      <section className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md">
          <form onSubmit={submit} className="flex flex-col gap-4">
            <div>
              <h2 className="text-2xl font-semibold">Đăng nhập</h2>
              <p className="text-sm text-slate-600">Dùng email hoặc số điện thoại đã đăng ký</p>
            </div>
            <Alert>{error}</Alert>
            <Input label="Email hoặc số điện thoại" name="identifier" autoComplete="username" required value={form.identifier} onChange={(e) => setForm({ ...form, identifier: e.target.value })} />
            <Input label="Mật khẩu" name="password" type="password" autoComplete="current-password" required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
            <Button type="submit" loading={loading} className="w-full">Đăng nhập</Button>
            <p className="text-center text-sm text-slate-600">Chưa có tài khoản? <Link to="/dang-ky" className="font-semibold text-slate-900">Đăng ký</Link></p>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">Nhân viên và quản lý đăng nhập lần đầu bằng mật khẩu được cấp sẽ phải đổi mật khẩu mới.</p>
            <Link to="/" className="text-center text-sm text-slate-600">← Xem lịch sân không cần đăng nhập</Link>
          </form>
        </Card>
      </section>
    </div>
  );
}
