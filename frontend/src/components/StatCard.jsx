import { CountUp, Reveal } from './motion';
import { Icon } from './icons';

const TONE = {
  teal: 'from-teal-700 to-teal-500 text-white',
  lime: 'from-lime-300 to-lime-200 text-slate-900',
  slate: 'from-slate-900 to-slate-700 text-white',
  amber: 'from-amber-400 to-amber-300 text-slate-900',
  white: 'from-white to-white text-slate-900 ring-1 ring-slate-200',
};

// Thẻ số liệu: số chạy lên khi hiện ra. format nhận số nguyên, trả về chuỗi hiển thị.
export default function StatCard({ label, value, format, note, icon, tone = 'white', delay = 0 }) {
  const dark = tone === 'teal' || tone === 'slate';
  return (
    <Reveal delay={delay} className={`stat-card bg-gradient-to-br ${TONE[tone]}`}>
      <div className="flex items-start justify-between gap-3">
        <p className={`text-sm font-medium ${dark ? 'text-white/80' : 'text-slate-600'}`}>{label}</p>
        {icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${dark ? 'bg-white/15' : 'bg-slate-900/5'}`}><Icon name={icon} /></span>}
      </div>
      <p className="mt-2 break-words text-2xl font-black italic tracking-tight"><CountUp value={value} format={format} /></p>
      {note && <p className={`mt-1 text-xs ${dark ? 'text-white/75' : 'text-slate-600'}`}>{note}</p>}
    </Reveal>
  );
}
