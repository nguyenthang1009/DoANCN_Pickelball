import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import { SITE_MEDIA } from './siteMedia';

const SiteContext = createContext(null);

// Nội dung do Admin quản lý. Backend lỗi thì website vẫn chạy bằng ảnh mặc định.
export function SiteProvider({ children }) {
  const [content, setContent] = useState({ media: {}, settings: {} });
  const refresh = useCallback(() => api('/site/content').then(setContent).catch(() => {}), []);
  useEffect(() => { refresh(); }, [refresh]);

  // media('hero.1') -> { src, alt, style }: style giữ điểm lấy nét khi ảnh bị cắt theo khổ màn hình
  const media = useCallback((key) => {
    const base = SITE_MEDIA[key];
    const custom = content.media[key];
    const focusX = custom?.focusX ?? base.focusX;
    const focusY = custom?.focusY ?? base.focusY;
    return { key, src: custom?.url || base.src, alt: custom?.alt || base.alt, focusX, focusY, style: { objectPosition: `${focusX}% ${focusY}%` } };
  }, [content.media]);

  const value = useMemo(() => ({ media, settings: content.settings, refresh }), [media, content.settings, refresh]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export const useSite = () => useContext(SiteContext);
