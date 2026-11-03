// Tiêu đề trang nội bộ + bộ chọn cơ sở (chỉ hiện với Admin)
export default function PageHeader({ title, subtitle, scope, allowAll = false, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-slate-600">{subtitle}</p>}
      </div>
      <div className="flex items-end gap-3">
        {children}
        {scope?.isAdmin && (
          <label className="flex flex-col gap-1">
            <span className="text-sm text-slate-600">Cơ sở</span>
            <select
              className="h-11 rounded-lg border border-slate-200 bg-white px-3"
              value={scope.venueId ?? ''}
              onChange={(e) => scope.setVenueId(e.target.value ? Number(e.target.value) : null)}
            >
              {allowAll && <option value="">Toàn chuỗi</option>}
              {scope.venues.map((v) => <option key={v.id} value={v.id}>{v.name}{v.isActive ? '' : ' (ngừng)'}</option>)}
            </select>
          </label>
        )}
      </div>
    </div>
  );
}
