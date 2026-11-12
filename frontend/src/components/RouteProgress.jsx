import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router';
import { Ball } from './motion';

// Thanh tiến độ trên cùng: chạy khi chuyển trang và khi đang chờ API, chỉ hiện nếu chờ đủ lâu để khỏi nháy
export function RouteProgress() {
  const { pathname } = useLocation();
  const [state, setState] = useState('idle');
  const pending = useRef(0);
  const timer = useRef(null);

  useEffect(() => {
    const finish = () => {
      clearTimeout(timer.current);
      setState((s) => (s === 'loading' ? 'done' : s));
      timer.current = setTimeout(() => setState('idle'), 350);
    };
    const onChange = (e) => {
      pending.current = Math.max(0, pending.current + e.detail);
      if (pending.current > 0) {
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setState('loading'), 120);
      } else finish();
    };
    window.addEventListener('pkb:loading', onChange);
    return () => window.removeEventListener('pkb:loading', onChange);
  }, []);

  useEffect(() => {
    setState('loading');
    const t = setTimeout(() => { if (!pending.current) setState('done'); }, 450);
    const end = setTimeout(() => { if (!pending.current) setState('idle'); }, 800);
    return () => { clearTimeout(t); clearTimeout(end); };
  }, [pathname]);

  if (state === 'idle') return null;
  return <div className={`route-bar ${state === 'done' ? 'route-bar-done' : ''}`} role="progressbar" aria-label="Đang tải" />;
}

// Màn chờ khi tải mã của một trang lớn
export const PageLoader = () => (
  <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 text-sm font-semibold text-slate-600" role="status">
    <span className="ball-bounce"><Ball className="h-9 w-9" /></span>
    Đang vào sân…
  </div>
);
