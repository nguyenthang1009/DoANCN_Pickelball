// Biểu tượng nét mảnh dùng cho menu và thẻ số liệu
const PATHS = {
  pos: 'M3 5h18v11H3zM8 20h8M12 16v4M7 9h4M7 12h2',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2',
  cart: 'M3 4h2l2.5 11h10L20 7H6M9 20h.01M16 20h.01',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
  invoice: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  court: 'M3 5h18v14H3zM12 5v14M3 12h18M7.5 5v14M16.5 5v14',
  drink: 'M8 3h8l-1 18H9zM8.5 9h7',
  refund: 'M4 9h12a4 4 0 0 1 0 8H8M4 9l4-4M4 9l4 4',
  venue: 'M4 21V9l8-6 8 6v12M9 21v-7h6v7',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  finance: 'M3 3v18h18M7 15l4-4 3 3 6-7',
  salary: 'M3 7h18v12H3zM3 11h18M7 15h4',
  scale: 'M12 3v18M7 21h10M5 7h14M5 7l-3 7h6zM19 7l-3 7h6z',
  image: 'M3 5h18v14H3zM8.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 16l-5-5-9 8',
  ticket: 'M3 8V6h18v2a3 3 0 0 0 0 6v4H3v-4a3 3 0 0 0 0-6z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'M6 6l12 12M18 6L6 18',
  logout: 'M9 21H5V3h4M16 17l5-5-5-5M21 12H9',
  globe: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  wallet: 'M3 7h18v13H3zM3 7l13-4v4M17 14h.01',
  tax: 'M6 3h12v18H6zM9 8l6 8M9.5 8.5h.01M14.5 15.5h.01',
  check: 'M4 12.5l5 5L20 6.5',
  calendar: 'M3 5h18v16H3zM3 10h18M8 3v4M16 3v4M8 14h2M14 14h2M8 17h2',
  history: 'M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 8v4l3 2',
  punch: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8 12.5l3 3 5-6',
  bulb: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z',
};

export const Icon = ({ name, className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d={PATHS[name]} />
  </svg>
);
