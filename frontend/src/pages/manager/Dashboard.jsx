import { useEffect, useState } from 'react';
import { Bar } from 'react-chartjs-2';
import { BarElement, CategoryScale, Chart as ChartJS, Legend as ChartLegend, LinearScale, Tooltip } from 'chart.js';
import { api } from '../../lib/api';
import { addDays, dayMonth, todayVN, vnd, weekdayShort } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import { Alert, Card, Input, Spinner } from '../../components/ui';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, ChartLegend);

const Stat = ({ label, value, note }) => (
  <Card className="p-4">
    <p className="text-sm text-slate-600">{label}</p>
    <p className="text-2xl font-semibold">{value}</p>
    {note && <p className="text-xs text-slate-600">{note}</p>}
  </Card>
);
const pct = (r) => `${Math.round(r * 100)}%`;

// Dashboard Manager (cơ sở mình) / Admin (toàn chuỗi hoặc từng cơ sở): doanh thu theo ngày, lấp đầy, giờ cao điểm
export default function Dashboard() {
  const scope = useVenueScope();
  const [range, setRange] = useState({ from: addDays(todayVN(), -6), to: addDays(todayVN(), 7) });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = scope.isAdmin && scope.venueId ? `&venueId=${scope.venueId}` : '';
    setData(null);
    api(`/reports/revenue?from=${range.from}&to=${range.to}${q}`).then(setData).catch((e) => setError(e.message));
  }, [range, scope.isAdmin, scope.venueId]);

  const chart = data && {
    labels: data.daily.map((d) => `${weekdayShort(d.date)} ${dayMonth(d.date)}`),
    datasets: [
      { label: 'Tiền sân', data: data.daily.map((d) => d.court), backgroundColor: '#0f766e', borderRadius: 4, stack: 'r' },
      { label: 'Dịch vụ', data: data.daily.map((d) => d.service), backgroundColor: '#bef264', borderRadius: 4, stack: 'r' },
    ],
  };
  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { tooltip: { callbacks: { label: (c) => `${c.dataset.label}: ${vnd(c.raw)}` } }, legend: { position: 'bottom' } },
    scales: { y: { stacked: true, ticks: { callback: (v) => `${v / 1000}k` } }, x: { stacked: true, grid: { display: false } } },
  };

  return (
    <div>
      <PageHeader title="Tổng quan doanh thu" subtitle={data ? `${dayMonth(data.from)} – ${dayMonth(data.to)}${data.venueId ? '' : ' · toàn chuỗi'}` : ''} scope={scope} allowAll>
        <Input label="Từ ngày" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="Đến ngày" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </PageHeader>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Doanh thu" value={vnd(data.totals.revenue)} note={`Sân ${vnd(data.totals.court)} · dịch vụ ${vnd(data.totals.service)}`} />
            <Stat label="Số đơn đã thanh toán" value={data.totals.bookings} />
            <Stat label="Tỷ lệ lấp đầy" value={pct(data.totals.occupancyRate)} note="Trên các sân đang hoạt động" />
            <Stat label="Chờ hoàn tiền" value={`${data.totals.refundPending} đơn`} note={vnd(data.totals.refundPendingAmount)} />
          </div>
          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <Card>
              <h2 className="mb-3 font-semibold">Doanh thu theo ngày chơi</h2>
              <div className="h-72"><Bar data={chart} options={options} aria-label="Biểu đồ doanh thu theo ngày" /></div>
            </Card>
            <Card>
              <h2 className="mb-3 font-semibold">Lấp đầy theo sân</h2>
              <div className="flex flex-col gap-3">
                {data.occupancy.map((o) => (
                  <div key={o.courtId}>
                    <div className="flex justify-between text-sm"><span>{o.court}{data.venueId ? '' : ` · ${o.venue.replace('Cụm sân Pickleball ', '')}`}</span><span>{o.status === 'ACTIVE' ? pct(o.rate) : 'Bảo trì'}</span></div>
                    <div className="mt-1 h-2 rounded bg-slate-100"><div className="h-2 rounded bg-teal-700" style={{ width: `${Math.min(100, o.rate * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <h2 className="mb-3 font-semibold">Giờ cao điểm (số ô đã đặt)</h2>
              {data.peakHours.length === 0 ? <p className="text-sm text-slate-600">Chưa có dữ liệu.</p> : (
                <div className="flex flex-col gap-2">
                  {data.peakHours.map((h) => (
                    <div key={h.hour} className="flex items-center gap-3 text-sm">
                      <span className="w-12">{h.hour}</span>
                      <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-lime-300" style={{ width: `${(h.slots / Math.max(...data.peakHours.map((x) => x.slots))) * 100}%` }} /></div>
                      <span className="w-8 text-right">{h.slots}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
            {data.byVenue.length > 0 && (
              <Card>
                <h2 className="mb-3 font-semibold">So sánh cơ sở</h2>
                {data.byVenue.map((v) => (
                  <div key={v.venueId} className="flex justify-between border-t border-slate-200 py-2 text-sm first:border-0">
                    <span>{v.venue}</span><span className="font-medium">{vnd(v.amount)} · {v.bookings} đơn</span>
                  </div>
                ))}
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
