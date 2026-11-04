import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { useSite } from '../../lib/site';
import AuthShell from '../../components/AuthShell';
import { Alert, Button, Input } from '../../components/ui';

const IMAGES = ['auth.register.1', 'auth.register.2', 'auth.register.3'];

export default function Register() {
  const { register } = useAuth();
  const { notify } = useFeedback();
  const { media } = useSite();
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
      notify.success('Tạo tài khoản thành công, chọn sân thôi!');
      navigate('/dat-san', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      images={IMAGES.map(media)}
      eyebrow="Gia nhập cộng đồng"
      title="Tạo tài khoản, vào sân ngay"
      points={['Đặt sân online mọi lúc', 'Lưu lịch đặt và vé QR trên một tài khoản', 'Không cần cài ứng dụng']}
    >
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <h2 className="sport-title text-3xl">Đăng ký</h2>
          <p className="text-sm text-slate-600">Tạo tài khoản khách hàng chỉ trong một phút</p>
        </div>
        <Alert>{error}</Alert>
        <Input label="Họ và tên" required value={form.fullName} onChange={set('fullName')} />
        <Input label="Email" type="email" required value={form.email} onChange={set('email')} />
        <Input label="Số điện thoại" inputMode="numeric" required value={form.phone} onChange={set('phone')} error={phoneError} />
        <Input label="Mật khẩu (tối thiểu 8 ký tự)" type="password" minLength={8} required value={form.password} onChange={set('password')} />
        <Button type="submit" loading={loading} className="w-full">Đăng ký</Button>
        <p className="text-center text-sm text-slate-600">Đã có tài khoản? <Link to="/dang-nhap" className="font-semibold text-teal-700">Đăng nhập</Link></p>
      </form>
    </AuthShell>
  );
}
