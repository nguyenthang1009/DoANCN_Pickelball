import { shortPrice } from '../lib/format';

// Màu ô theo design system: Trống, Đang chọn, Đang giữ, Đã đặt, Quá giờ, Bảo trì
const CELL = {
  FREE: 'bg-green-100 text-green-700 hover:ring-2 hover:ring-teal-700 cursor-pointer',
  SELECTED: 'bg-teal-700 text-white cursor-pointer',
  HELD: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-700',
  BOOKED: 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-700',
  PAST: 'bg-slate-100 text-slate-600',
  UNPRICED: 'bg-slate-100 text-slate-600',
  MAINTENANCE: 'slot-maintenance',
};
const LABEL = { HELD: 'Giữ', BOOKED: 'Đặt', PAST: '—', UNPRICED: '?' };

export const LEGEND = [
  ['FREE', 'Trống'], ['SELECTED', 'Đang chọn'], ['HELD', 'Đang có người giữ'], ['BOOKED', 'Đã đặt'], ['PAST', 'Quá giờ'], ['MAINTENANCE', 'Bảo trì'],
];

// Ma trận lịch: mỗi hàng một sân, mỗi cột một ô 30 phút. compact = bản thu nhỏ cho màn POS.
export default function SlotMatrix({ courts, selection, onCellClick, compact = false }) {
  if (!courts?.length) return <p className="py-6 text-center text-sm text-slate-600">Cơ sở chưa có sân nào.</p>;
  const slotsCount = courts[0].slots.length;
  const label = compact ? 76 : 112;
  const cols = `${label}px repeat(${slotsCount}, minmax(${compact ? 16 : 30}px, 1fr))`;

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-max gap-0.5" style={{ gridTemplateColumns: cols }} role="grid" aria-label="Ma trận lịch sân">
        <div className="sticky left-0 z-10 bg-white" />
        {courts[0].slots.map((s, i) => (
          <div key={s.start} className="h-5 text-[11px] text-slate-600">{i % 2 === 0 && (compact ? i % 4 === 0 : true) ? s.start : ''}</div>
        ))}
        {courts.map((court) => (
          <Row key={court.id} court={court} selection={selection} onCellClick={onCellClick} compact={compact} />
        ))}
      </div>
    </div>
  );
}

function Row({ court, selection, onCellClick, compact }) {
  const height = compact ? 'h-9' : 'h-12';
  return (
    <>
      <div className={`sticky left-0 z-10 flex ${height} flex-col justify-center bg-white pr-2`} role="rowheader">
        <span className={`${compact ? 'text-sm' : ''} font-semibold leading-tight`}>{court.name.replace(/\s*\(.*\)/, '')}</span>
        <span className="text-xs text-slate-600">{court.status === 'ACTIVE' ? (court.courtType === 'INDOOR' ? 'Trong nhà' : 'Ngoài trời') : 'Đang bảo trì'}</span>
      </div>
      {court.slots.map((slot, i) => {
        const selected = selection && selection.courtId === court.id && i >= selection.startIdx && i <= selection.endIdx;
        const state = selected ? 'SELECTED' : slot.state;
        const text = state === 'FREE' || state === 'SELECTED' ? shortPrice(slot.price) : LABEL[state] || '';
        return (
          <button
            key={slot.start}
            type="button"
            role="gridcell"
            disabled={!(slot.state === 'FREE' && onCellClick)}
            onClick={() => onCellClick?.(court, i)}
            title={`${court.name} · ${slot.start}–${slot.end}`}
            aria-label={`${court.name} ${slot.start} ${state}`}
            aria-selected={selected}
            className={`${height} rounded-md text-[11px] font-medium ${CELL[state]} disabled:cursor-default`}
          >
            {compact ? '' : text}
          </button>
        );
      })}
    </>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
      {LEGEND.map(([state, label]) => (
        <span key={state} className="flex items-center gap-2">
          <span className={`inline-block h-4 w-4 rounded ${CELL[state].split(' hover')[0].replace('cursor-pointer', '')}`} />
          {label}
        </span>
      ))}
    </div>
  );
}
