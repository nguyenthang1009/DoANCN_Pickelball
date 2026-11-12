const { session } = require('../config/env');

const ACCESS_COOKIE = 'pkb_at';
const REFRESH_COOKIE = 'pkb_rt';

// httpOnly: JavaScript không đọc được token dù trang dính XSS. SameSite=Lax: trang khác không gửi kèm khi POST.
const BASE = { httpOnly: true, secure: session.cookieSecure, sameSite: 'lax' };
const ACCESS_OPTIONS = { ...BASE, path: '/api', maxAge: session.accessMinutes * 60 * 1000 };
// Refresh token chỉ được gửi tới nhóm API /auth
const REFRESH_OPTIONS = { ...BASE, path: '/api/auth', maxAge: session.refreshDays * 86400 * 1000 };

function setSessionCookies(res, accessToken, refreshToken) {
  res.cookie(ACCESS_COOKIE, accessToken, ACCESS_OPTIONS);
  res.cookie(REFRESH_COOKIE, refreshToken, REFRESH_OPTIONS);
}

function clearSessionCookies(res) {
  res.clearCookie(ACCESS_COOKIE, { ...BASE, path: ACCESS_OPTIONS.path });
  res.clearCookie(REFRESH_COOKIE, { ...BASE, path: REFRESH_OPTIONS.path });
}

module.exports = { ACCESS_COOKIE, REFRESH_COOKIE, setSessionCookies, clearSessionCookies };
