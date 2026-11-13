import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { todayVN, addDays } from '../../lib/format';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Badge, Button, Card, Input, Modal, Select, Spinner } from '../../components/ui';
import { Tabs } from '../finance/Finance';

// Tên thao tác dễ đọc và màu theo mức độ nhạy cảm
const ACTIONS = {
  POS_BOOKING: ['Đặt sân tại quầy', 'teal', 'booking'], SELL_SERVICE: ['Bán dịch vụ', 'teal', 'booking'], CHECK_IN: ['Check-in khách', 'teal', 'booking'],
  CANCEL_BOOKING: ['Hủy đơn', 'red', 'booking'], CONFIRM_REFUND: ['Xác nhận hoàn tiền', 'red', 'booking'], MOVE_BOOKING: ['Đổi sân cho khách', 'amber', 'booking'],
  PAYOS_WEBHOOK: ['PayOS báo đã thanh toán', 'slate', 'booking'],
  CLOCK_IN: ['Vào ca', 'green', 'shift'], CLOCK_OUT: ['Ra ca', 'green', 'shift'], AUTO_CLOCK_OUT: ['Hệ thống tự kết thúc ca', 'amber', 'shift'],
  ADD_ATTENDANCE: ['Ghi bù chấm công', 'amber', 'shift'], EDIT_ATTENDANCE: ['Sửa giờ chấm công', 'amber', 'shift'], ASSIGN_SHIFT: ['Xếp ca', 'slate', 'shift'],
  UNASSIGN_SHIFT: ['Xóa ca đã xếp', 'slate', 'shift'], SAVE_SHIFT_TEMPLATE: ['Sửa mẫu ca', 'slate', 'shift'], ADD_HOLIDAY: ['Thêm ngày lễ', 'slate', 'shift'], REMOVE_HOLIDAY: ['Bỏ ngày lễ', 'slate', 'shift'],
  LOGIN: ['Đăng nhập', 'slate', 'account'], LOGIN_FAILED: ['Đăng nhập sai', 'red', 'account'], CREATE_USER: ['Tạo tài khoản', 'teal', 'account'],
  UPDATE_USER: ['Sửa thông tin nhân sự', 'amber', 'account'], RESET_PASSWORD: ['Đặt lại mật khẩu', 'amber', 'account'], LOCK_USER: ['Khóa tài khoản', 'red', 'account'],
  UNLOCK_USER: ['Mở khóa tài khoản', 'green', 'account'], ASSIGN_ROLE: ['Đổi vai trò', 'amber', 'account'], CREATE_ROLE: ['Tạo vai trò', 'slate', 'account'],
  UPDATE_ROLE: ['Sửa quyền của vai trò', 'amber', 'account'], DELETE_ROLE: ['Xóa vai trò', 'red', 'account'],
  UPDATE_PRICE: ['Đổi bảng giá sân', 'amber', 'catalog'], COURT_STATUS: ['Đổi trạng thái sân', 'amber', 'catalog'], CREATE_COURT: ['Thêm sân', 'slate', 'catalog'],
  UPDATE_COURT: ['Sửa sân', 'slate', 'catalog'], DELETE_COURT: ['Xóa sân', 'red', 'catalog'], CREATE_VENUE: ['Thêm cơ sở', 'slate', 'catalog'], UPDATE_VENUE: ['Sửa cơ sở', 'slate', 'catalog'],
  CREATE_SERVICE: ['Thêm món dịch vụ', 'slate', 'catalog'], UPDATE_SERVICE: ['Sửa món, giá dịch vụ', 'amber', 'catalog'], UPDATE_SERVICE_IMAGE: ['Đổi ảnh món', 'slate', 'catalog'],
  REMOVE_SERVICE_IMAGE: ['Gỡ ảnh món', 'slate', 'catalog'], LIGHTING_MODE: ['Đổi chế độ đèn', 'slate', 'catalog'], LIGHTING_BULB: ['Gán đèn cho sân', 'slate', 'catalog'],
  SAVE_CONTRACT: ['Lập, sửa hợp đồng lương', 'amber', 'money'], CREATE_PAYROLL: ['Tạo bảng lương', 'slate', 'money'], DELETE_PAYROLL: ['Xóa bảng lương nháp', 'amber', 'money'],
  SYNC_ATTENDANCE: ['Tính lương từ chấm công', 'slate', 'money'], APPROVE_PAYROLL: ['Duyệt bảng lương', 'teal', 'money'], PAY_PAYROLL: ['Chi trả lương', 'teal', 'money'],
  ADD_LEGAL_PARAMETER: ['Đổi tham số pháp lý', 'amber', 'money'], UPDATE_SITE_SETTINGS: ['Sửa thông tin website', 'slate', 'catalog'],
  REPLACE_SITE_IMAGE: ['Đổi ảnh website', 'slate', 'catalog'], RESET_SITE_IMAGE: ['Khôi phục ảnh website', 'slate', 'catalog'],
};
const GROUPS = [['', 'Mọi thao tác'], ['booking', 'Đặt sân, hủy, hoàn tiền'], ['shift', 'Ca làm, chấm công'], ['account', 'Tài khoản, phân quyền'], ['catalog', 'Sân, giá, dịch vụ'], ['money', 'Lương, tham số']];
const ROLE = { ADMIN: 'Admin', MANAGER: 'Quản lý', STAFF: 'Lễ tân' };
const SEVERITY = { high: ['red', 'Cao'], medium: ['amber', 'Trung bình'], low: ['slate', 'Thấp'] };
const FIELD = {
  bookingCode: 'Mã đơn', paymentMethod: 'Thanh toán', paymentStatus: 'Trạng thái', courtId: 'Sân', date: 'Ngày', start: 'Bắt đầu', end: 'Kết thúc', amount: 'Số tiền',
  clockIn: 'Vào ca', clockOut: 'Ra ca', lateMinutes: 'Trễ (phút)', shift: 'Ca', shiftStart: 'Giờ bắt đầu ca', userId: 'Nhân sự', isActive: 'Đang hoạt động', fullName: 'Họ tên',
  phone: 'Điện thoại', venueId: 'Cơ sở', role: 'Vai trò', name: 'Tên', status: 'Trạng thái', reason: 'Lý do', ip: 'Địa chỉ IP', month: 'Tháng', imageUrl: 'Ảnh', unitPrice: 'Đơn giá',
};
const label = (a) => ACTIONS[a]?.[0] ?? a;
const show = (v) => (v === null || v === undefined || v === '' ? '–' : typeof v === 'boolean' ? (v ? 'Có' : 'Không') : typeof v === 'object' ? JSON.stringify(v) : String(v));
const dateTime = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}`;

function Detail({ item, onClose }) {
  const keys = [...new Set([...Object.keys(item.oldValues || {}), ...Object.keys(item.newValues || {})])];
  return (
    <Modal title={label(item.action)} onClose={onClose} footer={<Button kind="ghost" onClick={onClose}>Đóng</Button>}>
      <dl className="grid grid-cols-[120px_1fr] gap-x-3 gap-y-1.5 text-sm">
        <dt className="text-slate-600">Thời điểm</dt><dd>{item.at}</dd>
        <dt className="text-slate-600">Người thực hiện</dt><dd>{item.actor ? `${item.actor.name} (${ROLE[item.actor.role] ?? item.actor.role})` : 'Hệ thống'}</dd>
        <dt className="text-slate-600">Cơ sở</dt><dd>{item.venue?.name ?? 'Toàn chuỗi'}</dd>
        <dt className="text-slate-600">Đối tượng</dt><dd>{item.entityLabel ?? `${item.entityType} #${item.entityId}`}</dd>
        {item.reason && <><dt className="text-slate-600">Lý do</dt><dd className="font-medium">{item.reason}</dd></>}
      </dl>
      {keys.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600"><tr><th className="px-3 py-2 text-left font-medium">Thông tin</th><th className="px-3 py-2 text-left font-medium">Trước</th><th className="px-3 py-2 text-left font-medium">Sau</th></tr></thead>
            <tbody>
              {keys.map((k) => {
                const before = item.oldValues?.[k];
                const after = item.newValues?.[k];
                const changed = item.oldValues && JSON.stringify(before) !== JSON.stringify(after);
                return (
                  <tr key={k} className={`border-t border-slate-200 ${changed ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-1.5 text-slate-600">{FIELD[k] ?? k}</td>
                    <td className="max-w-[220px] break-words px-3 py-1.5">{item.oldValues ? show(before) : ''}</td>
                    <td className="max-w-[220px] break-words px-3 py-1.5 font-medium">{show(after)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

function Log({ filters, venues, params, setParams }) {
  const { notify } = useFeedback();
  const [data, setData] = useState(null);
  const [viewing, setViewing] = useState(null);
  const q = Object.fromEntries(params.entries());
  const group = q.group || '';
  useEffect(() => {
    setData(null);
    const action = group ? Object.entries(ACTIONS).filter(([, v]) => v[2] === group).map(([k]) => k).join(',') : (q.action || '');
    const query = new URLSearchParams({ from: q.from || addDays(todayVN(), -6), to: q.to || todayVN(), page: q.page || '1', ...(q.actor ? { actorId: q.actor } : {}), ...(q.venue ? { venueId: q.venue } : {}), ...(action ? { action } : {}), ...(q.q ? { q: q.q } : {}) });
    api(`/admin/activity?${query}`).then(setData).catch((e) => notify.error(e.message));
  }, [params, group, notify]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (key, value) => { const next = new URLSearchParams(params); if (value) next.set(key, value); else next.delete(key); if (key !== 'page') next.delete('page'); setParams(next); };
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-6">
        <Input label="Từ ngày" type="date" value={q.from || addDays(todayVN(), -6)} onChange={(e) => set('from', e.target.value)} />
        <Input label="Đến ngày" type="date" value={q.to || todayVN()} onChange={(e) => set('to', e.target.value)} />
        <Select label="Nhân sự" value={q.actor || ''} onChange={(e) => set('actor', e.target.value)}>
          <option value="">Tất cả</option>
          {filters?.actors.map((a) => <option key={a.id} value={a.id}>{a.name} · {ROLE[a.role]}</option>)}
        </Select>
        <Select label="Cơ sở" value={q.venue || ''} onChange={(e) => set('venue', e.target.value)}>
          <option value="">Tất cả</option>
          {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
        </Select>
        <Select label="Nhóm thao tác" value={group} onChange={(e) => set('group', e.target.value)}>{GROUPS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select>
        <form onSubmit={(e) => { e.preventDefault(); set('q', new FormData(e.currentTarget).get('q')); }}>
          <Input label="Tìm mã đơn, nội dung" name="q" defaultValue={q.q || ''} placeholder="VD: PKB-..." />
        </form>
      </Card>
      <Card className="p-0">
        {!data ? <Spinner /> : (
          <>
            <div className="flex items-center justify-between px-4 py-3 text-sm text-slate-600"><span>{data.total.toLocaleString('vi-VN')} thao tác từ {data.from.split('-').reverse().join('/')} đến {data.to.split('-').reverse().join('/')}</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="text-xs text-slate-600"><tr>{['Thời gian', 'Người thực hiện', 'Cơ sở', 'Thao tác', 'Đối tượng', ''].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.items.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-600">Không có thao tác nào khớp bộ lọc.</td></tr>}
                  {data.items.map((it) => (
                    <tr key={it.id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-2 tabular-nums">{dateTime(it.at)}</td>
                      <td className="px-4 py-2">{it.actor ? <><span className="font-semibold">{it.actor.name}</span><span className="block text-xs text-slate-600">{ROLE[it.actor.role] ?? it.actor.role}</span></> : <span className="text-slate-600">Hệ thống</span>}</td>
                      <td className="px-4 py-2 text-slate-600">{it.venue?.name?.replace('Cụm sân Pickleball ', '') ?? 'Toàn chuỗi'}</td>
                      <td className="px-4 py-2"><Badge tone={ACTIONS[it.action]?.[1] ?? 'slate'}>{label(it.action)}</Badge></td>
                      <td className="px-4 py-2">{it.entityLabel ?? <span className="text-slate-600">{it.entityType} #{it.entityId}</span>}{it.reason && <span className="block max-w-[260px] truncate text-xs text-slate-600" title={it.reason}>Lý do: {it.reason}</span>}</td>
                      <td className="px-4 py-2 text-right"><Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setViewing(it)}>Chi tiết</Button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pages > 1 && (
              <div className="flex items-center justify-end gap-2 px-4 py-3 text-sm">
                <Button kind="secondary" className="px-3 py-1" disabled={data.page <= 1} onClick={() => set('page', String(data.page - 1))}>Trước</Button>
                <span>Trang {data.page}/{pages}</span>
                <Button kind="secondary" className="px-3 py-1" disabled={data.page >= pages} onClick={() => set('page', String(data.page + 1))}>Sau</Button>
              </div>
            )}
          </>
        )}
      </Card>
      {viewing && <Detail item={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Alerts({ venues, onOpenBooking }) {
  const { notify } = useFeedback();
  const [range, setRange] = useState({ from: addDays(todayVN(), -29), to: todayVN(), venue: '' });
  const [data, setData] = useState(null);
  useEffect(() => {
    setData(null);
    api(`/admin/activity/alerts?from=${range.from}&to=${range.to}${range.venue ? `&venueId=${range.venue}` : ''}`).then(setData).catch((e) => notify.error(e.message));
  }, [range, notify]);
  return (
    <div className="flex flex-col gap-4">
      <Card className="grid gap-3 p-4 sm:grid-cols-3">
        <Input label="Từ ngày" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="Đến ngày" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
        <Select label="Cơ sở" value={range.venue} onChange={(e) => setRange({ ...range, venue: e.target.value })}><option value="">Tất cả</option>{venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select>
      </Card>
      {!data ? <Spinner /> : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Mức cao" value={data.summary.high} format={(n) => `${n} cảnh báo`} note="Cần xem ngay" icon="shield" tone={data.summary.high ? 'amber' : 'white'} />
            <StatCard label="Mức trung bình" value={data.summary.medium} format={(n) => `${n} cảnh báo`} note="Nên kiểm tra" icon="clock" tone="slate" delay={80} />
            <StatCard label="Mức thấp" value={data.summary.low} format={(n) => `${n} ghi nhận`} note="Để theo dõi" icon="list" delay={160} />
          </div>
          {data.alerts.length === 0 ? <Card><p className="text-sm text-slate-600">Không có dấu hiệu bất thường trong khoảng thời gian này.</p></Card> : (
            <div className="flex flex-col gap-3">
              {data.alerts.map((a, i) => (
                <Card key={i} className={`alert-card alert-${a.severity} p-4`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold">{a.title}</p>
                      <p className="mt-1 text-sm text-slate-700">{a.detail}</p>
                      <p className="mt-1 text-xs text-slate-600">{a.at ? dateTime(a.at) : ''}{a.venue ? ` · ${a.venue}` : ''}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge tone={SEVERITY[a.severity][0]}>{SEVERITY[a.severity][1]}</Badge>
                      {a.bookingCode && <button type="button" className="text-xs font-semibold text-teal-700 hover:underline" onClick={() => onOpenBooking(a.bookingCode)}>Xem lịch sử đơn {a.bookingCode}</button>}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
          <p className="text-xs text-slate-600">Cảnh báo là dấu hiệu cần Admin kiểm tra lại (đối chiếu camera, sổ thu tiền, hỏi nhân viên), không phải kết luận vi phạm.</p>
        </>
      )}
    </div>
  );
}

// Nhật ký hoạt động: kiểm soát thao tác của nhân sự, phát hiện lách quy trình (đặt sân cho người nhà, hủy đơn đã thu tiền...)
export default function Activity() {
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState(null);
  const [venues, setVenues] = useState([]);
  const tab = params.get('tab') || 'log';
  useEffect(() => {
    api('/admin/activity/filters').then(setFilters).catch(() => {});
    api('/admin/venues').then((d) => setVenues(d.venues)).catch(() => {});
  }, []);
  const setTab = useCallback((t) => { const next = new URLSearchParams(params); next.set('tab', t); setParams(next); }, [params, setParams]);
  const openBooking = (code) => setParams(new URLSearchParams({ tab: 'log', q: code, from: addDays(todayVN(), -89) }));
  const tabs = useMemo(() => [['log', 'Hoạt động'], ['alerts', 'Cảnh báo bất thường']], []);
  return (
    <div>
      <PageHeader title="Nhật ký hoạt động" subtitle="Ai làm gì, lúc nào, ở đâu; giá trị trước và sau mỗi thao tác. Không ai sửa hay xóa được nhật ký." />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'log' ? <Log filters={filters} venues={venues} params={params} setParams={setParams} /> : <Alerts venues={venues} onOpenBooking={openBooking} />}
    </div>
  );
}
