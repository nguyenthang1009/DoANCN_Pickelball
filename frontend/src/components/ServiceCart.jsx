import { vnd } from '../lib/format';
import { Icon } from './icons';

const GROUP = { DRINK: 'Nước uống', EQUIPMENT: 'Dụng cụ', OTHER: 'Khác' };
const FALLBACK = { DRINK: ['drink', 'from-sky-100 to-teal-100 text-teal-700'], EQUIPMENT: ['court', 'from-lime-100 to-emerald-100 text-emerald-700'], OTHER: ['cart', 'from-slate-100 to-slate-200 text-slate-600'] };

// Ảnh món; chưa có ảnh thì hiện ô màu theo nhóm để vẫn phân biệt được nước uống và dụng cụ
export function ServiceThumb({ item, className = 'h-12 w-12' }) {
  if (item.imageUrl) return <img src={item.imageUrl} alt={item.name} loading="lazy" className={`${className} rounded-lg object-cover`} />;
  const [icon, tone] = FALLBACK[item.category] ?? FALLBACK.OTHER;
  return <span className={`${className} flex items-center justify-center rounded-lg bg-gradient-to-br ${tone}`} aria-hidden="true"><Icon name={icon} className="h-1/2 w-1/2" /></span>;
}

// Lưới thẻ món có ảnh để bấm thêm vào giỏ + danh sách món trong giỏ có tăng/giảm số lượng.
// onChange nhận hàm cập nhật (setState) để bấm nhanh nhiều món liên tiếp không ghi đè nhau.
export default function ServiceCart({ services, cart, onChange }) {
  const add = (s) => onChange((c) => ({ ...c, [s.id]: (c[s.id] || 0) + 1 }));
  const dec = (id) => onChange((c) => { const next = { ...c, [id]: (c[id] || 0) - 1 }; if (next[id] <= 0) delete next[id]; return next; });
  const lines = services.filter((s) => cart[s.id]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {services.map((s) => (
          <button key={s.id} type="button" onClick={() => add(s)} className={`service-tile ${cart[s.id] ? 'service-tile-active' : ''}`}>
            <span className="relative block">
              <ServiceThumb item={s} className="aspect-[4/3] w-full" />
              {cart[s.id] > 0 && <span className="service-tile-count">{cart[s.id]}</span>}
            </span>
            <span className="mt-2 block text-xs text-slate-600">{GROUP[s.category]}</span>
            <span className="block text-sm font-medium leading-tight">{s.name}</span>
            <span className="mt-1 block font-semibold text-teal-800">{vnd(s.unitPrice)}<span className="text-xs font-normal text-slate-600"> / {s.unit.toLowerCase()}</span></span>
          </button>
        ))}
      </div>
      {lines.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
          <ServiceThumb item={s} className="h-9 w-9" />
          <span className="flex-1">{s.name}</span>
          <span className="flex items-center gap-2">
            <button type="button" aria-label={`Bớt ${s.name}`} onClick={() => dec(s.id)} className="h-7 w-7 rounded border border-slate-200">−</button>
            <span className="w-5 text-center">{cart[s.id]}</span>
            <button type="button" aria-label={`Thêm ${s.name}`} onClick={() => add(s)} className="h-7 w-7 rounded border border-slate-200">+</button>
          </span>
          <span className="w-20 text-right">{vnd(cart[s.id] * s.unitPrice)}</span>
        </div>
      ))}
    </div>
  );
}

export const cartTotal = (services, cart) => services.reduce((sum, s) => sum + (cart[s.id] || 0) * s.unitPrice, 0);
export const cartItems = (cart) => Object.entries(cart).map(([serviceId, quantity]) => ({ serviceId: Number(serviceId), quantity }));
