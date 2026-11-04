import { Ball } from './motion';

// Tiêu đề trang nội bộ + bộ chọn cơ sở (chỉ hiện với Admin)
export default function PageHeader({ title, subtitle, scope, allowAll = false, children }) {
  return (
    <header className="page-hero mb-6 flex flex-wrap items-end justify-between gap-4">
      <Ball className="page-hero-ball h-5 w-5" />
      <div className="relative">
        <h1 className="sport-title text-2xl text-white lg:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-teal-50">{subtitle}</p>}
      </div>
      <div className="page-hero-controls relative flex flex-wrap items-end gap-3">
        {children}
        {scope?.isAdmin && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Cơ sở</span>
            <select
              className="h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900"
              value={scope.venueId ?? ''}
              onChange={(e) => scope.setVenueId(e.target.value ? Number(e.target.value) : null)}
            >
              {allowAll && <option value="">Toàn chuỗi</option>}
              {scope.venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.isActive ? '' : ' (ngừng)'}</option>)}
            </select>
          </label>
        )}
      </div>
    </header>
  );
}
