import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { addDays, dayMonth, todayVN, weekdayShort } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner } from '../../components/ui';
import { Tabs } from '../finance/Finance';

const clock = (dt) => dt?.slice(11, 16) ?? '';
const nowVN = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ');
const duration = (m) => `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
const mondayOf = (date) => addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
const toInput = (dt) => (dt ? dt.slice(0, 16).replace(' ', 'T') : '');
const fromInput = (v) => (v ? v.replace('T', ' ') : null);

// Trạng thái một ca trong lịch: đã làm, đang làm, vắng, sắp tới
function shiftState(a, now) {
  if (a.clockOut) return ['green', `Đã làm ${clock(a.clockIn)}–${clock(a.clockOut)}`];
  if (a.clockIn) return ['teal', `Đang làm từ ${clock(a.clockIn)}`];
  if (a.endsAt < now) return ['red', 'Vắng'];
  return ['slate', 'Sắp tới'];
}

function Week({ venueId, query }) {
  const { notify, confirm } = useFeedback();
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayVN()));
  const [data, setData] = useState(null);
  const [holidays, setHolidays] = useState(new Map());
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const load = useCallback(() => {
    if (!venueId) return;
    api(`/shifts/schedule?from=${weekStart}&to=${addDays(weekStart, 6)}${query}`).then(setData).catch((e) => notify.error(e.message));
    const years = [...new Set([weekStart.slice(0, 4), addDays(weekStart, 6).slice(0, 4)])];
    Promise.all(years.map((y) => api(`/shifts/holidays?year=${y}`))).then((res) => setHolidays(new Map(res.flatMap((r) => r.holidays.map((h) => [h.date, h.name]))))).catch(() => {});
  }, [venueId, weekStart, query, notify]);
  useEffect(() => { load(); }, [load]);

  async function add(userId, workDate, templateId) {
    try { await api('/shifts/schedule', { method: 'POST', body: { userId, workDate, templateId: Number(templateId) } }); load(); } catch (e) { notify.error(e.message); }
  }
  async function remove(a) {
    if (!(await confirm({ title: `Xóa ${a.shiftName} của ${a.fullName}?`, message: `Ngày ${dayMonth(a.workDate)}, ${clock(a.startsAt)}–${clock(a.endsAt)}.`, confirmText: 'Xóa ca', tone: 'warning' }))) return;
    try { await api(`/shifts/schedule/${a.id}`, { method: 'DELETE' }); load(); } catch (e) { notify.error(e.message); }
  }

  const now = nowVN();
  const active = data?.templates.filter((t) => t.active) ?? [];
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-2">
          <Button kind="secondary" className="px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Tuần trước">‹</Button>
          <span className="font-semibold">{dayMonth(days[0])} – {dayMonth(days[6])}/{days[6].slice(0, 4)}</span>
          <Button kind="secondary" className="px-3 py-1.5" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Tuần sau">›</Button>
          <Button kind="ghost" className="px-3 py-1.5 text-sm" onClick={() => setWeekStart(mondayOf(todayVN()))}>Tuần này</Button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs"><Badge tone="green">Đã làm</Badge><Badge tone="teal">Đang làm</Badge><Badge tone="red">Vắng</Badge><Badge tone="slate">Sắp tới</Badge></div>
      </div>
      {!data ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] table-fixed text-sm">
            <thead>
              <tr className="text-xs text-slate-600">
                <th className="w-40 px-3 py-2 text-left font-medium">Nhân sự</th>
                {days.map((d) => (
                  <th key={d} className={`px-2 py-2 text-left font-medium ${d === todayVN() ? 'text-teal-700' : ''}`}>
                    {weekdayShort(d)} {dayMonth(d)}
                    {holidays.has(d) && <span className="mt-0.5 block truncate text-[11px] font-semibold text-red-700" title={holidays.get(d)}>{holidays.get(d)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.staff.map((p) => (
                <tr key={p.userId} className="border-t border-slate-200 align-top">
                  <td className="px-3 py-2 font-semibold">{p.fullName}<div className="text-xs font-normal text-slate-600">{p.role === 'MANAGER' ? 'Quản lý' : 'Lễ tân'}</div></td>
                  {days.map((d) => {
                    const items = data.assignments.filter((a) => a.userId === p.userId && a.workDate === d);
                    return (
                      <td key={d} className={`px-1.5 py-2 ${holidays.has(d) ? 'bg-red-50/60' : ''}`}>
                        <div className="flex flex-col gap-1">
                          {items.map((a) => {
                            const [tone, text] = shiftState(a, now);
                            return (
                              <div key={a.id} className={`group rounded-md border px-2 py-1 text-xs ${tone === 'red' ? 'border-red-200 bg-red-50' : tone === 'green' ? 'border-green-200 bg-green-50' : tone === 'teal' ? 'border-teal-300 bg-teal-50' : 'border-slate-200 bg-white'}`}>
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-semibold">{a.shiftName}</span>
                                  {!a.clockIn && <button type="button" className="text-slate-400 hover:text-red-700" onClick={() => remove(a)} aria-label={`Xóa ${a.shiftName}`}>×</button>}
                                </div>
                                <div className="tabular-nums text-slate-600">{clock(a.startsAt)}–{clock(a.endsAt)}</div>
                                <div className="text-[11px] text-slate-600">{text}</div>
                              </div>
                            );
                          })}
                          {active.length > 0 && (
                            <select className="h-7 w-full rounded-md border border-dashed border-slate-300 bg-transparent px-1 text-xs text-slate-600" value="" onChange={(e) => e.target.value && add(p.userId, d, e.target.value)} aria-label={`Thêm ca cho ${p.fullName} ngày ${dayMonth(d)}`}>
                              <option value="">+ Thêm ca</option>
                              {active.map((t) => <option key={t.id} value={t.id}>{t.name} {t.start}–{t.end}</option>)}
                            </select>
                          )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function OnDuty({ venueId, query }) {
  const { notify } = useFeedback();
  const [list, setList] = useState(null);
  const load = useCallback(() => { if (venueId) api(`/shifts/on-duty${query.replace('&', '?')}`).then((d) => setList(d.onDuty)).catch((e) => notify.error(e.message)); }, [venueId, query, notify]);
  useEffect(() => {
    load();
    const timer = setInterval(load, 30000);
    return () => clearInterval(timer);
  }, [load]);
  if (!list) return <Spinner />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <StatCard label="Đang trong ca" value={list.length} format={(n) => `${n} người`} icon="punch" tone="teal" />
      {list.length === 0 && <Card className="sm:col-span-1 xl:col-span-2"><p className="text-sm text-slate-600">Không có ai đang trong ca.</p></Card>}
      {list.map((r) => (
        <Card key={r.id} className="flex items-center justify-between gap-3 p-4">
          <div>
            <p className="font-semibold">{r.fullName}</p>
            <p className="text-sm text-slate-600">{r.shiftName ?? 'Ngoài lịch ca'} · vào lúc {clock(r.clockIn)}</p>
          </div>
          <Badge tone="green">{duration(r.minutes)}</Badge>
        </Card>
      ))}
    </div>
  );
}

function RecordEditor({ record, staff, onSave, onClose }) {
  const [form, setForm] = useState({ userId: record?.userId ?? staff[0]?.userId ?? '', clockIn: toInput(record?.clockIn), clockOut: toInput(record?.clockOut), note: '' });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const save = () => onSave({ ...(record ? {} : { userId: Number(form.userId) }), clockIn: fromInput(form.clockIn), clockOut: fromInput(form.clockOut), note: form.note });
  return (
    <Modal title={record ? `Sửa chấm công: ${record.fullName}` : 'Ghi bù chấm công'} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save} disabled={!form.note.trim() || !form.clockIn}>Lưu</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!record && <Select label="Nhân sự" className="sm:col-span-2" value={form.userId} onChange={set('userId')}>{staff.map((s) => <option key={s.userId} value={s.userId}>{s.fullName}</option>)}</Select>}
        <Input label="Vào ca" type="datetime-local" value={form.clockIn} onChange={set('clockIn')} />
        <Input label="Ra ca" type="datetime-local" value={form.clockOut} onChange={set('clockOut')} />
        <Input label="Lý do" className="sm:col-span-2" placeholder="VD: quên chấm công, máy lỗi" value={form.note} onChange={set('note')} />
      </div>
      <p className="mt-3 text-xs text-slate-600">Mọi lần sửa đều được ghi nhật ký kèm lý do. Không sửa được chấm công của chính mình, hay của tháng đã duyệt lương.</p>
    </Modal>
  );
}

function Records({ venueId, query }) {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const [records, setRecords] = useState(null);
  const [staff, setStaff] = useState([]);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    if (!venueId) return;
    api(`/shifts/attendance?month=${month}${query}`).then((d) => setRecords(d.records)).catch((e) => notify.error(e.message));
    api(`/shifts/schedule?from=${todayVN()}&to=${todayVN()}${query}`).then((d) => setStaff(d.staff.filter((s) => s.userId !== user.id))).catch(() => {});
  }, [venueId, month, query, notify, user.id]);
  useEffect(() => { load(); }, [load]);

  async function save(body) {
    try {
      if (editing === 'new') await api('/shifts/attendance', { method: 'POST', body });
      else await api(`/shifts/attendance/${editing.id}`, { method: 'PATCH', body });
      notify.success('Đã lưu chấm công');
      setEditing(null);
      load();
    } catch (e) { notify.error(e.message); }
  }

  const total = (records ?? []).reduce((s, r) => s + (r.minutes ?? 0), 0);
  return (
    <Card className="p-0">
      <div className="flex flex-wrap items-end justify-between gap-3 p-4">
        <Input label="Tháng" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <div className="flex items-center gap-3"><Badge tone="teal">Tổng {duration(total)}</Badge><Button onClick={() => setEditing('new')} disabled={!staff.length}>Ghi bù</Button></div>
      </div>
      {!records ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Nhân sự', 'Ngày', 'Vào', 'Ra', 'Thời gian', 'Ca', 'Ghi chú', ''].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {records.length === 0 && <tr><td colSpan={8} className="px-4 py-6 text-center text-slate-600">Chưa có chấm công trong tháng.</td></tr>}
              {records.map((r) => (
                <tr key={r.id} className="border-t border-slate-200">
                  <td className="px-4 py-2 font-semibold">{r.fullName}</td>
                  <td className="px-4 py-2">{dayMonth(r.clockIn.slice(0, 10))}</td>
                  <td className="px-4 py-2 tabular-nums">{clock(r.clockIn)}</td>
                  <td className="px-4 py-2 tabular-nums">{r.clockOut ? `${clock(r.clockOut)}${r.clockOut.slice(0, 10) !== r.clockIn.slice(0, 10) ? ' (+1)' : ''}` : <Badge tone="green">Đang làm</Badge>}</td>
                  <td className="px-4 py-2">{r.minutes !== null ? duration(r.minutes) : '–'}</td>
                  <td className="px-4 py-2">{r.shiftName ?? 'Ngoài lịch'}</td>
                  <td className="px-4 py-2 text-xs text-slate-600">{r.source === 'MANAGER' ? r.note : 'Tự chấm'}</td>
                  <td className="px-4 py-2 text-right">{r.userId !== user.id && <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setEditing(r)}>Sửa</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <RecordEditor record={editing === 'new' ? null : editing} staff={staff} onSave={save} onClose={() => setEditing(null)} />}
    </Card>
  );
}

function Templates({ venueId, query }) {
  const { notify } = useFeedback();
  const [templates, setTemplates] = useState(null);
  const [form, setForm] = useState({ name: '', start: '06:00', end: '14:00' });
  const load = useCallback(() => { if (venueId) api(`/shifts/templates${query.replace('&', '?')}`).then((d) => setTemplates(d.templates)).catch((e) => notify.error(e.message)); }, [venueId, query, notify]);
  useEffect(() => { load(); }, [load]);
  async function save(body, id) {
    try {
      const d = await api(id ? `/shifts/templates/${id}` : '/shifts/templates', { method: id ? 'PUT' : 'POST', body: { ...body, venueId } });
      setTemplates(d.templates);
      notify.success(id ? 'Đã cập nhật mẫu ca' : 'Đã thêm mẫu ca');
      if (!id) setForm({ name: '', start: '06:00', end: '14:00' });
    } catch (e) { notify.error(e.message); }
  }
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
      <Card className="p-0">
        {!templates ? <Spinner /> : templates.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 first:border-0">
            <div>
              <p className="font-semibold">{t.name} {!t.active && <Badge tone="slate">Ngừng dùng</Badge>}</p>
              <p className="text-sm tabular-nums text-slate-600">{t.start}–{t.end}{t.overnight ? ' (qua đêm)' : ''}</p>
            </div>
            <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => save({ name: t.name, start: t.start, end: t.end, active: !t.active }, t.id)}>{t.active ? 'Ngừng dùng' : 'Dùng lại'}</Button>
          </div>
        ))}
      </Card>
      <Card className="self-start">
        <h2 className="mb-3 font-semibold">Thêm mẫu ca</h2>
        <div className="flex flex-col gap-3">
          <Input label="Tên ca" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Bắt đầu" type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
            <Input label="Kết thúc" type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
          </div>
          <Button onClick={() => save(form)} disabled={!form.name.trim()}>Thêm mẫu ca</Button>
          <p className="text-xs text-slate-600">Giờ kết thúc nhỏ hơn giờ bắt đầu là ca qua nửa đêm. Ban đêm tính từ 22h đến 6h (Điều 106 BLLĐ 2019).</p>
        </div>
      </Card>
    </div>
  );
}

// Ca làm: xếp lịch theo tuần, xem ai đang trong ca, sửa chấm công, quản lý mẫu ca
export default function ShiftPlanner() {
  const scope = useVenueScope();
  const [tab, setTab] = useState('week');
  const query = scope.isAdmin && scope.venueId ? `&venueId=${scope.venueId}` : '';
  const props = { venueId: scope.venueId, query };
  return (
    <div>
      <PageHeader title="Ca làm & chấm công" subtitle="Xếp ca theo tuần, theo dõi vào ra ca, giờ công đổ thẳng vào bảng lương" scope={scope} />
      {!scope.venueId ? <Alert kind="warning">Chọn một cơ sở để xếp ca.</Alert> : (
        <>
          <Tabs tabs={[['week', 'Lịch tuần'], ['duty', 'Đang trong ca'], ['records', 'Chấm công'], ['templates', 'Mẫu ca']]} value={tab} onChange={setTab} />
          {tab === 'week' && <Week key={scope.venueId} {...props} />}
          {tab === 'duty' && <OnDuty key={scope.venueId} {...props} />}
          {tab === 'records' && <Records key={scope.venueId} {...props} />}
          {tab === 'templates' && <Templates key={scope.venueId} {...props} />}
        </>
      )}
    </div>
  );
}
