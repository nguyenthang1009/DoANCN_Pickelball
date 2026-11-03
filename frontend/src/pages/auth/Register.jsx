import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth';
import { Alert, Button, Card, Input } from '../../components/ui';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const phoneError = form.phone && !/^0\d{9}$/.test(form.phone) ? 'Số điện thoại phải gồm 10 chữ số, bắt đầu bằng 0' : '';

  async function submit(e) {
    e.preventDefault();
    if (phoneError) return;
    setError(''); setLoading(true);
    try {
      await register({ ...form, fullName: form.fullName.trim(), email: form.email.trim() });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <form onSubmit={submit} className="flex flex-col gap-4">
          <h2 className="text-2xl font-semibold">Tạo tài khoản khách hàng</h2>
          <Alert>{error}</Alert>
          <Input label="Họ và tên" required value={form.fullName} onChange={set('fullName')} />
          <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
          <Input label="Số điện thoại" inputMode="numeric" required value={form.phone} onChange={set('phone')} error={phoneError} />
          <Input label="Mật khẩu (tối thiểu 8 ký tự)" type="password" minLength={8} required value={form.password} onChange={set('password')} />
          <Button type="submit" loading={loading} className="w-full">Đăng ký</Button>
          <p className="text-center text-sm text-slate-600">Đã có tài khoản? <Link to="/dang-nhap" className="font-semibold text-slate-900">Đăng nhập</Link></p>
        </form>
      </Card>
    </div>
  );
}
