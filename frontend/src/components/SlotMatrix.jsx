import { shortPrice } from '../lib/format';

// Màu ô theo design system: Trống, Đang chọn, Đang giữ, Đã đặt, Quá giờ, Bảo trì
const CELL = {
  FREE: 'bg-green-100 text-green-700 hover:ring-2 hover:ring-teal-700 cursor-pointer',
  SELECTED: 'bg-teal-700 text-white ring-2 ring-inset ring-slate-900 cursor-pointer',
  HELD: 'bg-amber-100 text-amber-700 ring-1 ring-inset ring-amber-700',
  BOOKED: 'bg-red-100 text-red-700 ring-1 ring-inset ring-red-700',
  CHECKED_IN: 'bg-green-100 text-green-700 ring-1 ring-inset ring-green-700',
  PAST: 'bg-slate-100 text-slate-600',
  UNPRICED: 'bg-slate-100 text-slate-600',
  MAINTENANCE: 'slot-maintenance text-slate-600',
};
const STATE_NAME = {
  FREE: 'Trống', SELECTED: 'Đang chọn', HELD: 'Đang có người giữ', BOOKED: 'Đã đặt', CHECKED_IN: 'Đã check-in',
  PAST: 'Quá giờ', UNPRICED: 'Chưa có giá', MAINTENANCE: 'Bảo trì',
};

const Icon = ({ path }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={path} />
  </svg>
);
// NFR09: trạng thái không chỉ dựa vào màu, người mù màu vẫn phân biệt được qua biểu tượng
const ICON = {
  HELD: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  BOOKED: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  CHECKED_IN: 'M4 12.5l5 5L20 6.5',
  MAINTENANCE: 'M14.5 6.5a4 4 0 0 0-5.3 5.3L3.5 17.5l3 3 5.7-5.7a4 4 0 0 0 5.3-5.3l-2.8 2.8-2.5-.5-.5-2.5z',
};

function CellContent({ state, price, compact }) {
  if (ICON[state]) {
    const label = state === 'HELD' ? shortPrice(price) : state === 'BOOKED' ? 'Đã đặt' : state === 'CHECKED_IN' ? 'Vào sân' : '';
    return <><Icon path={ICON[state]} />{!compact && label && <span className="text-[10px] leading-3">{label}</span>}</>;
  }
  if (state === 'PAST') return compact ? '–' : <span className="text-[10px] leading-3">Quá giờ</span>;
  if (state === 'UNPRICED') return '?';
  return compact ? null : shortPrice(price);
}

export const LEGEND = ['FREE', 'SELECTED', 'HELD', 'BOOKED', 'PAST', 'MAINTENANCE'];

// Ma trận lịch: mỗi hàng một sân, mỗi cột một ô 30 phút. compact = bản thu nhỏ cho màn POS.
// checkedIn: tập khóa `${courtId}_${HH:MM}` của các ô khách đã nhận sân.
export default function SlotMatrix({ courts, selection, onCellClick, compact = false, checkedIn }) {
  if (!courts?.length) return <p className="py-6 text-center text-sm text-slate-600">Cơ sở chưa có sân nào.</p>;
  const slotsCount = courts[0].slots.length;
  const label = compact ? 76 : 112;
  const cols = `${label}px repeat(${slotsCount}, minmax(${compact ? 16 : 36}px, 1fr))`;

  // Nhãn giờ nằm nổi (absolute) để không ép độ rộng cột; bản POS co vừa khung, bản khách cuộn ngang trên màn hẹp
  return (
    <div className="overflow-x-auto overflow-y-hidden pb-1">
      <div className={`grid gap-0.5 ${compact ? '' : 'min-w-max'}`} style={{ gridTemplateColumns: cols }} role="grid" aria-label="Ma trận lịch sân">
        <div className="sticky left-0 z-10 bg-white" />
        {courts[0].slots.map((s, i) => (
          <div key={s.start} className="relative h-5 text-[11px] text-slate-600">
            {i % 2 === 0 && (compact ? i % 4 === 0 : true) && <span className="absolute left-0 whitespace-nowrap">{s.start}</span>}
          </div>
        ))}
        {courts.map((court) => (
          <Row key={court.id} court={court} selection={selection} onCellClick={onCellClick} compact={compact} checkedIn={checkedIn} />
        ))}
      </div>
    </div>
  );
}

function Row({ court, selection, onCellClick, compact, checkedIn }) {
  const height = compact ? 'h-9' : 'h-12';
  return (
    <>
      <div className={`sticky left-0 z-10 flex ${height} flex-col justify-center bg-white pr-2`} role="rowheader">
        <span className={`${compact ? 'text-sm' : ''} font-semibold leading-tight`}>{court.name.replace(/\s*\(.*\)/, '')}</span>
        <span className="text-xs text-slate-600">{court.status === 'ACTIVE' ? (court.courtType === 'INDOOR' ? 'Trong nhà' : 'Ngoài trời') : compact ? 'Bảo trì' : 'Đang bảo trì'}</span>
      </div>
      {court.slots.map((slot, i) => {
        const selected = selection && selection.courtId === court.id && i >= selection.startIdx && i <= selection.endIdx;
        const arrived = slot.state === 'BOOKED' && checkedIn?.has(`${court.id}_${slot.start}`);
        const state = selected ? 'SELECTED' : arrived ? 'CHECKED_IN' : slot.state;
        return (
          <button
            key={slot.start}
            type="button"
            role="gridcell"
            disabled={!(slot.state === 'FREE' && onCellClick)}
            onClick={() => onCellClick?.(court, i)}
            title={`${court.name} · ${slot.start}–${slot.end} · ${STATE_NAME[state]}`}
            aria-label={`${court.name} ${slot.start} ${STATE_NAME[state]}${slot.price ? ` ${shortPrice(slot.price)}` : ''}`}
            aria-selected={selected}
            className={`flex ${height} flex-col items-center justify-center gap-0.5 rounded-md text-[11px] font-medium ${CELL[state]} disabled:cursor-default`}
          >
            <CellContent state={state} price={slot.price} compact={compact} />
          </button>
        );
      })}
    </>
  );
}

export function Legend({ showCheckedIn = false }) {
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-600">
      {[...LEGEND, ...(showCheckedIn ? ['CHECKED_IN'] : [])].map((state) => (
        <span key={state} className="flex items-center gap-2">
          <span className={`inline-flex h-5 w-5 items-center justify-center rounded ${CELL[state].replace(/hover:\S+|cursor-pointer/g, '')}`}>
            {ICON[state] && <Icon path={ICON[state]} />}
          </span>
          {STATE_NAME[state]}
        </span>
      ))}
    </div>
  );
}
