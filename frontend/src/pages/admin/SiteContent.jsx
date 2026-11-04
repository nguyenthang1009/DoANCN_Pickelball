import { useEffect, useRef, useState } from 'react';
import { api, uploadImage } from '../../lib/api';
import { useFeedback } from '../../lib/feedback';
import { useSite } from '../../lib/site';
import { MEDIA_GROUPS, SITE_MEDIA } from '../../lib/siteMedia';
import PageHeader from '../../components/PageHeader';
import { Button, Card, Input } from '../../components/ui';
import { Tabs } from '../finance/Finance';

const MAX_BYTES = 6 * 1024 * 1024;

// Một vị trí ảnh: xem trước cắt theo khổ máy tính và điện thoại, bấm vào ảnh để đặt điểm lấy nét
function MediaCard({ mediaKey, label }) {
  const { media, refresh } = useSite();
  const { notify, confirm } = useFeedback();
  const current = media(mediaKey);
  const [focus, setFocus] = useState({ x: current.focusX, y: current.focusY });
  const [alt, setAlt] = useState(current.alt);
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  useEffect(() => { setFocus({ x: current.focusX, y: current.focusY }); setAlt(current.alt); }, [current.focusX, current.focusY, current.alt]);
  const objectPosition = `${focus.x}% ${focus.y}%`;
  const changed = focus.x !== current.focusX || focus.y !== current.focusY || alt !== current.alt;

  function pick(e) {
    const r = e.currentTarget.getBoundingClientRect();
    setFocus({ x: Math.round(((e.clientX - r.left) / r.width) * 100), y: Math.round(((e.clientY - r.top) / r.height) * 100) });
  }

  async function run(fn, ok) {
    setBusy(true);
    try { await fn(); await refresh(); notify.success(ok); } catch (err) { notify.error(err.message); } finally { setBusy(false); }
  }

  async function upload(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_BYTES) { notify.error('Ảnh quá lớn, tối đa 6 MB'); return; }
    const ok = await confirm({ title: `Thay ${label}?`, message: 'Ảnh mới hiện ngay trên website.', details: [['File', file.name]], confirmText: 'Thay ảnh' });
    if (ok) run(() => uploadImage(`/admin/site/media/${mediaKey}`, file), `Đã thay ${label}`);
  }

  async function reset() {
    const ok = await confirm({ title: `Khôi phục ${label}?`, message: 'Ảnh đã tải lên sẽ bị xóa, vị trí này dùng lại ảnh mặc định.', tone: 'warning', confirmText: 'Khôi phục' });
    if (ok) run(() => api(`/admin/site/media/${mediaKey}`, { method: 'DELETE' }), `Đã khôi phục ${label}`);
  }

  return (
    <Card className="flex flex-col gap-3 p-3">
      <p className="text-sm font-semibold">{label}</p>
      <div className="flex gap-2">
        <button type="button" onClick={pick} className="relative h-28 flex-1 cursor-crosshair overflow-hidden rounded-lg bg-slate-100" aria-label={`Chọn điểm lấy nét của ${label}`}>
          <img src={current.src} alt="" className="h-full w-full object-contain" />
          <span className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-lime-300 shadow" style={{ left: `${focus.x}%`, top: `${focus.y}%` }} />
        </button>
        <div className="flex flex-col gap-1">
          <img src={current.src} alt="Khổ máy tính" title="Khổ máy tính" className="h-10 w-24 rounded object-cover" style={{ objectPosition }} />
          <img src={current.src} alt="Khổ điện thoại" title="Khổ điện thoại" className="h-16 w-12 self-end rounded object-cover" style={{ objectPosition }} />
        </div>
      </div>
      <Input label="Mô tả ảnh" value={alt} onChange={(e) => setAlt(e.target.value)} />
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={upload} />
      <div className="flex flex-wrap gap-2">
        <Button kind="secondary" className="flex-1 px-3 py-1.5 text-sm" disabled={busy} onClick={() => input.current.click()}>Thay ảnh</Button>
        {changed && <Button className="flex-1 px-3 py-1.5 text-sm" disabled={busy} onClick={() => run(() => api(`/admin/site/media/${mediaKey}`, { method: 'PATCH', body: { alt, focusX: focus.x, focusY: focus.y } }), `Đã lưu ${label}`)}>Lưu</Button>}
        {current.src.startsWith('/uploads') && <Button kind="ghost" className="px-3 py-1.5 text-sm" disabled={busy} onClick={reset}>Mặc định</Button>}
      </div>
    </Card>
  );
}

function Images() {
  const [group, setGroup] = useState('hero');
  const keys = Object.keys(SITE_MEDIA).filter((k) => k.startsWith(`${group}.`));
  const hint = MEDIA_GROUPS.find(([k]) => k === group)[2];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {MEDIA_GROUPS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={group === key} onClick={() => setGroup(key)} className={`rounded-full px-4 py-1.5 text-sm font-semibold transition active:scale-95 ${group === key ? 'bg-teal-700 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'}`}>{label}</button>
        ))}
      </div>
      <p className="text-sm text-slate-600">{hint}. Bấm vào ảnh để chọn điểm cần giữ lại khi ảnh bị cắt theo khổ màn hình.</p>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {keys.map((k) => <MediaCard key={k} mediaKey={k} label={SITE_MEDIA[k].label} />)}
      </div>
    </div>
  );
}

const FIELDS = [
  ['Đồ án', [['project_name', 'Tên đề tài'], ['project_type', 'Loại đồ án'], ['team_members', 'Thành viên thực hiện (cách nhau bằng dấu phẩy)'], ['advisor', 'Giảng viên hướng dẫn'], ['tech_stack', 'Công nghệ sử dụng'], ['deployment', 'Triển khai']]],
  ['Bên bán trên hóa đơn', [['seller_name', 'Tên đơn vị'], ['seller_tax_code', 'Mã số thuế'], ['seller_address', 'Địa chỉ'], ['hotline', 'Điện thoại']]],
];

function Settings() {
  const { settings, refresh } = useSite();
  const { notify, confirm } = useFeedback();
  const [form, setForm] = useState(settings);
  useEffect(() => setForm(settings), [settings]);

  async function save(e) {
    e.preventDefault();
    const ok = await confirm({ title: 'Lưu thông tin website?', message: 'Hóa đơn phát hành từ giờ dùng thông tin mới, hóa đơn cũ giữ nguyên.', confirmText: 'Lưu' });
    if (!ok) return;
    try { await api('/admin/site/settings', { method: 'PUT', body: { settings: form } }); await refresh(); notify.success('Đã lưu thông tin website'); } catch (err) { notify.error(err.message); }
  }

  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-2">
      {FIELDS.map(([title, fields]) => (
        <Card key={title} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          {fields.map(([key, label]) => <Input key={key} label={label} value={form[key] ?? ''} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />)}
        </Card>
      ))}
      <div><Button type="submit">Lưu thông tin</Button></div>
    </form>
  );
}

// Admin quản lý mọi ảnh hệ thống và thông tin đồ án. Ảnh riêng của khách hàng không nằm trong màn hình này.
export default function SiteContent() {
  const [tab, setTab] = useState('images');
  return (
    <div>
      <PageHeader title="Ảnh & nội dung" subtitle="Thay ảnh, chỉnh điểm lấy nét, cập nhật thông tin đồ án và hóa đơn" />
      <Tabs tabs={[['images', 'Ảnh hệ thống'], ['settings', 'Thông tin']]} value={tab} onChange={setTab} />
      {tab === 'images' ? <Images /> : <Settings />}
    </div>
  );
}
