import { useEffect } from 'react';
import { io } from 'socket.io-client';

let socket = null;
const getSocket = () => { socket ??= io({ transports: ['websocket', 'polling'] }); return socket; };

// Theo dõi ma trận của một cơ sở + một ngày: server báo khi có ô đổi trạng thái để tải lại (không cần F5)
export function useSlotsWatch(venueId, date, onChange) {
  useEffect(() => {
    if (!venueId || !date) return undefined;
    const s = getSocket();
    const watch = () => s.emit('watch', { venueId, date });
    watch();
    s.on('connect', watch);
    s.on('slots:changed', onChange);
    return () => { s.off('connect', watch); s.off('slots:changed', onChange); };
  }, [venueId, date, onChange]);
}

// Theo dõi đèn của một cơ sở: kết quả điều khiển đổi, hoặc có người trên sân khi không có đơn
export function useLightingWatch(venueId, onChange, onAlert) {
  useEffect(() => {
    if (!venueId) return undefined;
    const s = getSocket();
    const watch = () => s.emit('watch-lighting', venueId);
    watch();
    s.on('connect', watch);
    if (onChange) s.on('lighting:changed', onChange);
    if (onAlert) s.on('lighting:alert', onAlert);
    return () => {
      s.emit('unwatch-lighting', venueId);
      s.off('connect', watch);
      if (onChange) s.off('lighting:changed', onChange);
      if (onAlert) s.off('lighting:alert', onAlert);
    };
  }, [venueId, onChange, onAlert]);
}

// Theo dõi một đơn: trang thanh toán tự chuyển sang vé khi webhook xác nhận
export function useBookingWatch(code, onChange) {
  useEffect(() => {
    if (!code) return undefined;
    const s = getSocket();
    const event = `booking:${code}`;
    const watch = () => s.emit('watch-booking', code);
    watch();
    s.on('connect', watch);
    s.on(event, onChange);
    return () => { s.emit('unwatch-booking', code); s.off('connect', watch); s.off(event, onChange); };
  }, [code, onChange]);
}
