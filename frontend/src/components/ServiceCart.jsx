import { vnd } from '../lib/format';

const GROUP = { DRINK: 'Nước uống', EQUIPMENT: 'Dụng cụ', OTHER: 'Khác' };

// Lưới ServiceTile để bấm thêm món + danh sách món trong giỏ (CartLine) có tăng/giảm số lượng.
// onChange nhận hàm cập nhật (setState) để bấm nhanh nhiều món liên tiếp không ghi đè nhau.
export default function ServiceCart({ services, cart, onChange }) {
  const add = (s) => onChange((c) => ({ ...c, [s.id]: (c[s.id] || 0) + 1 }));
  const dec = (id) => onChange((c) => { const next = { ...c, [id]: (c[id] || 0) - 1 }; if (next[id] <= 0) delete next[id]; return next; });
  const lines = services.filter((s) => cart[s.id]);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        {services.map((s) => (
          <button key={s.id} type="button" onClick={() => add(s)} className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-teal-700">
            <span className="text-xs text-slate-600">{GROUP[s.category]}</span>
            <span className="text-sm leading-tight">{s.name}</span>
            <span className="font-semibold">{vnd(s.unitPrice)} / {s.unit.toLowerCase()}</span>
          </button>
        ))}
      </div>
      {lines.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-2 text-sm">
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
