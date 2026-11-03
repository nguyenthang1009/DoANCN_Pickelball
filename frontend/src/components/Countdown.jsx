import { useEffect, useState } from 'react';

// Đồng hồ giữ chỗ: đếm ngược từ số giây server trả về (không phụ thuộc giờ máy khách)
export default function Countdown({ seconds, onEnd }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => { setLeft(seconds); }, [seconds]);
  useEffect(() => {
    if (left <= 0) { onEnd?.(); return undefined; }
    const t = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [left, onEnd]);
  const m = String(Math.floor(Math.max(left, 0) / 60)).padStart(2, '0');
  const s = String(Math.max(left, 0) % 60).padStart(2, '0');
  return (
    <span className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-amber-700">
      <span className="text-sm">Giữ chỗ còn</span>
      <span className="text-xl font-semibold">{m}:{s}</span>
    </span>
  );
}
