import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Alert, Card, Spinner } from '../../components/ui';
import InvoiceTable from '../shared/InvoiceTable';

export default function MyInvoices() {
  const [invoices, setInvoices] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/invoices/my').then((d) => setInvoices(d.invoices)).catch((e) => setError(e.message)); }, []);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="sport-title text-3xl">Hóa đơn của tôi</h1>
        <p className="text-sm text-slate-600">Mọi khoản đã thanh toán và hoàn tiền của bạn</p>
      </div>
      <Alert>{error}</Alert>
      <Card className="p-0">{invoices ? <InvoiceTable invoices={invoices} /> : <Spinner />}</Card>
    </div>
  );
}
