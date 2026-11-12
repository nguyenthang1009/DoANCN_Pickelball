import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useFeedback } from '../../lib/feedback';
import { todayVN, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Badge, Button, Card, Input, Modal, Select, Spinner } from '../../components/ui';
import { Tabs } from './Finance';

const STATUS = { DRAFT: ['amber', 'Bản nháp'], APPROVED: ['teal', 'Đã duyệt'], PAID: ['green', 'Đã trả lương'] };
const hours = (minutes) => minutes / 60;
const num = (n) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: 2 });

// Hình thức trả lương (Điều 96 Bộ luật Lao động 2019): nhãn, đơn vị tính
export const PAY_TYPES = {
  MONTHLY: { label: 'Lương tháng', unit: 'tháng', rate: 'Lương tháng (VND)' },
  DAILY: { label: 'Lương ngày', unit: 'ngày', rate: 'Đơn giá một ngày công (VND)' },
  HOURLY: { label: 'Lương giờ', unit: 'giờ', rate: 'Đơn giá một giờ (VND)' },
  SHIFT: { label: 'Lương ca', unit: 'ca', rate: 'Đơn giá một ca (VND)' },
};
const WEEKDAYS = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy'];
const DAY_TYPE = { WORK: ['slate', 'Ngày thường'], REST: ['amber', 'Nghỉ hằng tuần'], HOLIDAY: ['red', 'Ngày lễ'] };

// Số công hiển thị theo hình thức trả lương
export function workText(s) {
  if (s.payType === 'HOURLY') return `${num(s.units)} giờ`;
  if (s.payType === 'SHIFT') return `${num(s.units)} ca`;
  if (s.payType === 'DAILY') return `${num(s.workDays)} ngày${s.paidHolidays ? ` + ${s.paidHolidays} lễ` : ''}`;
  return `${num(s.workDays)}${s.paidHolidays ? ` + ${s.paidHolidays} lễ` : ''}/${s.standardDays}`;
}

function SlipEditor({ slip, onSave, onClose }) {
  const monthly = slip.payType === 'MONTHLY';
  const [form, setForm] = useState({ workDays: slip.workDays, units: slip.units, paidHolidays: slip.paidHolidays, ot150: hours(slip.otWeekdayMinutes), ot200: hours(slip.otWeekendMinutes), ot300: hours(slip.otHolidayMinutes), night: hours(slip.nightMinutes) });
  const field = (key, label, step = '0.5') => <Input label={label} type="number" min="0" step={step} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />;
  const save = () => onSave({
    workDays: Number(form.workDays), paidHolidays: Number(form.paidHolidays), ...(monthly ? {} : { units: Number(form.units) }),
    otWeekdayMinutes: Math.round(form.ot150 * 60), otWeekendMinutes: Math.round(form.ot200 * 60), otHolidayMinutes: Math.round(form.ot300 * 60), nightMinutes: Math.round(form.night * 60),
  });
  return (
    <Modal title={`Chấm công tay: ${slip.fullName}`} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save}>Tính lại</Button></>}>
      {slip.source === 'ATTENDANCE' && <Alert kind="warning">Phiếu này đang lấy từ chấm công. Lưu số nhập tay sẽ thay số đã tổng hợp và bỏ chi tiết làm thêm ban đêm.</Alert>}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {field('workDays', monthly ? `Ngày công (chuẩn ${slip.standardDays})` : 'Số ngày đi làm')}
        {!monthly && field('units', `Số ${PAY_TYPES[slip.payType].unit} trong giờ thường`, '0.25')}
        {(monthly || slip.payType === 'DAILY') && field('paidHolidays', 'Ngày lễ hưởng nguyên lương', '1')}
        {field('ot150', 'Giờ làm thêm ngày thường')}
        {field('ot200', 'Giờ làm thêm ngày nghỉ')}
        {field('ot300', 'Giờ làm thêm ngày lễ')}
        {field('night', 'Giờ làm ban đêm trong giờ thường')}
      </div>
    </Modal>
  );
}

function Timesheet({ days }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-slate-200">
      <table className="w-full min-w-[480px] text-xs">
        <thead className="bg-slate-50 text-slate-600"><tr>{['Ngày', 'Loại ngày', 'Làm', 'Giờ thường', 'Làm thêm', 'Ban đêm'].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.date} className="border-t border-slate-200">
              <td className="px-3 py-1.5">{d.date.slice(8, 10)}/{d.date.slice(5, 7)}</td>
              <td className="px-3 py-1.5"><Badge tone={DAY_TYPE[d.type][0]}>{d.holiday ?? DAY_TYPE[d.type][1]}</Badge></td>
              <td className="px-3 py-1.5">{num(hours(d.worked))}h</td>
              <td className="px-3 py-1.5">{num(hours(d.normal))}h</td>
              <td className="px-3 py-1.5">{d.ot ? `${num(hours(d.ot))}h` : '–'}</td>
              <td className="px-3 py-1.5">{d.night + d.otNight ? `${num(hours(d.night + d.otNight))}h` : '–'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PayslipDetail({ slip, onClose }) {
  const type = PAY_TYPES[slip.payType] ?? PAY_TYPES.MONTHLY;
  const baseLabel = slip.payType === 'MONTHLY' ? `Lương tháng: ${workText(slip)} công` : `${type.label}: ${workText(slip)} × ${vnd(slip.rate)}`;
  const rows = [
    [baseLabel, slip.basePay], ['Phụ cấp', slip.allowance],
    [`Làm thêm: ${num(hours(slip.otWeekdayMinutes))}h thường, ${num(hours(slip.otWeekendMinutes))}h nghỉ, ${num(hours(slip.otHolidayMinutes))}h lễ`, slip.otPay],
    [`Phụ trội ban đêm${slip.otNightMinutes ? ` (gồm ${num(hours(slip.otNightMinutes))}h làm thêm đêm)` : ''}`, slip.nightPay], ['Tổng thu nhập', slip.grossPay, true],
    ['BHXH 8%', -slip.siEmployee], ['BHYT 1,5%', -slip.hiEmployee], ['BHTN 1%', -slip.uiEmployee],
    ...(slip.pitWithholding ? [
      ['Giảm trừ bản thân', slip.selfDeduction, false, true], ['Giảm trừ người phụ thuộc', slip.dependentDeduction, false, true], ['Phần làm thêm miễn thuế', slip.taxExemptOt, false, true], ['Thu nhập tính thuế', slip.assessableIncome, false, true],
      ['Thuế TNCN', -slip.pit],
    ] : []),
    ['Thực nhận', slip.netPay, true],
  ];
  return (
    <Modal title={`Phiếu lương ${slip.month}: ${slip.fullName} · ${type.label}${slip.source === 'ATTENDANCE' ? ' · theo chấm công' : ''}`} onClose={onClose} footer={<Button kind="ghost" onClick={onClose}>Đóng</Button>}>
      <dl className="text-sm">
        {rows.map(([label, value, strong, info]) => (
          <div key={label} className={`flex justify-between border-t border-slate-200 py-2 first:border-0 ${strong ? 'font-bold' : ''} ${info ? 'text-slate-600' : ''}`}>
            <dt>{label}</dt><dd>{value < 0 ? '−' : ''}{vnd(Math.abs(value))}</dd>
          </div>
        ))}
      </dl>
      {slip.otWarnings?.length > 0 && <div className="mt-3"><Alert kind="warning">Vượt giới hạn làm thêm (Điều 107 BLLĐ 2019): {slip.otWarnings.join('; ')}.</Alert></div>}
      {!slip.pitWithholding && <p className="mt-3 text-xs text-slate-600">Kỳ lương này chưa khấu trừ thuế TNCN.</p>}
      <p className="mt-3 text-xs text-slate-600">
        Làm thêm 150% ngày thường, 200% ngày nghỉ, 300% ngày lễ. Ban đêm (22h-6h) thêm 30%; làm thêm ban đêm thêm 20% lương giờ ban ngày (Điều 98 BLLĐ 2019, Điều 57 Nghị định 145/2020).
      </p>
      {slip.timesheet?.days?.length > 0 && <Timesheet days={slip.timesheet.days} />}
      <p className="mt-3 text-xs text-slate-600">Doanh nghiệp đóng thêm {vnd(slip.siEmployer + slip.hiEmployer + slip.uiEmployer)} bảo hiểm cho nhân viên này.</p>
    </Modal>
  );
}

function PeriodView({ id, onChanged }) {
  const { can, user } = useAuth();
  const { notify, confirm } = useFeedback();
  const [period, setPeriod] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const load = useCallback(() => api(`/payroll/periods/${id}`).then((d) => setPeriod(d.period)).catch((e) => notify.error(e.message)), [id, notify]);
  useEffect(() => { setPeriod(null); load(); }, [load]);

  async function saveSlip(body) {
    try {
      const { period: p } = await api(`/payroll/periods/${id}/payslips/${editing.id}`, { method: 'PATCH', body });
      setPeriod(p); setEditing(null); notify.success('Đã tính lại phiếu lương');
    } catch (e) { notify.error(e.message); }
  }

  async function sync() {
    const ok = await confirm({ title: 'Tính lại từ chấm công?', message: 'Phiếu của người có chấm công trong tháng sẽ được tính lại theo giờ vào ra thực tế, thay cho số nhập tay.', confirmText: 'Tính lại' });
    if (!ok) return;
    try {
      const { period: p, warnings } = await api(`/payroll/periods/${id}/sync-attendance`, { method: 'POST', body: {} });
      setPeriod(p);
      notify.success('Đã tính lại từ chấm công');
      warnings.forEach((w) => notify.warning(w));
    } catch (e) { notify.error(e.message); }
  }

  async function act(path, options, ok) {
    if (!(await confirm(options))) return;
    try { setPeriod((await api(`/payroll/periods/${id}/${path}`, { method: 'POST', body: {} })).period); notify.success(ok); onChanged(); } catch (e) { notify.error(e.message); }
  }

  if (!period) return <Spinner />;
  const t = period.totals;
  const [tone, label] = STATUS[period.status];
  const overLimit = period.slips.filter((s) => s.otWarnings?.length);
  const details = [['Tổng thu nhập', vnd(t.gross)], ['Thực trả', vnd(t.net)], ...(period.pitWithholding ? [['Thuế TNCN', vnd(t.pit)]] : []), ['Bảo hiểm DN đóng', vnd(t.employerInsurance)], ...(overLimit.length ? [['Vượt giờ làm thêm', `${overLimit.length} người`]] : [])];
  const columns = ['Nhân sự', 'Công', 'Tổng thu nhập', 'Bảo hiểm', ...(period.pitWithholding ? ['Thuế TNCN'] : []), 'Thực nhận', ''];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-bold">Tháng {period.month} <Badge tone={tone}>{label}</Badge></h2>
        <div className="flex flex-wrap gap-2">
          {period.status === 'DRAFT' && can('payroll.manage') && <Button kind="secondary" onClick={sync}>Tính lại từ chấm công</Button>}
          {period.status === 'DRAFT' && can('payroll.approve') && period.createdBy !== user.id && (
            <Button onClick={() => act('approve', { title: `Duyệt lương tháng ${period.month}?`, message: 'Số liệu sẽ bị khóa và ghi vào sổ cái. Thao tác này không hoàn tác được.', details, tone: 'warning', confirmText: 'Duyệt bảng lương' }, 'Đã duyệt bảng lương')}>Duyệt bảng lương</Button>
          )}
          {period.status === 'APPROVED' && can('payroll.approve') && (
            <Button onClick={() => act('pay', { title: 'Xác nhận đã trả lương?', message: 'Ghi nhận đã chuyển lương cho nhân viên.', details: [['Thực trả', vnd(t.net)]], tone: 'warning', confirmText: 'Đã trả lương' }, 'Đã ghi nhận trả lương')}>Xác nhận đã trả lương</Button>
          )}
        </div>
      </div>
      {overLimit.length > 0 && <Alert kind="warning">{overLimit.map((s) => s.fullName).join(', ')} vượt giới hạn làm thêm theo Điều 107 BLLĐ 2019. Vẫn phải trả đủ tiền làm thêm; cần điều chỉnh lịch ca các tháng sau.</Alert>}
      {period.status === 'DRAFT' && period.createdBy === user.id && can('payroll.approve') && <Alert kind="warning">Bạn là người lập bảng lương này nên không tự duyệt được. Cần một người khác có quyền duyệt.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Tổng thu nhập" value={t.gross} format={vnd} icon="salary" tone="teal" />
        <StatCard label="Thực trả nhân viên" value={t.net} format={vnd} icon="wallet" tone="slate" delay={80} />
        {period.pitWithholding
          ? <StatCard label="Thuế TNCN" value={t.pit} format={vnd} icon="tax" tone="lime" delay={160} />
          : <StatCard label="Bảo hiểm NV đóng" value={t.employeeInsurance} format={vnd} note="Kỳ này chưa khấu trừ thuế TNCN" icon="tax" tone="lime" delay={160} />}
        <StatCard label="Bảo hiểm" value={t.employeeInsurance + t.employerInsurance} format={vnd} note={`NV ${vnd(t.employeeInsurance)} · DN ${vnd(t.employerInsurance)}`} icon="shield" delay={240} />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-xs text-slate-600"><tr>{columns.map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i > 0 && i < columns.length - 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {period.slips.map((s) => (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold">{s.fullName}<div className="text-xs font-normal text-slate-600">{s.position} · {PAY_TYPES[s.payType]?.label}</div>{s.otWarnings?.length > 0 && <span className="mt-1 inline-block"><Badge tone="amber">Vượt giờ làm thêm</Badge></span>}</td>
                  <td className="px-4 py-3 text-right">{workText(s)}<div className="text-xs text-slate-600">{s.source === 'ATTENDANCE' ? 'Theo chấm công' : 'Nhập tay'}</div></td>
                  <td className="px-4 py-3 text-right">{vnd(s.grossPay)}</td>
                  <td className="px-4 py-3 text-right">{vnd(s.siEmployee + s.hiEmployee + s.uiEmployee)}</td>
                  {period.pitWithholding && <td className="px-4 py-3 text-right">{vnd(s.pit)}</td>}
                  <td className="px-4 py-3 text-right font-bold">{vnd(s.netPay)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setViewing(s)}>Chi tiết</Button>
                      {period.status === 'DRAFT' && can('payroll.manage') && <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => setEditing(s)}>Sửa tay</Button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {editing && <SlipEditor slip={editing} onSave={saveSlip} onClose={() => setEditing(null)} />}
      {viewing && <PayslipDetail slip={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function Periods({ scope }) {
  const { can } = useAuth();
  const { notify, confirm } = useFeedback();
  const [periods, setPeriods] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ month: todayVN().slice(0, 7), standardDays: 26 });
  const load = useCallback(() => {
    api(`/payroll/periods${scope.isAdmin && scope.venueId ? `?venueId=${scope.venueId}` : ''}`).then((d) => { setPeriods(d.periods); setSelected((id) => id ?? d.periods[0]?.id ?? null); }).catch((e) => notify.error(e.message));
  }, [scope.isAdmin, scope.venueId, notify]);
  useEffect(() => { setSelected(null); load(); }, [load]);

  async function create(e) {
    e.preventDefault();
    const ok = await confirm({ title: `Tạo bảng lương tháng ${form.month}?`, message: 'Mỗi nhân sự có hợp đồng sẽ có một phiếu lương. Người có chấm công được tính theo giờ vào ra thực tế; lương tháng chưa có chấm công mặc định đủ công.', confirmText: 'Tạo bảng lương' });
    if (!ok) return;
    try {
      const { period } = await api('/payroll/periods', { method: 'POST', body: { month: form.month, standardDays: Number(form.standardDays), venueId: scope.venueId } });
      notify.success(`Đã tạo bảng lương tháng ${period.month}`);
      setSelected(period.id);
      load();
    } catch (err) { notify.error(err.message); }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <div className="flex flex-col gap-4">
        {can('payroll.manage') && (
          <Card className="p-4">
            <form className="flex flex-col gap-3" onSubmit={create}>
              <Input label="Tháng lương" type="month" required value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} />
              <Input label="Ngày công chuẩn" type="number" min="20" max="27" value={form.standardDays} onChange={(e) => setForm({ ...form, standardDays: e.target.value })} />
              <Button type="submit">Tạo bảng lương</Button>
            </form>
          </Card>
        )}
        <Card className="p-2">
          {!periods ? <Spinner /> : periods.length === 0 ? <p className="p-3 text-sm text-slate-600">Chưa có bảng lương nào.</p> : periods.map((p) => (
            <button key={p.id} type="button" onClick={() => setSelected(p.id)} className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm transition ${selected === p.id ? 'bg-teal-50 font-semibold' : 'hover:bg-slate-50'}`}>
              <span>{p.month}<span className="block text-xs font-normal text-slate-600">{p.venueName.replace('Cụm sân Pickleball ', '')} · {p.staff} người</span></span>
              <Badge tone={STATUS[p.status][0]}>{STATUS[p.status][1]}</Badge>
            </button>
          ))}
        </Card>
      </div>
      <div className="min-w-0">{selected ? <PeriodView key={selected} id={selected} onChanged={load} /> : <Card><p className="text-sm text-slate-600">Chọn hoặc tạo một bảng lương.</p></Card>}</div>
    </div>
  );
}

function ContractEditor({ person, onSave, onClose }) {
  const c = person.contract;
  const [form, setForm] = useState({
    position: c?.position ?? (person.role === 'MANAGER' ? 'Quản lý' : 'Lễ tân'), payType: c?.payType ?? 'MONTHLY', baseSalary: c?.baseSalary ?? '', unitHours: c?.unitHours ?? 8, weeklyRestDay: c?.weeklyRestDay ?? 0,
    allowance: c?.allowance ?? 0, insuredSalary: c?.insuredSalary ?? '', dependents: c?.dependents ?? 0, wageRegion: c?.wageRegion ?? 1, effectiveFrom: todayVN(),
  });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const save = () => onSave({
    ...form, baseSalary: Number(form.baseSalary), unitHours: Number(form.unitHours), weeklyRestDay: Number(form.weeklyRestDay), allowance: Number(form.allowance),
    insuredSalary: Number(form.insuredSalary), dependents: Number(form.dependents), wageRegion: Number(form.wageRegion),
  });
  const perHour = ['DAILY', 'SHIFT'].includes(form.payType) && form.baseSalary && form.unitHours ? Math.floor(form.baseSalary / form.unitHours) : null;
  return (
    <Modal title={`Hợp đồng: ${person.fullName}`} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save}>Lưu phiên bản mới</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Vị trí" value={form.position} onChange={set('position')} />
        <Input label="Hiệu lực từ ngày" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} />
        <Select label="Hình thức trả lương" value={form.payType} onChange={set('payType')}>{Object.entries(PAY_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
        <Input label={PAY_TYPES[form.payType].rate} type="number" min="0" value={form.baseSalary} onChange={set('baseSalary')} />
        {['DAILY', 'SHIFT'].includes(form.payType) && (
          <Input label={`Số giờ một ${PAY_TYPES[form.payType].unit === 'ca' ? 'ca' : 'ngày công'}`} type="number" min="0.5" max="12" step="0.5" value={form.unitHours} onChange={set('unitHours')} />
        )}
        <Select label="Ngày nghỉ hằng tuần" value={form.weeklyRestDay} onChange={set('weeklyRestDay')}>{WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</Select>
        <Input label="Phụ cấp tính thuế (VND)" type="number" min="0" value={form.allowance} onChange={set('allowance')} />
        <Input label="Lương đóng bảo hiểm (VND)" type="number" min="0" value={form.insuredSalary} onChange={set('insuredSalary')} />
        <Input label="Số người phụ thuộc" type="number" min="0" value={form.dependents} onChange={set('dependents')} />
        <Select label="Vùng lương tối thiểu" value={form.wageRegion} onChange={set('wageRegion')}>{[1, 2, 3, 4].map((r) => <option key={r} value={r}>Vùng {r}</option>)}</Select>
      </div>
      {perHour !== null && <p className="mt-3 text-xs text-slate-600">Quy ra {vnd(perHour)}/giờ, dùng để tính làm thêm và so với lương tối thiểu giờ.</p>}
      <p className="mt-3 text-xs text-slate-600">Lương tháng so với lương tối thiểu tháng; lương giờ, ngày, ca quy ra giờ so với lương tối thiểu giờ (Nghị định 293/2025/NĐ-CP). Bảng lương đã tạo vẫn giữ hợp đồng cũ.</p>
    </Modal>
  );
}

function Contracts({ scope }) {
  const { user } = useAuth();
  const { notify } = useFeedback();
  const [staff, setStaff] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = useCallback(() => {
    if (scope.venueId) api(`/payroll/contracts?venueId=${scope.venueId}`).then((d) => setStaff(d.staff)).catch((e) => notify.error(e.message));
  }, [scope.venueId, notify]);
  useEffect(() => { load(); }, [load]);

  async function save(body) {
    try {
      await api(`/payroll/contracts/${editing.userId}`, { method: 'PUT', body });
      notify.success(`Đã lưu hợp đồng ${editing.fullName}`);
      setEditing(null);
      load();
    } catch (e) { notify.error(e.message); }
  }

  return (
    <Card className="p-0">
      {!staff ? <Spinner /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Nhân sự', 'Vị trí', 'Hình thức', 'Đơn giá', 'Lương đóng BH', 'Nghỉ tuần', 'Hiệu lực từ', ''].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.userId} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold">{p.fullName}</td>
                  {p.contract ? (
                    <>
                      <td className="px-4 py-3">{p.contract.position}</td><td className="px-4 py-3">{PAY_TYPES[p.contract.payType].label}</td>
                      <td className="px-4 py-3">{vnd(p.contract.baseSalary)}/{PAY_TYPES[p.contract.payType].unit}</td><td className="px-4 py-3">{vnd(p.contract.insuredSalary)}</td>
                      <td className="px-4 py-3">{WEEKDAYS[p.contract.weeklyRestDay]}</td><td className="px-4 py-3">{String(p.contract.effectiveFrom).slice(0, 10)}</td>
                    </>
                  ) : <td colSpan={6} className="px-4 py-3 text-amber-700">Chưa có hợp đồng</td>}
                  <td className="px-4 py-3 text-right">{p.userId !== user.id && <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => setEditing(p)}>{p.contract ? 'Cập nhật' : 'Lập hợp đồng'}</Button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <ContractEditor person={editing} onSave={save} onClose={() => setEditing(null)} />}
    </Card>
  );
}

// Tiền lương: quản lý lập bảng và chấm công, Admin duyệt rồi xác nhận chi trả
export default function Payroll() {
  const scope = useVenueScope();
  const { can } = useAuth();
  const [tab, setTab] = useState('periods');
  const tabs = [['periods', 'Bảng lương'], ...(can('payroll.manage') ? [['contracts', 'Hợp đồng']] : [])];
  return (
    <div>
      <PageHeader title="Tiền lương" subtitle="Lương, bảo hiểm và làm thêm giờ tính theo tham số pháp lý có ngày hiệu lực" scope={scope} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'periods' ? <Periods scope={scope} /> : <Contracts scope={scope} />}
    </div>
  );
}

export { PayslipDetail };
