import { addDays, dayMonth, isWeekendDate, weekdayShort } from '../lib/format';

// Dải chọn ngày (component DateChip): cuối tuần có nhãn nền xanh chuối
export default function DateStrip({ start, days, value, onChange }) {
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {dates.map((d) => {
        const selected = d === value;
        return (
          <button
            key={d}
            type="button"
            onClick={() => onChange(d)}
            aria-pressed={selected}
            className={`flex w-20 shrink-0 flex-col items-center gap-1 rounded-lg border bg-white px-3 py-2 ${selected ? 'border-2 border-teal-700 bg-teal-50' : 'border-slate-200 hover:border-teal-700'}`}
          >
            <span className={`rounded px-1.5 text-xs font-medium ${isWeekendDate(d) ? 'bg-lime-300 text-slate-900' : 'text-slate-600'}`}>{weekdayShort(d)}</span>
            <span className="font-semibold">{dayMonth(d)}</span>
          </button>
        );
      })}
    </div>
  );
}
