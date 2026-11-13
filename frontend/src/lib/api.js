export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const SESSION_KEY = 'pkb_session';
const SESSION_ERRORS = ['TOKEN_EXPIRED', 'UNAUTHENTICATED', 'INVALID_TOKEN'];
const NO_RETRY = ['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'];

// Token nằm trong cookie httpOnly nên JavaScript không đọc được. Cờ này không chứa bí mật,
// chỉ cho biết trình duyệt từng đăng nhập để khách vãng lai không phải gọi /auth/me vô ích.
export const sessionHint = {
  get: () => localStorage.getItem(SESSION_KEY) === '1',
  set: (on) => (on ? localStorage.setItem(SESSION_KEY, '1') : localStorage.removeItem(SESSION_KEY)),
};

// Báo cho thanh tiến độ biết có bao nhiêu request đang chờ
const track = (promise) => {
  window.dispatchEvent(new CustomEvent('pkb:loading', { detail: 1 }));
  return promise.finally(() => window.dispatchEvent(new CustomEvent('pkb:loading', { detail: -1 })));
};

function send(path, { method = 'GET', body } = {}) {
  const headers = body !== undefined ? { 'Content-Type': 'application/json' } : {};
  return track(fetch(`/api${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined }));
}

// Nhiều request cùng hết hạn thì chỉ làm mới phiên một lần. Trả về mã HTTP, 0 khi mất mạng.
let refreshing = null;
function refreshSession() {
  refreshing ??= send('/auth/refresh', { method: 'POST' }).then((r) => r.status).catch(() => 0).finally(() => { refreshing = null; });
  return refreshing;
}

// Gửi file ảnh nguyên bản trong body
export async function uploadImage(path, file) {
  const res = await track(fetch(`/api${path}`, { method: 'PUT', headers: { 'Content-Type': file.type }, credentials: 'include', body: file }));
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error?.code || 'HTTP_ERROR', data?.error?.message || `Lỗi máy chủ (${res.status})`);
  return data;
}

// Gọi API backend; lỗi trả về dạng { error: { code, message } } được ném thành ApiError.
// Token truy cập hết hạn thì tự làm mới phiên rồi gửi lại đúng một lần.
export async function api(path, options = {}) {
  let res = await send(path, options);
  let data = await res.json().catch(() => null);
  if (res.status === 401 && sessionHint.get() && SESSION_ERRORS.includes(data?.error?.code) && !NO_RETRY.includes(path)) {
    const status = await refreshSession();
    if (status >= 200 && status < 300) {
      res = await send(path, options);
      data = await res.json().catch(() => null);
    } else if (status === 401 || status === 403) {
      sessionHint.set(false);
      window.dispatchEvent(new Event('pkb:session-expired'));
    } else {
      // Bị giới hạn tần suất, mất mạng hay máy chủ lỗi: phiên vẫn còn, chỉ báo lỗi chứ không đăng xuất
      throw status === 429
        ? new ApiError(429, 'RATE_LIMITED', 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút')
        : new ApiError(status || 503, 'NETWORK_ERROR', 'Không kết nối được máy chủ, vui lòng thử lại');
    }
  }
  if (!res.ok) {
    // Ca vừa hết giờ trong lúc đang thao tác: báo khung trang cập nhật trạng thái ca để khóa giao diện
    if (data?.error?.code === 'NOT_ON_DUTY') window.dispatchEvent(new Event('pkb:duty-refresh'));
    throw new ApiError(res.status, data?.error?.code || 'HTTP_ERROR', data?.error?.message || `Lỗi máy chủ (${res.status})`);
  }
  return data;
}
