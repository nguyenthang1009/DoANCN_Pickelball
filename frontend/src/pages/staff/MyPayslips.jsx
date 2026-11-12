import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { vnd } from '../../lib/format';
import PageHeader from '../../components/PageHeader';
import { Reveal } from '../../components/motion';
import { Alert, Card, Spinner } from '../../components/ui';
import { PayslipDetail } from '../finance/Payroll';

// Mỗi nhân viên chỉ thấy phiếu lương của chính mình, sau khi bảng lương đã được duyệt
export default function MyPayslips() {
  const [slips, setSlips] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/payroll/my').then((d) => setSlips(d.payslips)).catch((e) => setError(e.message)); }, []);
  return (
    <div>
      <PageHeader title="Phiếu lương của tôi" subtitle="Chỉ mình bạn và người quản lý lương xem được" />
      <Alert>{error}</Alert>
      {!slips ? <Spinner /> : slips.length === 0 ? <Card><p className="text-slate-600">Chưa có phiếu lương nào được duyệt.</p></Card> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {slips.map((s, i) => (
            <Reveal key={s.id} delay={i * 70}>
              <button type="button" onClick={() => setViewing(s)} className="lift w-full rounded-xl border border-slate-200 bg-white p-5 text-left">
                <p className="text-sm text-slate-600">Tháng {s.month}</p>
                <p className="mt-1 text-2xl font-black italic">{vnd(s.netPay)}</p>
                <p className="mt-1 text-xs text-slate-600">Thu nhập {vnd(s.grossPay)}{s.pitWithholding ? ` · Thuế ${vnd(s.pit)}` : ''}</p>
              </button>
            </Reveal>
          ))}
        </div>
      )}
      {viewing && <PayslipDetail slip={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}
