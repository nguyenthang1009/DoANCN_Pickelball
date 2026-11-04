import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth, homeFor } from '../lib/auth';
import { useFeedback } from '../lib/feedback';
import { Icon } from './icons';
import { Ball } from './motion';
import { RouteProgress } from './RouteProgress';
import { Spinner } from './ui';

function Brand({ to = '/', light = false }) {
  return (
    <Link to={to} className={`group flex items-center gap-2 font-semibold ${light ? 'text-white' : ''}`}>
      <Ball className="h-5 w-5 transition-transform duration-500 group-hover:rotate-180" />
      <span className="hidden min-[420px]:inline">Pickleball Booking</span>
    </Link>
  );
}

// Khung trang dành cho khách: thanh trên + nội dung. fullBleed cho trang chủ dùng hết bề ngang.
export function CustomerLayout({ fullBleed = false }) {
  const { user, logout, can } = useAuth();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const link = ({ isActive }) => `nav-link ${isActive ? 'font-semibold text-slate-900' : 'text-slate-600'}`;
  return (
    <div className="min-h-screen">
      <RouteProgress />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Brand />
          <nav className="flex items-center gap-4 text-sm sm:gap-5">
            <NavLink to="/" end className={(s) => `hidden sm:inline ${link(s)}`}>Trang chủ</NavLink>
            <NavLink to="/dat-san" className={link}>Đặt sân</NavLink>
            {can('booking.view_own') && <NavLink to="/lich-dat" className={link}>Lịch đặt</NavLink>}
            {can('invoice.view_own') && <NavLink to="/hoa-don" className={link}>Hóa đơn</NavLink>}
            {user && user.role !== 'CUSTOMER' && <Link to={homeFor(user)} className="text-slate-600">Trang quản lý</Link>}
            {user ? (
              <button type="button" onClick={() => logout().then(() => { notify.info('Đã đăng xuất, hẹn gặp lại trên sân!'); navigate('/'); })} className="text-slate-600 hover:text-slate-900">Đăng xuất</button>
            ) : (
              <Link to="/dang-nhap" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white transition hover:-translate-y-px hover:bg-teal-800">Đăng nhập</Link>
            )}
          </nav>
        </div>
      </header>
      {fullBleed ? <main><Outlet /></main> : (
        <main key={pathname} className="page-enter mx-auto max-w-7xl px-4 py-8 lg:px-8">
          <Outlet />
        </main>
      )}
    </div>
  );
}

// Menu nội bộ chia theo khu vực; mục nào hiện là do quyền của tài khoản quyết định
const MENU = [
  ['Quầy lễ tân', [
    { to: '/pos', label: 'Đặt tại quầy', icon: 'pos', any: ['pos.create'] },
    { to: '/check-in', label: 'Check-in QR', icon: 'qr', any: ['checkin.perform'] },
    { to: '/ban-dich-vu', label: 'Bán dịch vụ', icon: 'cart', any: ['pos.sell'] },
    { to: '/don-hom-nay', label: 'Đơn trong ngày', icon: 'list', any: ['booking.view_venue'] },
    { to: '/doanh-thu-ca', label: 'Doanh thu ca', icon: 'clock', any: ['report.shift'] },
    { to: '/hoa-don-co-so', label: 'Hóa đơn', icon: 'invoice', any: ['invoice.view_venue'] },
  ]],
  ['Vận hành', [
    { to: '/quan-ly/tong-quan', label: 'Tổng quan', icon: 'chart', any: ['report.revenue'] },
    { to: '/quan-ly/san', label: 'Sân & bảng giá', icon: 'court', any: ['court.manage', 'price.manage'] },
    { to: '/quan-ly/dich-vu', label: 'Dịch vụ', icon: 'drink', any: ['service.manage'] },
    { to: '/quan-ly/hoan-tien', label: 'Hoàn tiền', icon: 'refund', any: ['booking.refund'] },
  ]],
  ['Tài chính', [
    { to: '/tai-chinh', label: 'Tài chính & thuế', icon: 'finance', any: ['finance.view'] },
    { to: '/tien-luong', label: 'Tiền lương', icon: 'salary', any: ['payroll.manage', 'payroll.approve'] },
    { to: '/phieu-luong', label: 'Phiếu lương của tôi', icon: 'wallet', any: ['payroll.view_own'], hideForAdmin: true },
  ]],
  ['Quản trị', [
    { to: '/quan-tri/co-so', label: 'Cụm sân', icon: 'venue', any: ['venue.manage'] },
    { to: '/quan-tri/tai-khoan', label: 'Tài khoản', icon: 'users', any: ['user.view'] },
    { to: '/quan-tri/phan-quyen', label: 'Phân quyền', icon: 'shield', any: ['role.manage'] },
    { to: '/quan-tri/noi-dung', label: 'Ảnh & nội dung', icon: 'image', any: ['site.manage'] },
    { to: '/quan-tri/tham-so', label: 'Tham số pháp lý', icon: 'scale', any: ['legal.manage'] },
  ]],
];

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  const text = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  return <span className="hidden text-sm text-slate-600 sm:inline">{text}</span>;
}

export function StaffLayout() {
  const { user, logout, can } = useAuth();
  const { notify } = useFeedback();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);

  const groups = MENU.map(([title, items]) => [title, items.filter((m) => can(...m.any) && !(m.hideForAdmin && user.role === 'ADMIN'))]).filter(([, items]) => items.length);
  const current = MENU.flatMap(([title, items]) => items.map((m) => ({ ...m, group: title }))).find((m) => pathname.startsWith(m.to));
  const initials = user.fullName.replace(/\(.*\)/, '').trim().split(/\s+/).slice(-2).map((w) => w[0]).join('').toUpperCase();

  return (
    <div className="staff-shell min-h-screen lg:flex">
      <RouteProgress />
      {open && <button type="button" aria-label="Đóng menu" className="fixed inset-0 z-30 bg-slate-950/60 lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`staff-sidebar fixed inset-y-0 left-0 z-40 flex w-64 shrink-0 flex-col transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <Brand to={homeFor(user)} light />
          <button type="button" aria-label="Đóng menu" className="text-slate-400 lg:hidden" onClick={() => setOpen(false)}><Icon name="close" /></button>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-3">
          {groups.map(([title, items]) => (
            <div key={title} className="mt-4">
              <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-widest text-slate-500">{title}</p>
              {items.map((m) => (
                <NavLink key={m.to} to={m.to} className={({ isActive }) => `staff-link ${isActive ? 'staff-link-active' : ''}`}>
                  <Icon name={m.icon} className="h-[18px] w-[18px] shrink-0" />{m.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-lime-300 text-sm font-black text-slate-900">{initials}</span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.fullName}</p>
              <p className="truncate text-xs text-slate-400">{user.roleName}{user.venueId ? ` · Cơ sở #${user.venueId}` : ' · Toàn chuỗi'}</p>
            </div>
          </div>
          <div className="mt-3 flex gap-2 text-sm">
            <Link to="/dat-san" className="staff-action"><Icon name="globe" className="h-4 w-4" />Website</Link>
            <button type="button" onClick={() => logout().then(() => { notify.info('Đã đăng xuất'); navigate('/dang-nhap'); })} className="staff-action"><Icon name="logout" className="h-4 w-4" />Thoát</button>
          </div>
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        <div className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/85 px-4 backdrop-blur lg:px-8">
          <button type="button" aria-label="Mở menu" className="text-slate-700 lg:hidden" onClick={() => setOpen(true)}><Icon name="menu" /></button>
          <p className="min-w-0 truncate text-sm text-slate-600">{current?.group} <span className="px-1 text-slate-300">/</span> <span className="font-semibold text-slate-900">{current?.label}</span></p>
          <div className="ml-auto"><Clock /></div>
        </div>
        <main key={pathname} className="page-enter min-w-0 p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}

// Chặn route theo mã quyền (any) hoặc chỉ cho tài khoản nội bộ (internal);
// tài khoản còn cờ đổi mật khẩu bị đưa về trang đổi mật khẩu
export function RequireAccess({ any, internal = false, children }) {
  const { user, ready, can } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (user.mustChangePassword) return <Navigate to="/doi-mat-khau" replace />;
  if ((internal && user.role === 'CUSTOMER') || (any && !can(...any))) return <Navigate to={homeFor(user)} replace />;
  return children;
}
