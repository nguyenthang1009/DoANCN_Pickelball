import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import BookingSummary from '../../components/BookingSummary';
import PageHeader from '../../components/PageHeader';
import { Alert, Button, Card, Input } from '../../components/ui';

// UC11: lễ tân quét QR trên vé (camera) hoặc nhập mã đơn, kiểm tra rồi xác nhận nhận sân
export default function CheckIn() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const { notify } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const scanner = useRef(null);

  async function lookup(body) {
    setError(''); setResult(null);
    try { setResult(await api('/checkin/lookup', { method: 'POST', body })); } catch (e) { setError(e.message); }
  }

  async function startCamera() {
    setError('');
    try {
      scanner.current = new Html5Qrcode('qr-reader');
      await scanner.current.start({ facingMode: 'environment' }, { fps: 10, qrbox: 220 }, async (text) => {
        await stopCamera();
        lookup({ qr: text });
      });
      setScanning(true);
    } catch (e) {
      setError(`Không mở được camera: ${e?.message || e}. Hãy nhập mã đơn bên dưới.`);
    }
  }

  async function stopCamera() {
    if (scanner.current?.isScanning) await scanner.current.stop().catch(() => {});
    setScanning(false);
  }
  useEffect(() => () => { stopCamera(); }, []);

  async function confirm() {
    setBusy(true);
    try {
      const { booking } = await api(`/bookings/${result.booking.bookingCode}/check-in`, { method: 'POST', body: {} });
      setResult({ ...result, booking, canCheckIn: false, reason: null });
      notify.success(`${booking.customerName} đã nhận ${booking.courtName}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-col">
      <PageHeader title="Check-in QR" subtitle="Mở check-in 30 phút trước giờ chơi. Mã QR có chữ ký nên không giả mạo được." />
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <Card className="flex flex-col gap-4">
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 rounded-lg bg-slate-900 p-4 text-white">
            <div id="qr-reader" className="w-full max-w-sm" />
            {!scanning && <Button kind="secondary" onClick={startCamera}>Bật camera quét mã</Button>}
            {scanning && <Button kind="secondary" onClick={stopCamera}>Tắt camera</Button>}
            <p className="text-sm">Đưa mã QR trên vé điện tử vào khung</p>
          </div>
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); lookup({ code }); }}>
            <Input label="Hoặc nhập mã đơn" placeholder="PKB-261102-7A4C" value={code} onChange={(e) => setCode(e.target.value)} className="flex-1" />
            <Button kind="secondary" type="submit" disabled={!code.trim()}>Tra cứu</Button>
          </form>
        </Card>
        <Card className={`flex flex-col gap-4 ${result?.canCheckIn ? 'border-teal-700' : ''}`}>
          <Alert>{error}</Alert>
          {!result && !error && <p className="text-sm text-slate-600">Kết quả quét sẽ hiện ở đây.</p>}
          {result && (
            <>
              <p className={`text-sm font-medium ${result.canCheckIn ? 'text-green-700' : 'text-amber-700'}`}>
                {result.method === 'QR' ? 'Mã QR hợp lệ · chữ ký HMAC khớp' : 'Tra cứu bằng mã đơn'}{result.reason ? ` · ${result.reason}` : ''}
              </p>
              <BookingSummary booking={result.booking} showCheckin />
              <div className="flex gap-2">
                <Button kind="ghost" onClick={() => { setResult(null); setCode(''); }}>Đóng</Button>
                <Button className="flex-1" disabled={!result.canCheckIn} loading={busy} onClick={confirm}>Xác nhận nhận sân</Button>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
