import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { api } from './api';
import { useAuth } from './auth';
import { Icon } from '../components/icons';
import { Button, Card, Spinner } from '../components/ui';

// Trạng thái ca trực của người đang đăng nhập. Đặt sân tại quầy, bán dịch vụ, check-in chỉ làm được khi đang trong ca;
// máy chủ luôn kiểm tra lại, ở đây chỉ để khóa giao diện sớm và báo rõ lý do.
const DutyContext = createContext({ ready: true, needsDuty: false, onDuty: true, status: null, refresh: () => {} });

const clock = (dt) => dt?.slice(11, 16) ?? '';

export function DutyProvider({ children }) {
  const { user, can } = useAuth();
  const needsDuty = (user?.dutyPermissions?.length ?? 0) > 0;
  const [status, setStatus] = useState(null);
  const refresh = useCallback(() => {
    if (!needsDuty || !can('attendance.self')) return Promise.resolve();
    return api('/shifts/me').then(setStatus).catch(() => setStatus((s) => s ?? { onDuty: false }));
  }, [needsDuty, can]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    window.addEventListener('pkb:duty-refresh', onFocus);
    return () => { clearInterval(timer); window.removeEventListener('focus', onFocus); window.removeEventListener('pkb:duty-refresh', onFocus); };
  }, [refresh]);

  // Hết giờ ca thì tự cập nhật ngay, không chờ lần kiểm tra kế tiếp
  useEffect(() => {
    if (!status?.dutyEndsAt) return undefined;
    const ms = Date.parse(`${status.dutyEndsAt.replace(' ', 'T')}+07:00`) - Date.now();
    if (ms <= 0 || ms > 24 * 3600e3) return undefined;
    const timer = setTimeout(refresh, ms + 1000);
    return () => clearTimeout(timer);
  }, [status?.dutyEndsAt, refresh]);

  const value = useMemo(() => ({
    ready: !needsDuty || status !== null, needsDuty, onDuty: !needsDuty || Boolean(status?.onDuty), status, refresh,
  }), [needsDuty, status, refresh]);
  return <DutyContext.Provider value={value}>{children}</DutyContext.Provider>;
}

export const useDuty = () => useContext(DutyContext);

// Dải báo ở đầu mọi trang nhân sự: đang trong ca tới mấy giờ, hoặc chưa vào ca nên các thao tác tại quầy đang khóa
export function DutyBar() {
  const { needsDuty, ready, onDuty, status } = useDuty();
  if (!needsDuty || !ready) return null;
  if (onDuty) {
    return (
      <div className="duty-bar duty-bar-on">
        <span className="duty-dot" />
        Đang trong ca {status?.open?.shiftName ? `· ${status.open.shiftName}` : ''} · kết thúc lúc {clock(status?.dutyEndsAt)}
      </div>
    );
  }
  return (
    <div className="duty-bar duty-bar-off">
      <Icon name="clock" className="h-4 w-4 shrink-0" />
      <span className="min-w-0">Bạn chưa vào ca trực. Đặt sân tại quầy, bán dịch vụ và check-in đang khóa.</span>
      <Link to="/cham-cong" className="duty-bar-link">Vào ca</Link>
    </div>
  );
}

// Bọc các trang thao tác tại quầy: chưa vào ca thì hiện hướng dẫn thay cho nội dung trang
export function DutyGate({ children }) {
  const { needsDuty, ready, onDuty, status } = useDuty();
  if (!needsDuty) return children;
  if (!ready) return <Spinner />;
  if (onDuty) return children;
  const next = status?.nextShift;
  return (
    <div className="mx-auto max-w-xl pt-6">
      <Card className="duty-gate text-center">
        <span className="duty-gate-icon"><Icon name="punch" className="h-8 w-8" /></span>
        <h1 className="mt-4 text-2xl font-black italic">Chưa vào ca trực</h1>
        <p className="mt-2 text-slate-600">Chức năng này chỉ dùng được trong ca trực đã được phân công, để mọi đơn và khoản thu đều gắn với đúng người, đúng ca.</p>
        <div className="mt-5 rounded-xl bg-slate-50 p-4 text-left text-sm">
          {next ? (
            <>
              <p className="font-semibold">Ca tới của bạn: {next.name}</p>
              <p className="text-slate-600">{next.starts_at.slice(8, 10)}/{next.starts_at.slice(5, 7)}, {clock(next.starts_at)}–{clock(next.ends_at)}. Được vào ca sớm tối đa {status?.earlyMinutes ?? 15} phút.</p>
            </>
          ) : (
            <p className="text-slate-600">Bạn chưa có ca nào sắp tới. Liên hệ quản lý cơ sở để được xếp ca.</p>
          )}
        </div>
        <Link to="/cham-cong"><Button className="mt-5 w-full">Đến trang Chấm công</Button></Link>
      </Card>
    </div>
  );
}
