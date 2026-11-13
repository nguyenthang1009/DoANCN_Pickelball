import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { useDuty } from '../../lib/duty';
import { dayMonth, fullDate } from '../../lib/format';
import PageHeader from '../../components/PageHeader';
import { Icon } from '../../components/icons';
import { Alert, Badge, Button, Card, Spinner } from '../../components/ui';

const clock = (dt) => dt?.slice(11, 16) ?? '';
const duration = (minutes) => `${Math.floor(minutes / 60)} giờ ${String(minutes % 60).padStart(2, '0')} phút`;
const elapsedFrom = (since, now) => Math.max(0, Math.floor((Date.parse(now.replace(' ', 'T')) - Date.parse(since.replace(' ', 'T'))) / 60000));

// Chấm công của chính mình: vào ca, ra ca, lịch ca sắp tới, giờ làm trong tháng
export default function MyAttendance() {
  const { notify, confirm } = useFeedback();
  const duty = useDuty();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' '));
  const load = useCallback(() => api('/shifts/me').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);
  // Đồng hồ chạy theo giây để thấy thời gian đã làm
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ')), 1000);
    return () => clearInterval(timer);
  }, []);

  async function punch(kind) {
    if (kind === 'out') {
      const ok = await confirm({ title: 'Ra ca?', message: `Bạn đã làm ${duration(elapsedFrom(data.open.clockIn, now))}. Sau khi ra ca, muốn sửa giờ phải nhờ quản lý.`, confirmText: 'Ra ca' });
      if (!ok) return;
    }
    setBusy(true);
    try {
      const d = await api(`/shifts/me/clock-${kind}`, { method: 'POST', body: {} });
      setData(d);
      duty.refresh();
      notify.success(kind === 'in' ? `Đã vào ca lúc ${clock(d.open.clockIn)}. Các thao tác tại quầy đã mở.` : 'Đã ra ca. Các thao tác tại quầy đã khóa.');
    } catch (e) { (e.code === 'NO_ASSIGNED_SHIFT' ? notify.warning : notify.error)(e.message); load(); } finally { setBusy(false); }
  }

  const next = data?.nextShift;
  // Được vào ca từ trước giờ bắt đầu vài phút tới hết giờ ca
  const opensAt = next ? new Date(Date.parse(`${next.starts_at.replace(' ', 'T')}+07:00`) - (data.earlyMinutes ?? 15) * 60000 + 7 * 3600e3).toISOString().slice(0, 19).replace('T', ' ') : null;
  const canClockIn = Boolean(next && opensAt <= now && next.ends_at > now);
  return (
    <div>
      <PageHeader title="Chấm công" subtitle="Vào ca, ra ca và xem lịch ca của bạn" />
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[420px_minmax(0,1fr)]">
          <div className="flex flex-col gap-6">
            <Card className={`text-center ${data.open ? 'border-teal-700 ring-2 ring-teal-700/20' : ''}`}>
              <p className="text-5xl font-black tabular-nums tracking-tight">{now.slice(11, 19)}</p>
              <p className="mt-1 text-sm text-slate-600">{fullDate(now.slice(0, 10))}</p>
              {data.open ? (
                <>
                  <Badge tone="green">Đang trong ca {data.open.shiftName ? `· ${data.open.shiftName}` : '· ngoài lịch'}</Badge>
                  <p className="mt-3 text-sm text-slate-600">Vào lúc {clock(data.open.clockIn)}{data.dutyEndsAt ? `, ca kết thúc ${clock(data.dutyEndsAt)}` : ''}. Đã làm</p>
                  <p className="text-2xl font-bold tabular-nums">{duration(elapsedFrom(data.open.clockIn, now))}</p>
                  <Button kind="danger" className="mt-5 w-full py-4 text-lg" loading={busy} onClick={() => punch('out')}><Icon name="punch" /> Ra ca</Button>
                  <p className="mt-2 text-xs text-slate-600">Hết giờ ca mà chưa bấm ra ca, hệ thống tự kết thúc đúng giờ hết ca. Làm thêm phải được quản lý ghi nhận.</p>
                </>
              ) : (
                <>
                  <p className="mt-3 text-sm text-slate-600">{next ? `Ca tới: ${next.name} ${dayMonth(next.starts_at.slice(0, 10))}, ${clock(next.starts_at)}–${clock(next.ends_at)}` : 'Bạn chưa được phân công ca nào sắp tới'}</p>
                  <Button className="mt-5 w-full py-4 text-lg" loading={busy} disabled={!canClockIn} onClick={() => punch('in')}><Icon name="punch" /> Vào ca</Button>
                  <p className="mt-2 text-xs text-slate-600">
                    {!next ? 'Chỉ vào ca được khi quản lý đã xếp ca cho bạn.' : canClockIn ? `Đang trong khung giờ vào ca. Ca kết thúc lúc ${clock(next.ends_at)}.` : `Được vào ca từ ${clock(opensAt)} (sớm tối đa ${data.earlyMinutes} phút).`}
                  </p>
                </>
              )}
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Lịch ca 7 ngày tới</h2>
              {data.shifts.length === 0 ? <p className="text-sm text-slate-600">Quản lý chưa xếp ca cho bạn.</p> : data.shifts.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-t border-slate-200 py-2 text-sm first:border-0">
                  <span><span className="font-semibold">{s.shiftName}</span> · {fullDate(s.workDate)}</span>
                  <span className="tabular-nums">{clock(s.startsAt)}–{clock(s.endsAt)}</span>
                </div>
              ))}
            </Card>
          </div>
          <Card className="p-0">
            <div className="flex flex-wrap items-center justify-between gap-2 p-4">
              <h2 className="font-semibold">Chấm công tháng {now.slice(5, 7)}/{now.slice(0, 4)}</h2>
              <Badge tone="teal">Tổng {duration(data.monthMinutes)}</Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead className="text-xs text-slate-600"><tr>{['Ngày', 'Vào', 'Ra', 'Tính công', 'Ca', 'Ghi chú'].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.records.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-slate-600">Chưa có lượt chấm công nào trong tháng.</td></tr>}
                  {data.records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-200">
                      <td className="px-4 py-2">{dayMonth(r.clockIn.slice(0, 10))}</td>
                      <td className="px-4 py-2 tabular-nums">{clock(r.clockIn)}</td>
                      <td className="px-4 py-2 tabular-nums">{r.clockOut ? clock(r.clockOut) : <Badge tone="green">Đang làm</Badge>}</td>
                      <td className="px-4 py-2">{r.minutes !== null ? duration(r.minutes) : '–'}</td>
                      <td className="px-4 py-2">{r.shiftName ?? 'Ngoài lịch'}</td>
                      <td className="px-4 py-2 text-xs text-slate-600">
                        <div className="flex flex-wrap gap-1">
                          {r.lateMinutes > (data.lateGraceMinutes ?? 5) && <Badge tone="amber">Trễ {r.lateMinutes} phút</Badge>}
                          {r.autoClosed && <Badge tone="red">Hệ thống tự kết thúc</Badge>}
                          {r.source === 'MANAGER' && <span>Quản lý sửa: {r.note}</span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
