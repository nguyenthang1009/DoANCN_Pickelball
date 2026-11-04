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

function SlipEditor({ slip, onSave, onClose }) {
  const [form, setForm] = useState({ workDays: slip.workDays, ot150: hours(slip.otWeekdayMinutes), ot200: hours(slip.otWeekendMinutes), ot300: hours(slip.otHolidayMinutes), night: hours(slip.nightMinutes) });
  const field = (key, label, step = '0.5') => <Input label={label} type="number" min="0" step={step} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />;
  const save = () => onSave({
    workDays: Number(form.workDays), otWeekdayMinutes: Math.round(form.ot150 * 60), otWeekendMinutes: Math.round(form.ot200 * 60), otHolidayMinutes: Math.round(form.ot300 * 60), nightMinutes: Math.round(form.night * 60),
  });
  return (
    <Modal title={`Chấm công: ${slip.fullName}`} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save}>Tính lại</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('workDays', `Ngày công (chuẩn ${slip.standardDays})`)}
        {field('ot150', 'Giờ làm thêm ngày thường')}
        {field('ot200', 'Giờ làm thêm ngày nghỉ')}
        {field('ot300', 'Giờ làm thêm ngày lễ')}
        {field('night', 'Giờ làm ban đêm')}
      </div>
    </Modal>
  );
}

function PayslipDetail({ slip, onClose }) {
  const rows = [
    ['Lương theo ngày công', slip.basePay], ['Phụ cấp', slip.allowance], ['Tiền làm thêm', slip.otPay], ['Phụ cấp ban đêm', slip.nightPay], ['Tổng thu nhập', slip.grossPay, true],
    ['BHXH 8%', -slip.siEmployee], ['BHYT 1,5%', -slip.hiEmployee], ['BHTN 1%', -slip.uiEmployee],
    ['Giảm trừ bản thân', slip.selfDeduction, false, true], ['Giảm trừ người phụ thuộc', slip.dependentDeduction, false, true], ['Phần làm thêm miễn thuế', slip.taxExemptOt, false, true], ['Thu nhập tính thuế', slip.assessableIncome, false, true],
    ['Thuế TNCN', -slip.pit], ['Thực nhận', slip.netPay, true],
  ];
  return (
    <Modal title={`Phiếu lương ${slip.month}: ${slip.fullName}`} onClose={onClose} footer={<Button kind="ghost" onClick={onClose}>Đóng</Button>}>
      <dl className="text-sm">
        {rows.map(([label, value, strong, info]) => (
          <div key={label} className={`flex justify-between border-t border-slate-200 py-2 first:border-0 ${strong ? 'font-bold' : ''} ${info ? 'text-slate-600' : ''}`}>
            <dt>{label}</dt><dd>{value < 0 ? '−' : ''}{vnd(Math.abs(value))}</dd>
          </div>
        ))}
      </dl>
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

  async function act(path, options, ok) {
    if (!(await confirm(options))) return;
    try { setPeriod((await api(`/payroll/periods/${id}/${path}`, { method: 'POST', body: {} })).period); notify.success(ok); onChanged(); } catch (e) { notify.error(e.message); }
  }

  if (!period) return <Spinner />;
  const t = period.totals;
  const [tone, label] = STATUS[period.status];
  const details = [['Tổng thu nhập', vnd(t.gross)], ['Thực trả', vnd(t.net)], ['Thuế TNCN', vnd(t.pit)], ['Bảo hiểm DN đóng', vnd(t.employerInsurance)]];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-3 text-xl font-bold">Tháng {period.month} <Badge tone={tone}>{label}</Badge></h2>
        <div className="flex gap-2">
          {period.status === 'DRAFT' && can('payroll.approve') && period.createdBy !== user.id && (
            <Button onClick={() => act('approve', { title: `Duyệt lương tháng ${period.month}?`, message: 'Số liệu sẽ bị khóa và ghi vào sổ cái. Thao tác này không hoàn tác được.', details, tone: 'warning', confirmText: 'Duyệt bảng lương' }, 'Đã duyệt bảng lương')}>Duyệt bảng lương</Button>
          )}
          {period.status === 'APPROVED' && can('payroll.approve') && (
            <Button onClick={() => act('pay', { title: 'Xác nhận đã trả lương?', message: 'Ghi nhận đã chuyển lương cho nhân viên.', details: [['Thực trả', vnd(t.net)]], tone: 'warning', confirmText: 'Đã trả lương' }, 'Đã ghi nhận trả lương')}>Xác nhận đã trả lương</Button>
          )}
        </div>
      </div>
      {period.status === 'DRAFT' && period.createdBy === user.id && can('payroll.approve') && <Alert kind="warning">Bạn là người lập bảng lương này nên không tự duyệt được. Cần một người khác có quyền duyệt.</Alert>}
      <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
        <StatCard label="Tổng thu nhập" value={t.gross} format={vnd} icon="salary" tone="teal" />
        <StatCard label="Thực trả nhân viên" value={t.net} format={vnd} icon="wallet" tone="slate" delay={80} />
        <StatCard label="Thuế TNCN" value={t.pit} format={vnd} icon="tax" tone="lime" delay={160} />
        <StatCard label="Bảo hiểm" value={t.employeeInsurance + t.employerInsurance} format={vnd} note={`NV ${vnd(t.employeeInsurance)} · DN ${vnd(t.employerInsurance)}`} icon="shield" delay={240} />
      </div>
      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Nhân sự', 'Ngày công', 'Tổng thu nhập', 'Bảo hiểm', 'Thuế TNCN', 'Thực nhận', ''].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i > 0 && i < 6 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
            <tbody>
              {period.slips.map((s) => (
                <tr key={s.id} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold">{s.fullName}<div className="text-xs font-normal text-slate-600">{s.position}</div></td>
                  <td className="px-4 py-3 text-right">{s.workDays}/{s.standardDays}</td>
                  <td className="px-4 py-3 text-right">{vnd(s.grossPay)}</td>
                  <td className="px-4 py-3 text-right">{vnd(s.siEmployee + s.hiEmployee + s.uiEmployee)}</td>
                  <td className="px-4 py-3 text-right">{vnd(s.pit)}</td>
                  <td className="px-4 py-3 text-right font-bold">{vnd(s.netPay)}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setViewing(s)}>Chi tiết</Button>
                      {period.status === 'DRAFT' && can('payroll.manage') && <Button kind="secondary" className="px-3 py-1 text-sm" onClick={() => setEditing(s)}>Chấm công</Button>}
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
    const ok = await confirm({ title: `Tạo bảng lương tháng ${form.month}?`, message: 'Mỗi nhân sự có hợp đồng sẽ có một phiếu lương, mặc định đủ công.', confirmText: 'Tạo bảng lương' });
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
  const [form, setForm] = useState({ position: c?.position ?? (person.role === 'MANAGER' ? 'Quản lý' : 'Lễ tân'), baseSalary: c?.baseSalary ?? '', allowance: c?.allowance ?? 0, insuredSalary: c?.insuredSalary ?? '', dependents: c?.dependents ?? 0, wageRegion: c?.wageRegion ?? 1, effectiveFrom: todayVN() });
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const save = () => onSave({ ...form, baseSalary: Number(form.baseSalary), allowance: Number(form.allowance), insuredSalary: Number(form.insuredSalary), dependents: Number(form.dependents), wageRegion: Number(form.wageRegion) });
  return (
    <Modal title={`Hợp đồng: ${person.fullName}`} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save}>Lưu phiên bản mới</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Vị trí" value={form.position} onChange={set('position')} />
        <Input label="Hiệu lực từ ngày" type="date" value={form.effectiveFrom} onChange={set('effectiveFrom')} />
        <Input label="Lương tháng (VND)" type="number" min="0" value={form.baseSalary} onChange={set('baseSalary')} />
        <Input label="Phụ cấp tính thuế (VND)" type="number" min="0" value={form.allowance} onChange={set('allowance')} />
        <Input label="Lương đóng bảo hiểm (VND)" type="number" min="0" value={form.insuredSalary} onChange={set('insuredSalary')} />
        <Input label="Số người phụ thuộc" type="number" min="0" value={form.dependents} onChange={set('dependents')} />
        <Select label="Vùng lương tối thiểu" value={form.wageRegion} onChange={set('wageRegion')}>{[1, 2, 3, 4].map((r) => <option key={r} value={r}>Vùng {r}</option>)}</Select>
      </div>
      <p className="mt-3 text-xs text-slate-600">Bảng lương đã tạo vẫn giữ hợp đồng cũ. Hợp đồng mới áp dụng cho kỳ lương sau ngày hiệu lực.</p>
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
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-xs text-slate-600"><tr>{['Nhân sự', 'Vị trí', 'Lương tháng', 'Lương đóng BH', 'Phụ thuộc', 'Hiệu lực từ', ''].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {staff.map((p) => (
                <tr key={p.userId} className="border-t border-slate-200">
                  <td className="px-4 py-3 font-semibold">{p.fullName}</td>
                  {p.contract ? (
                    <>
                      <td className="px-4 py-3">{p.contract.position}</td><td className="px-4 py-3">{vnd(p.contract.baseSalary)}</td><td className="px-4 py-3">{vnd(p.contract.insuredSalary)}</td>
                      <td className="px-4 py-3">{p.contract.dependents}</td><td className="px-4 py-3">{String(p.contract.effectiveFrom).slice(0, 10)}</td>
                    </>
                  ) : <td colSpan={5} className="px-4 py-3 text-amber-700">Chưa có hợp đồng</td>}
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
      <PageHeader title="Tiền lương" subtitle="Bảo hiểm, giảm trừ gia cảnh và thuế TNCN tính theo tham số pháp lý có ngày hiệu lực" scope={scope} />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'periods' ? <Periods scope={scope} /> : <Contracts scope={scope} />}
    </div>
  );
}

export { PayslipDetail };
