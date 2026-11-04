import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend as ChartLegend, LinearScale, Tooltip } from 'chart.js';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { dayMonth, todayVN, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import { Icon } from '../../components/icons';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Badge, Button, Card, Input, Spinner } from '../../components/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, ChartLegend);

const Tabs = ({ tabs, value, onChange }) => (
  <div className="tab-bar" role="tablist">
    {tabs.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={value === key} onClick={() => onChange(key)} className={value === key ? 'tab-active' : ''}>{label}</button>)}
  </div>
);

function Overview({ data }) {
  const t = data.totals;
  const chart = {
    labels: data.daily.map((d) => dayMonth(d.date)),
    datasets: [
      { label: 'Tiền mặt', data: data.daily.map((d) => d.cash), backgroundColor: '#bef264', borderRadius: 4, stack: 's' },
      { label: 'Chuyển khoản', data: data.daily.map((d) => d.bank), backgroundColor: '#0f766e', borderRadius: 4, stack: 's' },
    ],
  };
  const options = {
    responsive: true, maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${vnd(c.raw)}` } }, legend: { position: 'bottom' } },
    scales: { y: { stacked: true, ticks: { callback: (v) => `${v / 1000}k` } }, x: { stacked: true, grid: { display: false } } },
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Doanh thu chưa thuế" value={t.revenue} format={vnd} note={`Sân ${vnd(t.courtRevenue)} · dịch vụ ${vnd(t.serviceRevenue)}`} icon="chart" tone="teal" />
        <StatCard label="Lợi nhuận vận hành" value={t.operatingProfit} format={vnd} note="Doanh thu trừ lương và bảo hiểm" icon="finance" tone="slate" delay={80} />
        <StatCard label="Thuế GTGT đầu ra" value={t.vatOutput} format={vnd} note={`${t.invoices} hóa đơn · ${t.creditNotes} điều chỉnh`} icon="tax" tone="lime" delay={160} />
        <StatCard label="Chi phí nhân sự" value={t.salaryCost + t.insuranceCost} format={vnd} note={`Lương ${vnd(t.salaryCost)} · bảo hiểm ${vnd(t.insuranceCost)}`} icon="salary" delay={240} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <h2 className="mb-3 font-semibold">Dòng tiền theo ngày</h2>
          <div className="h-72">{data.daily.length ? <Bar data={chart} options={options} aria-label="Biểu đồ dòng tiền" /> : <p className="py-16 text-center text-sm text-slate-600">Chưa có phát sinh trong kỳ.</p>}</div>
        </Card>
        <Card>
          <h2 className="mb-3 font-semibold">Tiền trong kỳ</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Quỹ tiền mặt</dt><dd className="font-semibold">{vnd(t.cashIn)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Tiền gửi ngân hàng</dt><dd className="font-semibold">{vnd(t.bankIn)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Đã hoàn cho khách</dt><dd className="font-semibold">{vnd(t.refunded)}</dd></div>
          </dl>
          {data.byVenue.length > 0 && (
            <>
              <h2 className="mb-2 mt-5 font-semibold">Theo cơ sở</h2>
              {data.byVenue.map((v) => (
                <div key={v.venueId} className="flex justify-between border-t border-slate-200 py-2 text-sm"><span>{v.venue.replace('Cụm sân Pickleball ', '')}</span><span className="font-semibold">{vnd(v.profit)}</span></div>
              ))}
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function TrialBalance({ data }) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-xs text-slate-600"><tr>{['Tài khoản', 'Tên', 'Đầu kỳ', 'Phát sinh nợ', 'Phát sinh có', 'Cuối kỳ'].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {data.accounts.map((a) => (
              <tr key={a.code} className="border-t border-slate-200">
                <td className="px-4 py-2 font-semibold">{a.code}</td><td className="px-4 py-2">{a.name}</td>
                <td className="px-4 py-2 text-right">{vnd(a.opening)}</td><td className="px-4 py-2 text-right">{vnd(a.debit)}</td><td className="px-4 py-2 text-right">{vnd(a.credit)}</td><td className="px-4 py-2 text-right font-semibold">{vnd(a.closing)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-900 font-bold"><td className="px-4 py-3" colSpan={3}>Tổng phát sinh</td><td className="px-4 py-3 text-right">{vnd(data.totals.debit)}</td><td className="px-4 py-3 text-right">{vnd(data.totals.credit)}</td><td /></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function Vat({ data }) {
  return (
    <Card className="p-0">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="text-xs text-slate-600"><tr>{['Tháng', 'Thuế suất', 'Số hóa đơn', 'Doanh thu chịu thuế', 'Thuế GTGT'].map((h, i) => <th key={h} className={`px-4 py-3 font-medium ${i > 1 ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {data.months.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-600">Chưa có hóa đơn trong năm {data.year}.</td></tr>}
            {data.months.map((m) => (
              <tr key={`${m.month}-${m.vatRateBp}`} className="border-t border-slate-200">
                <td className="px-4 py-2 font-semibold">{m.month}</td><td className="px-4 py-2">{m.vatRateBp / 100}%</td><td className="px-4 py-2 text-right">{m.invoices}</td>
                <td className="px-4 py-2 text-right">{vnd(m.taxable)}</td><td className="px-4 py-2 text-right font-semibold">{vnd(m.vat)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t-2 border-slate-900 font-bold"><td className="px-4 py-3" colSpan={3}>Cả năm {data.year}</td><td className="px-4 py-3 text-right">{vnd(data.totals.taxable)}</td><td className="px-4 py-3 text-right">{vnd(data.totals.vat)}</td></tr></tfoot>
        </table>
      </div>
    </Card>
  );
}

function Reconciliation() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const load = () => { setData(null); api('/finance/reconciliation').then(setData).catch((e) => setError(e.message)); };
  useEffect(() => { load(); }, []);
  if (!data) return error ? <Alert>{error}</Alert> : <Spinner label="Đang đối soát…" />;
  const failed = data.checks.filter((c) => !c.ok).length;
  return (
    <div className="flex flex-col gap-4">
      <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl p-5 text-white ${data.allOk ? 'bg-gradient-to-r from-teal-700 to-teal-500' : 'bg-gradient-to-r from-red-700 to-red-500'}`}>
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20"><Icon name={data.allOk ? 'check' : 'close'} /></span>
          <div><p className="text-lg font-bold">{data.allOk ? `Khớp toàn bộ ${data.checks.length} điểm đối soát` : `${failed} điểm đối soát bị lệch`}</p><p className="text-sm text-white/80">So chéo nghiệp vụ, hóa đơn, sổ cái, cổng thanh toán và bảng lương</p></div>
        </div>
        <Button kind="secondary" onClick={load}>Đối soát lại</Button>
      </div>
      <Card className="p-0">
        {data.checks.map((c) => (
          <div key={c.name} className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 text-sm first:border-0">
            <span className="font-medium">{c.name}</span>
            <span className="flex items-center gap-3 text-slate-600">{c.leftLabel}: <b className="text-slate-900">{c.left.toLocaleString('vi-VN')}</b> · {c.rightLabel}: <b className="text-slate-900">{c.right.toLocaleString('vi-VN')}</b><Badge tone={c.ok ? 'green' : 'red'}>{c.ok ? 'Khớp' : 'Lệch'}</Badge></span>
          </div>
        ))}
      </Card>
    </div>
  );
}

// Báo cáo tài chính kiểu ERP: mọi con số đọc từ sổ cái kế toán kép
export default function Finance() {
  const { can } = useAuth();
  const scope = useVenueScope();
  const today = todayVN();
  const [tab, setTab] = useState('overview');
  const [range, setRange] = useState({ from: `${today.slice(0, 7)}-01`, to: today });
  const [year] = useState(today.slice(0, 4));
  const [data, setData] = useState({});
  const [error, setError] = useState('');

  useEffect(() => {
    const venue = scope.isAdmin && scope.venueId ? `&venueId=${scope.venueId}` : '';
    const period = `from=${range.from}&to=${range.to}${venue}`;
    setData({});
    Promise.all([api(`/finance/overview?${period}`), api(`/finance/trial-balance?${period}`), api(`/finance/vat?year=${year}${venue}`)])
      .then(([overview, trial, vat]) => setData({ overview, trial, vat })).catch((e) => setError(e.message));
  }, [range, year, scope.isAdmin, scope.venueId]);

  const tabs = [['overview', 'Tổng quan'], ['trial', 'Sổ cái'], ['vat', 'Thuế GTGT'], ...(can('finance.reconcile') ? [['reconcile', 'Đối soát']] : [])];
  return (
    <div>
      <PageHeader title="Tài chính & thuế" subtitle="Số liệu đọc từ sổ cái kế toán kép" scope={scope} allowAll>
        <Input label="Từ ngày" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="Đến ngày" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </PageHeader>
      <Alert>{error}</Alert>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'reconcile' ? <Reconciliation /> : !data.overview ? <Spinner /> : (
        <>
          {tab === 'overview' && <Overview data={data.overview} />}
          {tab === 'trial' && <TrialBalance data={data.trial} />}
          {tab === 'vat' && <Vat data={data.vat} />}
        </>
      )}
    </div>
  );
}

export { Tabs };
