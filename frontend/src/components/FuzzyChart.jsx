const COLORS = ['#0f766e', '#d97706', '#4d7c0f', '#7c3aed', '#be123c', '#0369a1'];
const W = 320;
const H = 110;
const PAD = { left: 8, right: 8, top: 10, bottom: 22 };

// Biểu đồ hàm thuộc của một biến mờ: mỗi tập một hình thang, vạch dọc là giá trị đầu vào.
// Với biến đầu ra, vẽ thêm vùng gộp sau khi cắt ngọn và đường trọng tâm.
export default function FuzzyChart({ variable, value, degrees, curve, centroid }) {
  const x = (v) => PAD.left + ((v - variable.min) / (variable.max - variable.min)) * (W - PAD.left - PAD.right);
  const y = (m) => H - PAD.bottom - m * (H - PAD.top - PAD.bottom);
  const sets = Object.entries(variable.sets);
  const area = curve?.length ? `M${x(curve[0][0])},${y(0)} ${curve.map(([v, m]) => `L${x(v)},${y(m)}`).join(' ')} L${x(curve.at(-1)[0])},${y(0)} Z` : null;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => variable.min + t * (variable.max - variable.min));

  return (
    <figure className="flex flex-col gap-2">
      <figcaption className="flex items-baseline justify-between text-sm">
        <span className="font-semibold">{variable.label}</span>
        {value !== undefined && value !== null && <span className="font-bold text-teal-700">{Number(value).toLocaleString('vi-VN')} {variable.unit}</span>}
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label={`Hàm thuộc ${variable.label}`}>
        <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} stroke="#cbd5e1" />
        <line x1={PAD.left} x2={W - PAD.right} y1={y(1)} y2={y(1)} stroke="#e2e8f0" strokeDasharray="3 3" />
        {ticks.map((t) => <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize="9" fill="#64748b">{Math.round(t)}</text>)}
        {area && <path d={area} fill="#14b8a6" fillOpacity="0.35" stroke="#0f766e" strokeWidth="1.5" className="fuzzy-area" />}
        {sets.map(([key, s], i) => (
          <polyline
            key={key}
            points={[[s.points[0], 0], [s.points[1], 1], [s.points[2], 1], [s.points[3], 0]].map(([v, m]) => `${x(v)},${y(m)}`).join(' ')}
            fill="none"
            stroke={COLORS[i % COLORS.length]}
            strokeWidth={curve ? 1 : 2}
            strokeDasharray={curve ? '4 3' : undefined}
            strokeLinejoin="round"
          />
        ))}
        {value !== undefined && value !== null && !curve && <line x1={x(value)} x2={x(value)} y1={y(0)} y2={PAD.top - 4} stroke="#0f172a" strokeWidth="2" className="fuzzy-marker" />}
        {centroid > 0 && (
          <g className="fuzzy-marker">
            <line x1={x(centroid)} x2={x(centroid)} y1={y(0)} y2={PAD.top - 4} stroke="#65a30d" strokeWidth="2.5" />
            <text x={x(centroid)} y={PAD.top - 6} textAnchor="middle" fontSize="10" fontWeight="700" fill="#3f6212">trọng tâm {centroid.toFixed(1)}</text>
          </g>
        )}
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600">
        {sets.map(([key, s], i) => (
          <span key={key} className="flex items-center gap-1">
            <span className="h-2 w-3 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
            {s.label}{degrees ? `: ${degrees[key].toFixed(2)}` : ''}
          </span>
        ))}
      </div>
    </figure>
  );
}
