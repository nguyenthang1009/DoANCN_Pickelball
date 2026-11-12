import { useEffect, useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';
import { CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip } from 'chart.js';
import { api } from '../../lib/api';
import { dayMonth, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Badge, Button, Card, Select, Spinner } from '../../components/ui';

ChartJS.register(CategoryScale, LinearScale, LineElement, PointElement, Filler, Tooltip, Legend);

// Màu đã chạy bộ kiểm tra bảng màu (độ sáng, độ bão hòa, phân biệt cho người mù màu, tương phản)
const ACTUAL = '#475569';
const FORECAST = '#0d9488';
const TEST = '#d97706';
const NEGATIVE = '#c2410c';
const million = (v) => `${(v / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} tr`;
const pct = (v) => (v === null || v === undefined ? '–' : `${v > 0 ? '+' : ''}${v.toLocaleString('vi-VN')}%`);
const REFERENCES = [
  ['Hyndman & Athanasopoulos (2021). Forecasting: Principles and Practice, 3rd ed., chương 5 và 8', 'https://otexts.com/fpp3/'],
  ['Winters (1960). Forecasting sales by exponentially weighted moving averages. Management Science 6(3)', 'https://doi.org/10.1287/mnsc.6.3.324'],
  ['Holt (2004). Forecasting seasonals and trends by exponentially weighted moving averages. IJF 20(1)', 'https://doi.org/10.1016/j.ijforecast.2003.09.015'],
  ['Hyndman & Koehler (2006). Another look at measures of forecast accuracy. IJF 22(4)', 'https://doi.org/10.1016/j.ijforecast.2006.03.001'],
];

function ForecastChart({ data }) {
  const chart = useMemo(() => {
    const labels = [...data.history.map((d) => d.date), ...data.forecast.map((d) => d.date)];
    const at = (rows, key) => { const map = new Map(rows.map((r) => [r.date, r[key]])); return labels.map((d) => map.get(d) ?? null); };
    return {
      labels,
      datasets: [
        { label: 'Khoảng 95%', data: at(data.forecast, 'hi95'), borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(13,148,136,0.08)' },
        { label: 'Khoảng 95% dưới', data: at(data.forecast, 'lo95'), borderWidth: 0, pointRadius: 0, fill: false },
        { label: 'Khoảng 80%', data: at(data.forecast, 'hi80'), borderWidth: 0, pointRadius: 0, fill: '+1', backgroundColor: 'rgba(13,148,136,0.18)' },
        { label: 'Khoảng 80% dưới', data: at(data.forecast, 'lo80'), borderWidth: 0, pointRadius: 0, fill: false },
        { label: 'Thực tế', data: at(data.history, 'value'), borderColor: ACTUAL, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 },
        { label: 'Dự báo trên tập kiểm tra', data: at(data.test, 'forecast'), borderColor: TEST, borderWidth: 2, borderDash: [5, 4], pointRadius: 0, pointHoverRadius: 4 },
        { label: 'Dự báo', data: at(data.forecast, 'value'), borderColor: FORECAST, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4 },
      ],
    };
  }, [data]);
  const options = {
    responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'bottom', labels: { filter: (item) => !item.text.endsWith('dưới'), usePointStyle: true, pointStyle: 'line' } },
      tooltip: {
        filter: (item) => !item.dataset.label.startsWith('Khoảng') && item.raw !== null,
        callbacks: {
          title: (items) => dayMonth(items[0].label) + '/' + items[0].label.slice(0, 4),
          label: (c) => `${c.dataset.label}: ${vnd(c.raw)}`,
          afterBody: (items) => {
            const f = data.forecast.find((p) => p.date === items[0]?.label);
            return f ? [`Khoảng 80%: ${vnd(f.lo80)} – ${vnd(f.hi80)}`, `Khoảng 95%: ${vnd(f.lo95)} – ${vnd(f.hi95)}`] : [];
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 10, callback(value) { return dayMonth(this.getLabelForValue(value)); } } },
      y: { grid: { color: '#e2e8f0' }, ticks: { callback: (v) => million(v) } },
    },
  };
  return <div className="h-80"><Line data={chart} options={options} aria-label="Biểu đồ doanh thu thực tế và dự báo" /></div>;
}

function Weekly({ weekly }) {
  const max = Math.max(...weekly.map((w) => Math.abs(w.effect)), 1);
  return (
    <div className="flex flex-col gap-2">
      {weekly.map((w) => (
        <div key={w.weekday} className="grid grid-cols-[72px_1fr_96px] items-center gap-2 text-sm" title={`${w.label}: ${w.effect >= 0 ? 'cao hơn' : 'thấp hơn'} mức nền ${vnd(Math.abs(w.effect))}`}>
          <span>{w.label}</span>
          <div className="relative h-4">
            <div className="absolute inset-y-0 left-1/2 w-px bg-slate-300" />
            <div className="absolute inset-y-0 rounded" style={{ background: w.effect >= 0 ? FORECAST : NEGATIVE, width: `${(Math.abs(w.effect) / max) * 50}%`, left: w.effect >= 0 ? '50%' : `${50 - (Math.abs(w.effect) / max) * 50}%` }} />
          </div>
          <span className="text-right tabular-nums text-slate-700">{w.effect >= 0 ? '+' : '−'}{million(Math.abs(w.effect))}</span>
        </div>
      ))}
    </div>
  );
}

// Dự báo doanh thu và tăng trưởng cho Admin, đọc từ sổ cái
export default function Forecast() {
  const scope = useVenueScope();
  const [horizon, setHorizon] = useState(30);
  const [demo, setDemo] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [showTable, setShowTable] = useState(false);
  useEffect(() => {
    setData(null);
    setError('');
    const q = new URLSearchParams({ horizon: String(horizon), ...(scope.venueId ? { venueId: String(scope.venueId) } : {}), ...(demo ? { demo: '1' } : {}) });
    api(`/finance/forecast?${q}`).then(setData).catch((e) => setError(e.message));
  }, [horizon, demo, scope.venueId]);

  const chosen = data?.ok ? data.evaluation[data.model.key] : null;
  return (
    <div>
      <PageHeader title="Dự báo doanh thu" subtitle="Holt-Winters theo mùa vụ tuần, chọn mô hình bằng sai số trên dữ liệu đã có" scope={scope} allowAll>
        <Select label="Dự báo" value={horizon} onChange={(e) => setHorizon(Number(e.target.value))}>{[14, 30, 60, 90].map((h) => <option key={h} value={h}>{h} ngày tới</option>)}</Select>
        <Select label="Nguồn dữ liệu" value={demo ? 'demo' : 'ledger'} onChange={(e) => setDemo(e.target.value === 'demo')}>
          <option value="ledger">Sổ cái thật</option><option value="demo">Mô phỏng để trình diễn</option>
        </Select>
      </PageHeader>
      <Alert>{error}</Alert>
      {demo && <Alert kind="warning">Đang xem dữ liệu mô phỏng 26 tuần, không phải doanh thu thật. Dùng để trình diễn khi hệ thống chưa đủ lịch sử.</Alert>}
      {!data && !error ? <Spinner /> : data && !data.ok ? (
        <Card className="mt-4">
          <p className="font-semibold">Chưa đủ dữ liệu để dự báo</p>
          <p className="mt-1 text-sm text-slate-600">{data.reason}. Mô hình cần ít nhất 4 tuần doanh thu: 2 tuần để khởi tạo mùa vụ tuần, phần còn lại để đo sai số.</p>
          <Button className="mt-4" onClick={() => setDemo(true)}>Xem bằng dữ liệu mô phỏng</Button>
        </Card>
      ) : data && (
        <div className="mt-4 flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Doanh thu 30 ngày tới" value={data.summary.next30} format={vnd} note={`Khoảng 80%: ${million(data.summary.next30Lo80)} – ${million(data.summary.next30Hi80)}`} icon="chart" tone="teal" />
            <StatCard label="Tăng trưởng dự báo" value={Math.round((data.summary.growthPct ?? 0) * 10)} format={() => pct(data.summary.growthPct)} note={`So với 30 ngày qua (${million(data.summary.last30)})`} icon="finance" tone="lime" delay={80} />
            <StatCard label="30 ngày qua so với trước đó" value={Math.round((data.summary.recentGrowthPct ?? 0) * 10)} format={() => pct(data.summary.recentGrowthPct)} note="Tăng trưởng thực tế gần nhất" icon="chart" tone="slate" delay={160} />
            <StatCard label="Sai số trên tập kiểm tra" value={Math.round((chosen.mape ?? 0) * 10)} format={() => (chosen.mape === null ? '–' : `${chosen.mape.toLocaleString('vi-VN')}%`)} note={`MAPE, ${data.test.length} ngày cuối, MASE ${chosen.mase?.toLocaleString('vi-VN') ?? '–'}`} icon="check" delay={240} />
          </div>
          <Card>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">Doanh thu theo ngày và dự báo {data.horizon} ngày tới</h2>
              <Badge tone="teal">{data.model.label}</Badge>
            </div>
            <ForecastChart data={data} />
            <p className="mt-2 text-xs text-slate-600">Doanh thu ròng chưa gồm VAT, đọc từ sổ cái (tài khoản 5111, 5113), đã trừ hoàn tiền. Vùng tô là khoảng dự báo 80% và 95% tính bằng 1.000 lần mô phỏng phần dư.</p>
            <Button kind="ghost" className="mt-2 px-3 py-1 text-sm" onClick={() => setShowTable(!showTable)}>{showTable ? 'Ẩn bảng số liệu' : 'Xem bảng số liệu dự báo'}</Button>
            {showTable && (
              <div className="mt-2 max-h-72 overflow-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50 text-xs text-slate-600"><tr>{['Ngày', 'Dự báo', 'Khoảng 80%', 'Khoảng 95%'].map((h) => <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>{data.forecast.map((p) => <tr key={p.date} className="border-t border-slate-200"><td className="px-3 py-1.5">{dayMonth(p.date)}</td><td className="px-3 py-1.5 tabular-nums">{vnd(p.value)}</td><td className="px-3 py-1.5 tabular-nums">{million(p.lo80)} – {million(p.hi80)}</td><td className="px-3 py-1.5 tabular-nums">{million(p.lo95)} – {million(p.hi95)}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </Card>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <Card className="p-0">
              <div className="p-4 pb-2">
                <h2 className="font-semibold">Đánh giá mô hình trên {data.test.length} ngày cuối</h2>
                <p className="text-xs text-slate-600">Mỗi mô hình chỉ học phần dữ liệu trước đó rồi dự báo các ngày này. Chọn mô hình có MASE nhỏ nhất; MASE dưới 1 nghĩa là tốt hơn cách đoán "bằng cùng thứ tuần trước".</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] whitespace-nowrap text-sm">
                  <thead className="text-xs text-slate-600"><tr>{['Mô hình', 'MAE', 'RMSE', 'MAPE', 'MASE'].map((h) => <th key={h} className="px-4 py-2 text-left font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {Object.entries(data.evaluation).map(([key, e]) => (
                      <tr key={key} className={`border-t border-slate-200 ${key === data.model.key ? 'bg-teal-50 font-semibold' : ''}`}>
                        <td className="px-4 py-2">{e.label} {key === data.model.key && <Badge tone="teal">Được chọn</Badge>}</td>
                        <td className="px-4 py-2 tabular-nums">{million(e.mae)}</td><td className="px-4 py-2 tabular-nums">{million(e.rmse)}</td>
                        <td className="px-4 py-2 tabular-nums">{e.mape === null ? '–' : `${e.mape.toLocaleString('vi-VN')}%`}</td><td className="px-4 py-2 tabular-nums">{e.mase?.toLocaleString('vi-VN') ?? '–'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="px-4 py-3 text-xs text-slate-600">Tham số: α = {data.model.params.alpha}, β = {data.model.params.beta}, γ = {data.model.params.gamma}{data.model.params.phi < 1 ? `, φ = ${data.model.params.phi}` : ''}. Ước lượng bằng lưới, cực tiểu tổng bình phương sai số dự báo một bước.</p>
            </Card>
            <Card>
              <h2 className="font-semibold">Ảnh hưởng của thứ trong tuần</h2>
              <p className="mb-3 text-xs text-slate-600">Thành phần mùa vụ của mô hình: mỗi thứ cao hay thấp hơn mức nền bao nhiêu.</p>
              <Weekly weekly={data.weekly} />
            </Card>
          </div>
          <Card>
            <h2 className="font-semibold">Phương pháp và tài liệu tham khảo</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
              <li>Lấy doanh thu ròng từng ngày từ sổ cái, ngày không phát sinh tính 0.</li>
              <li>Khớp ba mô hình: Holt-Winters cộng tính, Holt-Winters xu hướng giảm dần, naive theo mùa làm mốc so sánh. Mùa vụ là chu kỳ 7 ngày.</li>
              <li>Giữ lại các ngày cuối làm tập kiểm tra, đo MAE, RMSE, MAPE, MASE; chọn mô hình MASE nhỏ nhất.</li>
              <li>Khớp lại mô hình được chọn trên toàn bộ dữ liệu, dự báo và tính khoảng dự báo bằng bootstrap phần dư.</li>
            </ol>
            <p className="mt-2 text-xs text-slate-600">Công thức đã đối chiếu với ETSModel của thư viện statsmodels: cùng tham số và giá trị khởi tạo cho kết quả trùng khớp.</p>
            <ul className="mt-3 space-y-1 text-sm">
              {REFERENCES.map(([text, href]) => <li key={href}><a className="text-teal-700 underline-offset-2 hover:underline" href={href} target="_blank" rel="noreferrer">{text}</a></li>)}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
