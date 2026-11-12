import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Gọi lại một lần khi phần tử cuộn vào màn hình
function useInView(threshold = 0.15) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (prefersReducedMotion() || !('IntersectionObserver' in window)) { setInView(true); return undefined; }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setInView(true); observer.disconnect(); }
    }, { threshold });
    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [threshold]);
  return [ref, inView];
}

// Hiện dần khi cuộn tới: from là hướng trượt vào (up, left, right, zoom)
export function Reveal({ as: Tag = 'div', from = 'up', delay = 0, className = '', children, ...props }) {
  const [ref, inView] = useInView();
  return (
    <Tag ref={ref} className={`reveal reveal-${from} ${inView ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }} {...props}>
      {children}
    </Tag>
  );
}

// Số chạy từ 0 tới giá trị thật khi cuộn tới, như bảng điểm
export function CountUp({ value, format = String, duration = 1100 }) {
  const [ref, inView] = useInView(0.5);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (!inView) return undefined;
    if (prefersReducedMotion()) { setShown(value); return undefined; }
    let frame;
    const start = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      setShown(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [inView, value, duration]);
  return <span ref={ref}>{format(shown)}</span>;
}

// Trình chiếu ảnh nền: mờ dần sang ảnh sau, ảnh hiện tại phóng chậm
export function ImageRotator({ images, interval = 5000, className = '' }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (images.length < 2 || prefersReducedMotion()) return undefined;
    const timer = setInterval(() => setIndex((i) => (i + 1) % images.length), interval);
    return () => clearInterval(timer);
  }, [images.length, interval]);
  return images.map((image, i) => (
    <img
      key={image.key}
      src={image.src}
      alt={i === index ? image.alt : ''}
      style={image.style}
      className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ${i === index ? 'hero-zoom opacity-100' : 'opacity-0'} ${className}`}
    />
  ));
}

// Quả bóng Pickleball có lỗ, vẽ bằng CSS
export const Ball = ({ className = '' }) => <span aria-hidden="true" className={`pickleball ${className}`} />;
