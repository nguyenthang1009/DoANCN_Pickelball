import { useEffect, useRef } from 'react';
import { Ball } from './motion';

// Các thành phần giao diện dùng chung, ánh xạ từ component trong file Figma "Court"

const BUTTON = {
  primary: 'bg-teal-700 text-white hover:bg-teal-800',
  secondary: 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50',
  ghost: 'text-slate-900 hover:bg-teal-50',
  danger: 'bg-red-700 text-white hover:bg-red-800',
};

export function Button({ kind = 'primary', className = '', loading, disabled, children, ...props }) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg px-5 py-2.5 font-semibold transition enabled:hover:-translate-y-px enabled:active:translate-y-0 enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON[kind]} ${className}`}
    >
      {loading ? 'Đang xử lý…' : children}
    </button>
  );
}

export function Input({ label, error, className = '', ...props }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-sm text-slate-600">{label}</span>}
      <input
        {...props}
        className={`h-11 rounded-lg border bg-white px-3 outline-none focus:border-2 focus:border-teal-700 ${error ? 'border-2 border-red-700' : 'border-slate-200'}`}
      />
      {error && <span className="text-xs font-medium text-red-700">{error}</span>}
    </label>
  );
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="text-sm text-slate-600">{label}</span>}
      <select {...props} className="h-11 rounded-lg border border-slate-200 bg-white px-3 outline-none focus:border-2 focus:border-teal-700">
        {children}
      </select>
    </label>
  );
}

export function Card({ className = '', children }) {
  return <div className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm ${className}`}>{children}</div>;
}

// Hộp thoại dùng thẻ dialog: tự giữ focus bên trong, phím Esc gọi onClose
export function Modal({ title, onClose, footer, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog ref={ref} onCancel={(e) => { e.preventDefault(); onClose(); }} className="confirm-dialog max-h-[90svh] max-w-2xl!">
      <div className="flex flex-col">
        <h2 className="border-b border-slate-200 px-6 py-4 text-xl font-semibold">{title}</h2>
        <div className="px-6 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">{footer}</div>}
      </div>
    </dialog>
  );
}

export function Alert({ kind = 'error', children }) {
  if (!children) return null;
  const tone = { error: 'bg-red-100 text-red-700', success: 'bg-green-100 text-green-700', info: 'bg-teal-50 text-teal-900' }[kind] ?? 'bg-amber-100 text-amber-700';
  return <div role="alert" className={`rounded-lg px-4 py-3 text-sm ${tone}`}>{children}</div>;
}

const TONES = {
  green: 'bg-green-100 text-green-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  slate: 'bg-slate-100 text-slate-600',
  teal: 'bg-teal-50 text-slate-900 ring-1 ring-teal-700',
};

export const Badge = ({ tone = 'slate', children }) => (
  <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}>{children}</span>
);

// Badge/Thanh toán và Badge/Check-in: ánh xạ trực tiếp từ giá trị trong CSDL
const PAYMENT = {
  PENDING_PAYMENT: ['amber', 'Chờ thanh toán'],
  PAID: ['green', 'Đã thanh toán'],
  EXPIRED: ['slate', 'Hết hạn giữ chỗ'],
  CANCELLED: ['slate', 'Đã hủy'],
  REFUND_PENDING: ['amber', 'Chờ hoàn tiền'],
  CONFLICT_REFUND_PENDING: ['red', 'Trùng lịch, chờ hoàn tiền'],
  REFUNDED: ['teal', 'Đã hoàn tiền'],
};
const CHECKIN = { PENDING: ['slate', 'Chưa nhận sân'], CHECKED_IN: ['green', 'Đã nhận sân'], NO_SHOW: ['red', 'Không đến'] };

export const PaymentBadge = ({ status }) => <Badge tone={PAYMENT[status]?.[0]}>{PAYMENT[status]?.[1] || status}</Badge>;
export const CheckinBadge = ({ status }) => <Badge tone={CHECKIN[status]?.[0]}>{CHECKIN[status]?.[1] || status}</Badge>;

export const Spinner = ({ label = 'Đang tải…' }) => (
  <div className="flex flex-col items-center gap-3 py-8 text-sm text-slate-600" role="status">
    <span className="ball-bounce"><Ball className="h-6 w-6" /></span>
    {label}
  </div>
);
