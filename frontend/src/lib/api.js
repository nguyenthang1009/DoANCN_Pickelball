export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const TOKEN_KEY = 'pkb_token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)),
};

// Gọi API backend; lỗi trả về dạng { error: { code, message } } được ném thành ApiError
export async function api(path, { method = 'GET', body } = {}) {
  const token = tokenStore.get();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code || 'HTTP_ERROR', data?.error?.message || `Lỗi máy chủ (${res.status})`);
  }
  return data;
}
