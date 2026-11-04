import { Link } from 'react-router';
import { Ball, ImageRotator } from './motion';

// Khung trang đăng nhập, đăng ký, đổi mật khẩu: nửa trái là ảnh chuyển động, nửa phải là biểu mẫu
export default function AuthShell({ images, eyebrow, title, points = [], children }) {
  return (
    <div className="grid min-h-svh grid-rows-[auto_1fr] bg-white lg:grid-cols-[1.15fr_1fr] lg:grid-rows-1">
      <section className="relative flex h-56 flex-col justify-end overflow-hidden bg-slate-900 p-6 text-white lg:h-auto lg:p-14">
        <ImageRotator images={images} interval={5500} />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/35 to-slate-950/30" />
        <Link to="/" className="absolute left-6 top-5 z-10 flex items-center gap-2 font-semibold lg:left-14 lg:top-10 lg:text-xl">
          <Ball className="h-6 w-6" />Pickleball Booking
        </Link>
        <div className="relative hero-rise">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-lime-300">{eyebrow}</p>
          <h1 className="sport-title max-w-xl text-2xl leading-tight lg:text-5xl">{title}</h1>
          <ul className="mt-6 hidden flex-col gap-3 lg:flex">
            {points.map((point, i) => (
              <li key={point} className="hero-rise flex items-center gap-3" style={{ animationDelay: `${150 * (i + 1)}ms` }}>
                <span className="h-0.5 w-6 bg-lime-300" />{point}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="flex items-start justify-center p-6 lg:items-center lg:p-12">
        <div className="page-enter w-full max-w-md">{children}</div>
      </section>
    </div>
  );
}
