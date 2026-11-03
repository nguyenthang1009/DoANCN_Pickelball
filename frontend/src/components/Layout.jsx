import { Link, NavLink, Navigate, Outlet, useNavigate } from 'react-router';
import { useAuth, homeFor } from '../lib/auth';
import { Spinner } from './ui';

const ROLE_LABEL = { ADMIN: 'Admin', MANAGER: 'Quản lý', STAFF: 'Lễ tân', CUSTOMER: 'Khách hàng' };

function Brand({ to = '/' }) {
  return (
    <Link to={to} className="flex items-center gap-2 font-semibold">
      <span className="h-5 w-5 rounded-full border-2 border-teal-700 bg-lime-300" />
      Pickleball Booking
    </Link>
  );
}

// Khung trang dành cho khách: thanh trên + nội dung
export function CustomerLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 lg:px-8">
          <Brand />
          <nav className="flex items-center gap-5 text-sm">
            <NavLink to="/" end className={({ isActive }) => (isActive ? 'font-semibold' : 'text-slate-600')}>Đặt sân</NavLink>
            {user && user.role === 'CUSTOMER' && (
              <NavLink to="/lich-dat" className={({ isActive }) => (isActive ? 'font-semibold' : 'text-slate-600')}>Lịch đặt của tôi</NavLink>
            )}
            {user && user.role !== 'CUSTOMER' && <Link to={homeFor(user)} className="text-slate-600">Trang quản lý</Link>}
            {user ? (
              <div className="flex items-center gap-3">
                <span className="hidden text-slate-600 sm:inline">{user.fullName}</span>
                <button type="button" onClick={() => { logout(); navigate('/'); }} className="text-slate-600 hover:text-slate-900">Đăng xuất</button>
              </div>
            ) : (
              <Link to="/dang-nhap" className="rounded-lg bg-teal-700 px-4 py-2 font-semibold text-white">Đăng nhập</Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

// Khung trang nội bộ (POS, quản trị): thanh bên trái theo vai trò (component NavItem)
const MENU = [
  { to: '/pos', label: 'Đặt tại quầy', roles: ['STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/check-in', label: 'Check-in QR', roles: ['STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/ban-dich-vu', label: 'Bán dịch vụ', roles: ['STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/don-hom-nay', label: 'Đơn trong ngày', roles: ['STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/doanh-thu-ca', label: 'Doanh thu ca', roles: ['STAFF', 'MANAGER', 'ADMIN'] },
  { to: '/quan-ly/tong-quan', label: 'Tổng quan doanh thu', roles: ['MANAGER', 'ADMIN'] },
  { to: '/quan-ly/san', label: 'Sân & bảng giá', roles: ['MANAGER', 'ADMIN'] },
  { to: '/quan-ly/dich-vu', label: 'Danh mục dịch vụ', roles: ['MANAGER', 'ADMIN'] },
  { to: '/quan-ly/hoan-tien', label: 'Hoàn tiền', roles: ['MANAGER', 'ADMIN'] },
  { to: '/quan-tri/co-so', label: 'Cụm sân', roles: ['ADMIN'] },
  { to: '/quan-tri/tai-khoan', label: 'Tài khoản', roles: ['ADMIN'] },
];

export function StaffLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-60 shrink-0 flex-col gap-1 border-r border-slate-200 bg-white px-4 py-6">
        <div className="pb-4"><Brand to={homeFor(user)} /></div>
        {MENU.filter((m) => m.roles.includes(user.role)).map((m) => (
          <NavLink
            key={m.to}
            to={m.to}
            className={({ isActive }) => `flex items-center gap-3 rounded-lg px-3 py-2 text-sm ${isActive ? 'bg-teal-50 font-semibold text-slate-900' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {({ isActive }) => (<><span className={`h-4 w-4 rounded ${isActive ? 'bg-teal-700' : 'bg-slate-200'}`} />{m.label}</>)}
          </NavLink>
        ))}
        <Link to="/" className="mt-2 px-3 text-sm text-slate-600 hover:text-slate-900">Xem trang đặt sân</Link>
        <div className="mt-auto border-t border-slate-200 pt-4">
          <p className="font-semibold">{user.fullName}</p>
          <p className="text-xs text-slate-600">{ROLE_LABEL[user.role]}{user.venueId ? ` · Cơ sở #${user.venueId}` : ' · Toàn chuỗi'}</p>
          <button type="button" onClick={() => { logout(); navigate('/dang-nhap'); }} className="mt-2 text-sm text-slate-600 hover:text-slate-900">Đăng xuất</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6 lg:p-8"><Outlet /></main>
    </div>
  );
}

// Chặn route theo vai trò; tài khoản còn cờ đổi mật khẩu bị đưa về trang đổi mật khẩu
export function RequireRole({ roles, children }) {
  const { user, ready } = useAuth();
  if (!ready) return <Spinner />;
  if (!user) return <Navigate to="/dang-nhap" replace />;
  if (user.mustChangePassword) return <Navigate to="/doi-mat-khau" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user)} replace />;
  return children;
}
