import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { todayVN, vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import StatCard from '../../components/StatCard';
import { Alert, Card, Input, Spinner } from '../../components/ui';
import InvoiceTable from '../shared/InvoiceTable';

// Hóa đơn của cơ sở theo khoảng ngày; Admin xem toàn chuỗi hoặc từng cơ sở
export default function Invoices() {
  const scope = useVenueScope();
  const [range, setRange] = useState({ from: todayVN(), to: todayVN() });
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const q = scope.isAdmin && scope.venueId ? `&venueId=${scope.venueId}` : '';
    setData(null);
    api(`/invoices?from=${range.from}&to=${range.to}${q}`).then(setData).catch((e) => setError(e.message));
  }, [range, scope.isAdmin, scope.venueId]);

  const signed = (key) => (data?.invoices ?? []).reduce((s, i) => s + (i.type === 'CREDIT' ? -i[key] : i[key]), 0);
  return (
    <div>
      <PageHeader title="Hóa đơn" subtitle="Mỗi khoản thu tự sinh hóa đơn, không sửa, không xóa được" scope={scope} allowAll>
        <Input label="Từ ngày" type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} />
        <Input label="Đến ngày" type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} />
      </PageHeader>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label="Thực thu" value={signed('total')} format={vnd} icon="wallet" tone="teal" />
            <StatCard label="Doanh thu chưa thuế" value={signed('subtotal')} format={vnd} icon="chart" delay={80} />
            <StatCard label="Thuế GTGT đầu ra" value={signed('vatAmount')} format={vnd} icon="tax" delay={160} />
          </div>
          <Card className="p-0"><InvoiceTable invoices={data.invoices} showVenue={scope.isAdmin} /></Card>
        </div>
      )}
    </div>
  );
}
