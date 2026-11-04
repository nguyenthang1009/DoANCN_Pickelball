import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { Ball } from './motion';

const INTERVAL_MS = 6000;

const Cta = ({ slide }) => {
  const className = 'inline-flex items-center gap-2 rounded-lg bg-lime-300 px-6 py-3 font-semibold text-slate-900 transition hover:bg-lime-200';
  return slide.to.startsWith('#')
    ? <a href={slide.to} className={className}>{slide.cta}</a>
    : <Link to={slide.to} className={className}>{slide.cta}</Link>;
};

const Arrow = ({ label, onClick, path }) => (
  <button type="button" aria-label={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 text-white transition hover:bg-white/15">
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path} /></svg>
  </button>
);

// Slider quảng bá ở đầu trang chủ: tự chuyển ảnh, dừng khi rê chuột hoặc khi người dùng bấm tạm dừng.
// Người dùng bật "giảm chuyển động" trong hệ điều hành thì không tự chạy.
export default function HeroSlider({ slides }) {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [hovering, setHovering] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (!playing || hovering) return undefined;
    const timer = setTimeout(() => setIndex((i) => (i + 1) % count), INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [playing, hovering, index, count]);

  const slide = slides[index];
  return (
    <section
      aria-roledescription="carousel"
      aria-label="Giới thiệu sân Pickleball"
      className="relative h-[82svh] min-h-[540px] max-h-[760px] overflow-hidden bg-slate-900"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
      onFocus={() => setHovering(true)}
      onBlur={() => setHovering(false)}
    >
      {slides.map((s, i) => (
        <img
          key={s.key}
          src={s.src}
          alt={i === index ? s.alt : ''}
          style={s.style}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === index ? 'hero-zoom opacity-100' : 'opacity-0'}`}
        />
      ))}
      <div className="absolute inset-0 bg-gradient-to-r from-slate-950/90 via-slate-950/60 to-slate-950/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
      <span className="serve-arc" aria-hidden="true"><Ball className="serve-ball h-7 w-7" /></span>

      <div className="relative mx-auto flex h-full max-w-7xl flex-col justify-center px-4 pb-24 lg:px-8">
        <div key={index} className="hero-rise max-w-2xl text-white">
          <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-lime-300">{slide.eyebrow}</p>
          <h1 className="sport-title text-4xl leading-tight sm:text-5xl lg:text-6xl">{slide.title}</h1>
          <p className="mt-4 max-w-xl text-lg text-slate-100">{slide.text}</p>
          <div className="mt-8"><Cta slide={slide} /></div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-20 sm:bottom-24">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 lg:px-8">
          <Arrow label="Ảnh trước" onClick={() => setIndex((i) => (i - 1 + count) % count)} path="M15 6l-6 6 6 6" />
          <Arrow label="Ảnh sau" onClick={() => setIndex((i) => (i + 1) % count)} path="M9 6l6 6-6 6" />
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Tạm dừng tự chuyển ảnh' : 'Tiếp tục tự chuyển ảnh'} className="flex h-10 w-10 items-center justify-center rounded-full border border-white/40 text-white transition hover:bg-white/15">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={playing ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5l11 7-11 7z'} /></svg>
          </button>
          <div className="ml-2 flex items-center gap-2">
            {slides.map((s, i) => (
              <button key={s.key} type="button" aria-label={`Ảnh ${i + 1}: ${s.title}`} aria-current={i === index} onClick={() => setIndex(i)} className="flex h-6 items-center">
                <span className={`block h-1.5 rounded-full transition-all ${i === index ? 'w-8 bg-lime-300' : 'w-4 bg-white/50 hover:bg-white'}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
