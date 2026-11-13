import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useFeedback } from '../lib/feedback';
import { fullDate } from '../lib/format';
import { Alert, Button, Input, Modal, PaymentBadge, Select, Spinner } from './ui';

// BR17: trước khi khóa sân, liệt kê đơn bị ảnh hưởng và cho đổi khách sang sân còn trống cùng khung giờ
export default function MaintenanceModal({ court, onClose, onDone }) {
  const { can } = useAuth();
  const { notify, confirm: ask } = useFeedback();
  const [bookings, setBookings] = useState(null);
  const [playing, setPlaying] = useState(null);
  const [picks, setPicks] = useState({});
  const [reason, setReason] = useState('');
  const [moved, setMoved] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api(`/courts/${court.id}/impact`).then((d) => { setBookings(d.bookings); setPlaying(d.playing ?? null); }).catch((e) => setError(e.message));
  }, [court.id]);
  useEffect(() => { load(); }, [load]);

  async function move(b) {
    const courtId = Number(picks[b.bookingCode] || b.alternatives[0].id);
    const target = b.alternatives.find((c) => c.id === courtId);
    const ok = await ask({
      title: 'Đổi sân cho khách?',
      message: 'Khách giữ nguyên giờ chơi và giá đã thanh toán. Hãy báo cho khách sau khi đổi.',
      details: [['Mã đơn', b.bookingCode], ['Khách', b.customerName], ['Sân mới', target.name]],
      confirmText: 'Đổi sân',
    });
    if (!ok) return;
    setError(''); setBusy(true);
    try {
      const { booking } = await api(`/bookings/${b.bookingCode}/move`, { method: 'POST', body: { courtId } });
      setMoved((list) => [...list, `${b.bookingCode} → ${booking.courtName}`]);
      notify.success(`Đã đổi đơn ${b.bookingCode} sang ${booking.courtName}`);
    } catch (e) { setError(e.message); } finally { setBusy(false); load(); }
  }

  async function confirm() {
    if (remaining > 0) {
      const ok = await ask({
        title: `Hủy ${remaining} đơn và khóa sân?`,
        message: 'Các đơn còn lại sẽ bị hủy, đơn đã thanh toán chuyển sang chờ hoàn tiền. Thao tác này không hoàn tác được.',
        tone: 'danger',
        confirmText: 'Hủy đơn và khóa sân',
        cancelText: 'Quay lại',
      });
      if (!ok) return;
    }
    setError(''); setBusy(true);
    try {
      const r = await api(`/courts/${court.id}/status`, { method: 'PATCH', body: { status: 'MAINTENANCE', reason: reason.trim() } });
      onDone(r, moved);
    } catch (e) { setError(e.message); setBusy(false); }
  }

  const remaining = bookings?.length ?? 0;
  return (
    <Modal
      title={`Chuyển ${court.name} sang bảo trì`}
      onClose={onClose}
      footer={(
        <>
          <Button kind="ghost" onClick={onClose}>Đóng</Button>
          <Button kind="danger" loading={busy} disabled={!reason.trim() || !bookings || Boolean(playing)} onClick={confirm}>Xác nhận bảo trì</Button>
        </>
      )}
    >
      <div className="flex flex-col gap-4">
        <Alert>{error}</Alert>
        {playing && (
          <Alert kind="warning">
            Sân đang có khách chơi tới <b>{playing.endTime}</b> (đơn {playing.bookingCode}{playing.checkedIn ? ', đã nhận sân' : ''}). Không khóa sân khi khách đang chơi; hãy đặt bảo trì sau {playing.endTime}.
          </Alert>
        )}
        {!bookings ? <Spinner /> : remaining === 0 ? (
          <p className="text-slate-600">{playing ? 'Ngoài đơn đang chơi, sân không có đơn sắp tới.' : 'Sân không có đơn sắp tới, có thể khóa ngay.'}</p>
        ) : (
          <>
            <Alert kind="warning">{remaining} đơn sắp tới bị ảnh hưởng. Đơn chưa đổi sân sẽ bị hủy, đơn đã thanh toán chuyển sang chờ hoàn tiền.</Alert>
            <ul className="flex flex-col divide-y divide-slate-200 rounded-lg border border-slate-200">
              {bookings.map((b) => (
                <li key={b.bookingCode} className="flex flex-col gap-2 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{b.bookingCode} · {b.customerName}</p>
                      <p className="text-sm text-slate-600">{fullDate(b.bookingDate)} · {b.startTime}–{b.endTime}{b.customerPhone ? ` · ${b.customerPhone}` : ''}</p>
                    </div>
                    <PaymentBadge status={b.paymentStatus} />
                  </div>
                  {!can('booking.move') ? null : b.alternatives.length === 0 ? (
                    <p className="text-sm text-red-700">Không còn sân trống cùng khung giờ.</p>
                  ) : (
                    <div className="flex flex-wrap items-end gap-2">
                      <Select label="Đổi sang" value={picks[b.bookingCode] ?? b.alternatives[0].id} onChange={(e) => setPicks({ ...picks, [b.bookingCode]: e.target.value })}>
                        {b.alternatives.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </Select>
                      <Button kind="secondary" className="h-11" disabled={busy} onClick={() => move(b)}>Đổi sân</Button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
        <Input label="Lý do bảo trì" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="VD: Thay mặt sân, sửa lưới" />
      </div>
    </Modal>
  );
}
