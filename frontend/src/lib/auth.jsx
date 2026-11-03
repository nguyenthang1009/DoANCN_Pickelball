import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, tokenStore } from './api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  // Nạp lại thông tin người dùng từ token đã lưu (khóa tài khoản / đổi vai trò có hiệu lực ngay)
  useEffect(() => {
    if (!tokenStore.get()) { setReady(true); return; }
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => tokenStore.set(null))
      .finally(() => setReady(true));
  }, []);

  const applySession = useCallback(({ token, user: u }) => { tokenStore.set(token); setUser(u); return u; }, []);
  const login = useCallback(async (identifier, password) => applySession(await api('/auth/login', { method: 'POST', body: { identifier, password } })), [applySession]);
  const register = useCallback(async (form) => applySession(await api('/auth/register', { method: 'POST', body: form })), [applySession]);
  const changePassword = useCallback(async (currentPassword, newPassword) => applySession(await api('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })), [applySession]);
  const logout = useCallback(() => { tokenStore.set(null); setUser(null); }, []);

  const value = useMemo(() => ({ user, ready, login, register, changePassword, logout }), [user, ready, login, register, changePassword, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

// Trang chủ theo vai trò sau khi đăng nhập
export function homeFor(user) {
  if (!user) return '/';
  if (user.mustChangePassword) return '/doi-mat-khau';
  if (user.role === 'STAFF') return '/pos';
  if (user.role === 'MANAGER' || user.role === 'ADMIN') return '/quan-ly/tong-quan';
  return '/';
}
