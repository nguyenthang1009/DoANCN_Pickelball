import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const FeedbackContext = createContext(null);
const DURATION = { success: 4000, info: 4500, warning: 6000, error: 7000 };
const MAX_TOASTS = 4;

const ICON_PATH = {
  success: 'M4 12.5l5 5L20 6.5',
  error: 'M6 6l12 12M18 6L6 18',
  warning: 'M12 4l9 16H3zM12 10v4M12 17.5v.5',
  info: 'M12 8v.5M12 11.5V17',
};
const TOAST_TONE = {
  success: { bar: 'bg-lime-300', icon: 'bg-lime-300 text-slate-900' },
  error: { bar: 'bg-red-500', icon: 'bg-red-500 text-white' },
  warning: { bar: 'bg-amber-400', icon: 'bg-amber-400 text-slate-900' },
  info: { bar: 'bg-teal-400', icon: 'bg-teal-500 text-white' },
};
const CONFIRM_TONE = {
  primary: { icon: 'bg-teal-700 text-white', path: ICON_PATH.success, stripe: 'from-teal-700 to-lime-300', button: 'bg-teal-700 text-white hover:bg-teal-800' },
  warning: { icon: 'bg-amber-400 text-slate-900', path: ICON_PATH.warning, stripe: 'from-amber-400 to-lime-300', button: 'bg-slate-900 text-white hover:bg-slate-700' },
  danger: { icon: 'bg-red-700 text-white', path: ICON_PATH.warning, stripe: 'from-red-700 to-amber-400', button: 'bg-red-700 text-white hover:bg-red-800' },
};

const Icon = ({ path, className = '' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true"><path d={path} /></svg>
);

// Toast nằm ở top layer (popover) để không bị che bởi nền mờ của hộp thoại đang mở
function ToastStack({ toasts, onDismiss }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    if (el.matches(':popover-open')) el.hidePopover();
    if (toasts.length) el.showPopover();
  }, [toasts.length]);

  return (
    <div ref={ref} popover="manual" className="toast-stack" aria-live="polite">
      {toasts.map((t) => {
        const tone = TOAST_TONE[t.kind];
        return (
          <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'} className="toast-card">
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${tone.icon}`}><Icon path={ICON_PATH[t.kind]} className="h-4 w-4" /></span>
            <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-white">{t.message}</p>
            <button type="button" aria-label="Đóng thông báo" onClick={() => onDismiss(t.id)} className="text-slate-400 transition hover:text-white"><Icon path={ICON_PATH.error} className="h-4 w-4" /></button>
            <span className={`toast-progress ${tone.bar}`} style={{ animationDuration: `${DURATION[t.kind]}ms` }} />
          </div>
        );
      })}
    </div>
  );
}

function ConfirmDialog({ request, onClose }) {
  const { title, message, details = [], tone = 'primary', confirmText = 'Xác nhận', cancelText = 'Để sau', input } = request;
  const ref = useRef(null);
  const cancelRef = useRef(null);
  const [value, setValue] = useState(input?.defaultValue ?? '');
  const style = CONFIRM_TONE[tone];
  const error = input?.validate && String(value).trim() ? input.validate(String(value).trim()) : '';
  const missing = input && input.required !== false && !String(value).trim();

  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    // Thao tác nguy hiểm: focus vào nút hủy để bấm Enter nhầm không gây hậu quả
    if (tone === 'danger' && !input) cancelRef.current?.focus();
    return () => dialog.close();
  }, [tone, input]);

  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="confirm-title"
      onCancel={(e) => { e.preventDefault(); onClose(false); }}
      onClick={(e) => { if (e.target === ref.current) onClose(false); }}
    >
      <form method="dialog" onSubmit={(e) => { e.preventDefault(); if (!missing && !error) onClose(input ? String(value).trim() : true); }}>
        <span className={`block h-1.5 bg-gradient-to-r ${style.stripe}`} />
        <div className="flex gap-4 p-6">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${style.icon}`}><Icon path={style.path} className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <h2 id="confirm-title" className="text-lg font-bold leading-6">{title}</h2>
            {message && <p className="mt-1 text-sm text-slate-600">{message}</p>}
            {details.length > 0 && (
              <dl className="mt-3 divide-y divide-slate-200 rounded-lg bg-slate-50 px-3 text-sm">
                {details.map(([k, v]) => <div key={k} className="flex justify-between gap-4 py-2"><dt className="text-slate-600">{k}</dt><dd className="text-right font-semibold">{v}</dd></div>)}
              </dl>
            )}
            {input && (
              <label className="mt-3 flex flex-col gap-1">
                <span className="text-sm text-slate-600">{input.label}</span>
                <input
                  autoFocus
                  type={input.type || 'text'}
                  inputMode={input.inputMode}
                  placeholder={input.placeholder}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  className={`h-11 rounded-lg border bg-white px-3 outline-none focus:border-2 focus:border-teal-700 ${error ? 'border-2 border-red-700' : 'border-slate-200'}`}
                />
                {error && <span className="text-xs font-medium text-red-700">{error}</span>}
              </label>
            )}
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-3">
          <button ref={cancelRef} type="button" onClick={() => onClose(false)} className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200">{cancelText}</button>
          <button type="submit" disabled={missing || Boolean(error)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 ${style.button}`}>{confirmText}</button>
        </div>
      </form>
    </dialog>
  );
}

// notify.success/error/warning/info(message): thông báo nhỏ tự ẩn sau vài giây.
// confirm({ title, message, details, tone, confirmText, input }): hộp xác nhận, trả về false nếu hủy,
// true nếu đồng ý, hoặc chuỗi người dùng nhập khi có input.
export function FeedbackProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [request, setRequest] = useState(null);
  const nextId = useRef(0);

  const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((kind, message) => {
    const id = ++nextId.current;
    setToasts((list) => [...list.slice(-(MAX_TOASTS - 1)), { id, kind, message }]);
    setTimeout(() => dismiss(id), DURATION[kind]);
  }, [dismiss]);

  const notify = useMemo(() => ({
    success: (m) => push('success', m), error: (m) => push('error', m), warning: (m) => push('warning', m), info: (m) => push('info', m),
  }), [push]);
  const confirm = useCallback((options) => new Promise((resolve) => setRequest({ ...options, resolve })), []);
  const close = useCallback((result) => setRequest((r) => { r?.resolve(result); return null; }), []);

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);
  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {request && <ConfirmDialog key={request.title} request={request} onClose={close} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
    </FeedbackContext.Provider>
  );
}

export const useFeedback = () => useContext(FeedbackContext);
