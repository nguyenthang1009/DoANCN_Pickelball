import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { dateTime, todayVN, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import { Alert, Card, Input, Spinner } from '../../components/ui';

const Stat = ({ label, value }) => (
  <Card className="p-4"><p className="text-sm text-slate-600">{label}</p><p className="text-2xl font-semibold">{value}</p></Card>
);

// BR14, US-S08: doanh thu ca trực. Staff thấy ca của mình, Manager cả cơ sở, Admin toàn hệ thống
export default function Shift() {
  const scope = useVenueScope();
  const [date, setDate] = useState(todayVN());
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const q = scope.isAdmin && scope.venueId ? `&venueId=${scope.venueId}` : '';
    api(`/reports/shift?date=${date}${q}`).then(setData).catch((e) => setError(e.message));
  }, [date, scope.isAdmin, scope.venueId]);

  return (
    <div>
      <PageHeader title="Doanh thu ca" subtitle={data?.scope} scope={scope} allowAll>
        <Input label="Ngày" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </PageHeader>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Tổng thu" value={vnd(data.totals.all)} />
            <Stat label="Tiền sân" value={vnd(data.totals.court)} />
            <Stat label="Dịch vụ" value={vnd(data.totals.service)} />
            <Stat label="Tiền mặt / chuyển khoản" value={`${vnd(data.totals.cash)} / ${vnd(data.totals.transfer)}`} />
          </div>
          <Card className="overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="text-xs text-slate-600"><tr>{['Thời điểm', 'Nội dung', 'Nhân viên', 'Hình thức', 'Số tiền'].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {data.lines.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-slate-600">Chưa có giao dịch tại quầy trong ngày.</td></tr>}
                {data.lines.map((l, i) => (
                  <tr key={i} className="border-t border-slate-200">
                    <td className="px-4 py-3">{dateTime(l.at).slice(11)}</td>
                    <td className="px-4 py-3">{l.label}</td>
                    <td className="px-4 py-3">{l.staff}</td>
                    <td className="px-4 py-3">{l.method === 'CASH' ? 'Tiền mặt' : 'VietQR'}</td>
                    <td className="px-4 py-3 text-right font-medium">{vnd(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </div>
      )}
    </div>
  );
}
