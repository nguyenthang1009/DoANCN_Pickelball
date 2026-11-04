import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, sessionHint } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Nạp lại thông tin người dùng từ token đã lưu (khóa tài khoản / đổi vai trò có hiệu lực ngay)
  useEffect(() => {
    localStorage.removeItem('pkb_token'); // bản cũ lưu token ở đây, dễ lộ nếu dính XSS
    if (!sessionHint.get()) { setReady(true); return; }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => sessionHint.set(false))
      .finally(() => setReady(true));
  }, []);

  // Refresh token hết hạn hoặc bị thu hồi: đưa người dùng về trạng thái chưa đăng nhập
  useEffect(() => {
    const expire = () => setUser(null);
    window.addEventListener('pkb:session-expired', expire);
    return () => window.removeEventListener('pkb:session-expired', expire);
  }, []);

  const applySession = useCallback(({ user: u }) => { sessionHint.set(true); setUser(u); return u; }, []);
  const login = useCallback(async (identifier, password) => applySession(await api('/auth/login', { method: 'POST', body: { identifier, password } })), [applySession]);
  const register = useCallback(async (form) => applySession(await api('/auth/register', { method: 'POST', body: form })), [applySession]);
  const changePassword = useCallback(async (currentPassword, newPassword) => applySession(await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })), [applySession]);
  const logout = useCallback(async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    sessionHint.set(false);
    setUser(null);
  }, []);
  // Chỉ để ẩn hiện giao diện; backend vẫn kiểm tra quyền ở mọi API
  const can = useCallback((...codes) => codes.some((code) => user?.permissions?.includes(code)), [user]);

  const value = useMemo(() => ({ user, ready, login, register, changePassword, logout, can }), [user, ready, login, register, changePassword, logout, can]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Trang đầu tiên mà tài khoản nội bộ có quyền vào, theo thứ tự ưu tiên
const HOME_BY_PERMISSION = [
  ['report.revenue', '/quan-ly/tong-quan'], ['pos.create', '/pos'], ['checkin.perform', '/check-in'], ['pos.sell', '/ban-dich-vu'],
  ['booking.view_venue', '/don-hom-nay'], ['report.shift', '/doanh-thu-ca'], ['invoice.view_venue', '/hoa-don-co-so'], ['finance.view', '/tai-chinh'],
  ['payroll.manage', '/tien-luong'], ['court.manage', '/quan-ly/san'], ['price.manage', '/quan-ly/san'], ['service.manage', '/quan-ly/dich-vu'],
  ['booking.refund', '/quan-ly/hoan-tien'], ['user.view', '/quan-tri/tai-khoan'], ['payroll.view_own', '/phieu-luong'],
];

// Trang chủ theo quyền sau khi đăng nhập
export function homeFor(user) {
  if (!user) return '/';
  if (user.mustChangePassword) return '/doi-mat-khau';
  if (user.role === 'CUSTOMER') return '/';
  return HOME_BY_PERMISSION.find(([code]) => user.permissions.includes(code))?.[1] ?? '/';
}
