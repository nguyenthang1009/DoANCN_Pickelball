import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { vnd } from '../../lib/format';
import PageHeader from '../../components/PageHeader';
import { Alert, Badge, Button, Card, Input, Modal, Spinner } from '../../components/ui';

// Công tắc bật/tắt lưu dạng số 1/0
const SWITCHES = ['PIT_WITHHOLDING'];
const formatValue = (p) => (SWITCHES.includes(p.code) ? (p.value ? 'Bật' : 'Tắt') : p.unit === 'VND' ? vnd(p.value) : p.unit === 'BP' ? `${(p.value / 100).toLocaleString('vi-VN')}%` : String(p.value));
const day = (d) => (d ? String(d).slice(0, 10) : '');

function AddVersion({ parameter, onSave, onClose }) {
  const [form, setForm] = useState({ value: parameter.unit === 'BP' ? parameter.value / 100 : parameter.value, effectiveFrom: '', legalRef: '' });
  const save = () => onSave({ code: parameter.code, value: parameter.unit === 'BP' ? Math.round(Number(form.value) * 100) : Number(form.value), effectiveFrom: form.effectiveFrom, legalRef: form.legalRef });
  return (
    <Modal title={parameter.label} onClose={onClose} footer={<><Button kind="ghost" onClick={onClose}>Đóng</Button><Button onClick={save} disabled={!form.effectiveFrom || !form.legalRef.trim()}>Thêm phiên bản</Button></>}>
      <div className="flex flex-col gap-3">
        {SWITCHES.includes(parameter.code) ? (
          <label className="flex flex-col gap-1 text-sm font-medium">Trạng thái mới
            <select className="rounded-lg border border-slate-300 bg-white px-3 py-2" value={form.value} onChange={(e) => setForm({ ...form, value: Number(e.target.value) })}>
              <option value={1}>Bật</option><option value={0}>Tắt</option>
            </select>
          </label>
        ) : <Input label={parameter.unit === 'BP' ? 'Giá trị mới (%)' : 'Giá trị mới'} type="number" step="any" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />}
        <Input label="Hiệu lực từ ngày" type="date" value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
        <Input label="Căn cứ pháp lý" placeholder="Số văn bản, điều khoản" value={form.legalRef} onChange={(e) => setForm({ ...form, legalRef: e.target.value })} />
        <p className="text-xs text-slate-600">Giá trị cũ vẫn được giữ để tính đúng các kỳ trước ngày hiệu lực.</p>
      </div>
    </Modal>
  );
}

// Luật đổi thì thêm phiên bản theo ngày hiệu lực, không sửa số cũ, không phải sửa code
export default function LegalParameters() {
  const { notify, confirm } = useFeedback();
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const load = useCallback(() => api('/finance/legal-parameters').then(setData).catch((e) => setError(e.message)), []);
  useEffect(() => { load(); }, [load]);

  async function save(body) {
    const ok = await confirm({ title: 'Thêm phiên bản tham số?', message: 'Mọi hóa đơn và bảng lương từ ngày hiệu lực sẽ dùng giá trị này.', details: [['Hiệu lực từ', body.effectiveFrom], ['Căn cứ', body.legalRef]], tone: 'warning', confirmText: 'Thêm phiên bản' });
    if (!ok) return;
    try { await api('/finance/legal-parameters', { method: 'POST', body }); notify.success('Đã thêm phiên bản mới'); setEditing(null); load(); } catch (e) { notify.error(e.message); }
  }

  const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
  const active = (p) => day(p.effectiveFrom) <= today && (!p.effectiveTo || day(p.effectiveTo) >= today);
  return (
    <div>
      <PageHeader title="Tham số pháp lý" subtitle="VAT, bảo hiểm, giảm trừ gia cảnh, lương tối thiểu theo ngày hiệu lực" />
      <Alert kind="info">Giá trị theo văn bản hiện hành, căn cứ ghi ở từng dòng. Khi luật thay đổi, thêm phiên bản mới với ngày hiệu lực; kỳ cũ vẫn tính theo số cũ. Chỉ Admin được sửa.</Alert>
      <Alert>{error}</Alert>
      {!data ? <Spinner /> : (
        <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
          <Card className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="text-xs text-slate-600"><tr>{['Tham số', 'Giá trị', 'Hiệu lực', 'Căn cứ', ''].map((h) => <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {data.parameters.map((p) => (
                    <tr key={p.id} className="border-t border-slate-200">
                      <td className="px-4 py-2 font-medium">{p.label}</td>
                      <td className="px-4 py-2 font-semibold">{formatValue(p)}</td>
                      <td className="whitespace-nowrap px-4 py-2">{day(p.effectiveFrom)} → {day(p.effectiveTo) || 'nay'} {active(p) && <Badge tone="green">Đang dùng</Badge>}</td>
                      <td className="px-4 py-2 text-xs text-slate-600">{p.legalRef}</td>
                      <td className="px-4 py-2 text-right">{!p.effectiveTo && <Button kind="ghost" className="px-3 py-1 text-sm" onClick={() => setEditing(p)}>Thêm bản mới</Button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card className="self-start">
            <h2 className="font-semibold">Biểu thuế TNCN lũy tiến</h2>
            <p className="mb-2 text-xs text-slate-600">Chỉ dùng khi bật “Khấu trừ thuế TNCN khi trả lương”.</p>
            {data.pitBrackets.map((b) => (
              <div key={`${b.effectiveFrom}-${b.upperLimit}`} className="flex justify-between border-t border-slate-200 py-2 text-sm first:border-0">
                <span>{b.upperLimit ? `Đến ${vnd(b.upperLimit)}` : 'Phần còn lại'}</span><span className="font-semibold">{b.rateBp / 100}%</span>
              </div>
            ))}
          </Card>
        </div>
      )}
      {editing && <AddVersion parameter={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}
