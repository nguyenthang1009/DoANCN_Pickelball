// Cho một nhân sự vào ca để kiểm thử thao tác tại quầy: tạo mẫu ca đang diễn ra (từ đầu giờ hiện tại, dài 4 tiếng),
// phân công cho người đó hôm nay rồi vào ca bằng chính tài khoản của họ. Dùng chung cho các script kiểm thử.
async function api(base, path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) }, body: body && JSON.stringify(body) });
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function liveTemplate(base, assignerToken, venueId) {
  const now = new Date(Date.now() + 7 * 3600e3);
  const hour = now.getUTCHours();
  const name = `Ca kiểm thử ${String(hour).padStart(2, '0')}h`;
  const query = venueId ? `?venueId=${venueId}` : '';
  const list = (await api(base, `/shifts/templates${query}`, { token: assignerToken })).data?.templates ?? [];
  const found = list.find((t) => t.name === name);
  if (found) return found.id;
  const created = await api(base, '/shifts/templates', { method: 'POST', token: assignerToken, body: { name, start: `${String(hour).padStart(2, '0')}:00`, end: `${String((hour + 4) % 24).padStart(2, '0')}:00`, venueId } });
  if (created.status !== 200) throw new Error(`Không tạo được mẫu ca: ${JSON.stringify(created.data)}`);
  return created.data.templates.find((t) => t.name === name).id;
}

// assignerToken: Quản lý hoặc Admin có quyền xếp ca. Trả về trạng thái chấm công của người được vào ca.
async function putOnDuty(base, { assignerToken, userId, userToken, venueId }) {
  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const templateId = await liveTemplate(base, assignerToken, venueId);
  const assigned = await api(base, '/shifts/schedule', { method: 'POST', token: assignerToken, body: { userId, workDate: today, templateId } });
  if (assigned.status !== 200 && assigned.data?.error?.code !== 'SHIFT_OVERLAP') throw new Error(`Không xếp được ca: ${JSON.stringify(assigned.data)}`);
  const me = await api(base, '/shifts/me', { token: userToken });
  if (me.data?.onDuty) return me.data;
  const clocked = await api(base, '/shifts/me/clock-in', { method: 'POST', token: userToken });
  if (clocked.status !== 200) throw new Error(`Không vào ca được: ${JSON.stringify(clocked.data)}`);
  return clocked.data;
}

module.exports = { putOnDuty, liveTemplate };
