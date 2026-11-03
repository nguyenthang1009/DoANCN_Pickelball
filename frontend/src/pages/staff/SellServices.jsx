import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { vnd } from '../../lib/format';
import { useVenueScope } from '../../lib/useVenueScope';
import PageHeader from '../../components/PageHeader';
import ServiceCart, { cartItems, cartTotal } from '../../components/ServiceCart';
import { Alert, Button, Card } from '../../components/ui';

// Bán lẻ nước uống, thuê vợt cho khách không kèm đơn sân (service_orders.booking_id = NULL)
export default function SellServices() {
  const scope = useVenueScope();
  const [services, setServices] = useState([]);
  const [cart, setCart] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (scope.venueId) api(`/venues/${scope.venueId}/services`).then((d) => setServices(d.services)).catch((e) => setError(e.message)); }, [scope.venueId]);
  const total = cartTotal(services, cart);

  async function sell(paymentMethod) {
    setError(''); setNotice(''); setBusy(true);
    try {
      const { order } = await api(`/venues/${scope.venueId}/service-orders`, { method: 'POST', body: { items: cartItems(cart), paymentMethod } });
      setNotice(`Đã bán hóa đơn #${order.id}: ${vnd(order.totalServiceAmount)} (${paymentMethod === 'CASH' ? 'tiền mặt' : 'chuyển khoản'})`);
      setCart({});
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="max-w-2xl">
      <PageHeader title="Bán dịch vụ tại quầy" subtitle="Nước uống, thuê vợt, bóng cho khách không kèm đơn sân" scope={scope} />
      <Card className="flex flex-col gap-4">
        <Alert>{error}</Alert>
        <Alert kind="success">{notice}</Alert>
        <ServiceCart services={services} cart={cart} onChange={setCart} />
        <div className="flex items-center justify-between border-t border-slate-200 pt-3"><span className="font-semibold">Tổng cộng</span><span className="text-xl font-semibold">{vnd(total)}</span></div>
        <div className="flex gap-2">
          <Button kind="secondary" className="flex-1" disabled={!total} loading={busy} onClick={() => sell('VIETQR')}>Chuyển khoản</Button>
          <Button className="flex-1" disabled={!total} loading={busy} onClick={() => sell('CASH')}>Thu tiền mặt</Button>
        </div>
      </Card>
    </div>
  );
}
