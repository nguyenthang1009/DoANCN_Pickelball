import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api } from '../../lib/api';
import { useSite } from '../../lib/site';
import { addDays, dayMonth, todayVN, vnd, weekdayShort } from '../../lib/format';
import HeroSlider from '../../components/HeroSlider';
import { Ball, CountUp, Reveal } from '../../components/motion';
import { Button, Select } from '../../components/ui';

const SLIDES = [
  { key: 'hero.1', eyebrow: 'Đặt sân trực tuyến', title: 'Đặt sân trong chưa đầy 2 phút', text: 'Xem lịch trống, giữ chỗ và thanh toán VietQR ngay trên điện thoại, không cần cài ứng dụng.', cta: 'Đặt sân ngay', to: '/dat-san' },
  { key: 'hero.2', eyebrow: 'Sân ngoài trời', title: 'Trời xanh, gió mát, ra sân thôi', text: 'Chọn sân ngoài trời cho buổi sáng đầy năng lượng hoặc sân trong nhà khi trời nắng gắt.', cta: 'Xem sân ngoài trời', to: '/dat-san?type=OUTDOOR' },
  { key: 'hero.3', eyebrow: 'Rủ bạn cùng chơi', title: 'Một cú chạm vợt, một hội bạn mới', text: 'Pickleball vui nhất khi đánh đôi. Rủ bạn thân, đồng nghiệp hoặc cả nhà cùng ra sân.', cta: 'Pickleball là gì?', to: '#gioi-thieu' },
  { key: 'hero.4', eyebrow: 'Lịch sân trực tiếp', title: 'Thấy sân trống là giữ được ngay', text: 'Lịch cập nhật theo thời gian thực, không phải gọi điện hỏi, không lo trùng giờ với người khác.', cta: 'Xem lịch sân', to: '/dat-san' },
  { key: 'hero.5', eyebrow: 'Dịch vụ tại sân', title: 'Chưa có vợt? Cứ đến sân', text: 'Thuê vợt, mua bóng và nước uống ngay tại quầy lễ tân của từng cơ sở.', cta: 'Xem dịch vụ', to: '#dich-vu' },
];

const COMMUNITY = [
  { key: 'community.1', caption: 'Đam mê', span: 'row-span-2' },
  { key: 'community.2', caption: 'Bạn đồng hành', span: '' },
  { key: 'community.3', caption: 'Bứt phá', span: '' },
  { key: 'community.4', caption: 'Tự tin', span: '' },
  { key: 'community.5', caption: 'Tập trung', span: '' },
];

const FACTS = [
  ['Dễ bắt đầu', 'Kết hợp tennis, cầu lông và bóng bàn. Người mới vài phút là đánh được những pha đầu tiên.'],
  ['Sân nhỏ, ít chạy', 'Sân bằng khoảng một phần ba sân tennis, hợp để vận động nhẹ mà vẫn đổ mồ hôi.'],
  ['Vui theo nhóm', 'Thường chơi đánh đôi, ván đến 11 điểm nên nhóm bạn dễ xoay vòng cùng chơi.'],
];

const SERVICES = [
  ['Thuê vợt', 'Có sẵn vợt cho người mới và khách quên mang vợt.'],
  ['Bóng thi đấu', 'Mua bóng ngay tại quầy khi cần thay bóng mới.'],
  ['Nước uống', 'Nước suối, nước điện giải cho giờ nghỉ giữa trận.'],
];

// Sơ đồ sân Pickleball: đường biên, lưới, vùng cấm vô-lê và đường giữa sân; các nét tự vẽ khi cuộn tới
const CourtArt = ({ className = '' }) => (
  <svg viewBox="0 0 440 200" className={`court-art ${className}`} fill="none" stroke="currentColor" strokeWidth="3" aria-hidden="true">
    <rect x="2" y="2" width="436" height="196" pathLength="1" />
    <path d="M150 2v196M290 2v196M2 100h148M290 100h148" pathLength="1" />
    <path d="M220 0v200" strokeWidth="6" pathLength="1" />
  </svg>
);

const Section = ({ id, eyebrow, title, dark = false, className = '', children }) => (
  <section id={id} className={`py-16 lg:py-24 ${className}`}>
    <div className="mx-auto max-w-7xl px-4 lg:px-8">
      <Reveal className="mb-10 max-w-2xl">
        <p className={`mb-2 text-sm font-semibold uppercase tracking-widest ${dark ? 'text-lime-300' : 'text-teal-700'}`}>{eyebrow}</p>
        <h2 className="sport-title text-3xl leading-tight lg:text-4xl">{title}</h2>
      </Reveal>
      {children}
    </div>
  </section>
);

const Marquee = ({ images, reverse = false }) => (
  <div className="marquee overflow-hidden" role="group" aria-label="Hình ảnh Pickleball">
    <div className={`marquee-track flex gap-3 ${reverse ? 'marquee-reverse' : ''}`}>
      {[...images, ...images].map((image, i) => (
        <img key={i} src={image.src} style={image.style} alt={i < images.length ? image.alt : ''} loading="lazy" className="h-40 w-60 rounded-lg object-cover lg:h-56 lg:w-80" />
      ))}
    </div>
  </div>
);

const Score = ({ label, value, format }) => (
  <div className="flex-1 px-4 py-5 text-center sm:px-8">
    <p className="text-4xl font-black italic text-lime-300 lg:text-5xl">{value === null ? '–' : <CountUp value={value} format={format} />}</p>
    <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-slate-300">{label}</p>
  </div>
);

// Tóm tắt lịch hôm nay của một cơ sở: số sân theo loại, số ô còn trống, giá theo giờ thấp nhất
function summarize(availability) {
  const slots = availability.courts.flatMap((c) => c.slots);
  const prices = slots.map((s) => s.price).filter(Boolean);
  return {
    courtCount: availability.courts.filter((c) => c.status === 'ACTIVE').length,
    indoor: availability.courts.filter((c) => c.courtType === 'INDOOR').length,
    outdoor: availability.courts.filter((c) => c.courtType === 'OUTDOOR').length,
    freeSlots: slots.filter((s) => s.state === 'FREE').length,
    fromPrice: prices.length ? Math.min(...prices) * 2 : null,
  };
}

// Trang chủ giới thiệu: mọi số liệu (cơ sở, giá, ô trống, giới hạn đặt sân) đọc từ API, không viết cứng
export default function Landing() {
  const navigate = useNavigate();
  const { media, settings } = useSite();
  const today = todayVN();
  const [venues, setVenues] = useState([]);
  const [limits, setLimits] = useState(null);
  const [venueId, setVenueId] = useState('');
  const [date, setDate] = useState(today);

  useEffect(() => {
    let active = true;
    api('/venues').then(async ({ venues: list }) => {
      const results = await Promise.allSettled(list.map((v) => api(`/venues/${v.id}/availability?date=${today}`)));
      if (!active) return;
      setVenues(list.map((v, i) => ({ ...v, today: results[i].status === 'fulfilled' ? summarize(results[i].value) : null })));
      setLimits(results.find((r) => r.status === 'fulfilled')?.value.limits ?? null);
      setVenueId((id) => id || list[0]?.id || '');
    }).catch(() => {});
    return () => { active = false; };
  }, [today]);

  const dates = useMemo(() => Array.from({ length: limits?.maxAdvanceDays ?? 14 }, (_, i) => addDays(today, i)), [limits, today]);
  const total = (key) => (venues.length ? venues.reduce((sum, v) => sum + (v.today?.[key] ?? 0), 0) : null);

  const features = [
    ['Lịch trống trực tiếp', 'Ô nào vừa có người giữ sẽ đổi trạng thái ngay trên màn hình của bạn.'],
    [limits ? `Giữ chỗ ${limits.holdMinutes} phút` : 'Giữ chỗ trước khi trả tiền', 'Chọn được giờ đẹp là giữ ngay, có thời gian để chuyển khoản mà không sợ mất sân.'],
    ['Thanh toán VietQR', 'Quét mã bằng ứng dụng ngân hàng, hệ thống tự xác nhận khi tiền về.'],
    ['Vé QR trên điện thoại', 'Đến sân đưa mã QR cho lễ tân, không cần in vé hay đọc lại thông tin.'],
  ];
  const steps = [
    ['Chọn cơ sở và ngày', limits ? `Xem lịch trước tối đa ${limits.maxAdvanceDays} ngày, giá hiện ngay trên từng ô.` : 'Giá hiện ngay trên từng ô lịch.'],
    ['Chọn giờ, giữ chỗ', limits ? `Đặt từ ${limits.minMinutes} đến ${limits.maxMinutes} phút liên tục trên một sân.` : 'Chọn các ô liền nhau trên một sân.'],
    ['Quét VietQR', 'Thanh toán xong, trang tự chuyển sang vé điện tử.'],
    ['Đến sân và chơi', 'Đưa mã QR cho lễ tân rồi vào sân.'],
  ];
  const faqs = [
    ['Xem lịch sân có cần tài khoản không?', 'Không. Ai cũng xem được lịch và giá. Bạn chỉ cần đăng nhập ở bước giữ chỗ để hệ thống gửi vé đúng tài khoản.'],
    ['Giữ chỗ rồi mà chưa thanh toán thì sao?', limits ? `Ô được giữ cho bạn trong ${limits.holdMinutes} phút. Hết thời gian mà chưa thanh toán, ô tự mở lại cho người khác.` : 'Ô được giữ trong một khoảng thời gian ngắn, hết hạn sẽ tự mở lại cho người khác.'],
    ['Tôi có thể hủy đơn không?', limits ? `Đơn đã thanh toán được hủy online nếu còn ít nhất ${limits.cancelDeadlineHours} giờ trước giờ chơi. Quản lý cơ sở sẽ xử lý hoàn tiền cho bạn.` : 'Đơn đã thanh toán được hủy online trong thời hạn quy định trước giờ chơi.'],
    ['Có đặt trực tiếp tại quầy được không?', 'Được. Lễ tân đặt sân, nhận tiền mặt hoặc VietQR và bán kèm dịch vụ ngay tại quầy.'],
  ];

  return (
    <>
      <HeroSlider slides={SLIDES.map((s) => ({ ...s, ...media(s.key) }))} />

      <div className="relative z-10 -mt-14 px-4 lg:px-8">
        <form
          className="page-enter mx-auto grid max-w-5xl gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xl sm:grid-cols-[1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => { e.preventDefault(); navigate(`/dat-san?${new URLSearchParams(venueId ? { venue: venueId, date } : { date })}`); }}
        >
          <Select label="Cơ sở" value={venueId} onChange={(e) => setVenueId(Number(e.target.value))}>
            {venues.length === 0 && <option value="">Đang tải cơ sở…</option>}
            {venues.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </Select>
          <Select label="Ngày chơi" value={date} onChange={(e) => setDate(e.target.value)}>
            {dates.map((d) => <option key={d} value={d}>{d === today ? 'Hôm nay' : weekdayShort(d)}, {dayMonth(d)}</option>)}
          </Select>
          <Button type="submit" className="h-11">Xem giờ trống</Button>
        </form>
      </div>

      <Section id="vi-sao" eyebrow="Vì sao đặt ở đây" title="Từ lúc chọn giờ đến lúc vào sân, mọi thứ đều rõ ràng">
        <div className="grid gap-px overflow-hidden rounded-xl border border-slate-200 bg-slate-200 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(([title, text], i) => (
            <Reveal key={title} delay={i * 90} className="group bg-white p-6 transition-colors hover:bg-teal-700">
              <p className="mb-6 text-sm font-black italic text-teal-700 group-hover:text-lime-300">0{i + 1}</p>
              <h3 className="text-xl font-semibold group-hover:text-white">{title}</h3>
              <p className="mt-2 text-slate-600 group-hover:text-teal-50">{text}</p>
            </Reveal>
          ))}
        </div>
      </Section>

      <section className="slash-band bg-slate-900">
        <div className="mx-auto flex max-w-5xl flex-wrap divide-x divide-white/10 px-4 py-6">
          <Score label="Cơ sở" value={venues.length ? venues.length : null} />
          <Score label="Sân đang mở" value={total('courtCount')} />
          <Score label="Sân ngoài trời" value={total('outdoor')} />
          <Score label="Phút giữ chỗ" value={limits?.holdMinutes ?? null} />
        </div>
      </section>

      <Section id="loai-san" eyebrow="Không gian chơi" title="Trong nhà hay ngoài trời, bạn chọn">
        <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
          <Reveal from="left">
            <Link to="/dat-san?type=OUTDOOR" className="group relative block h-80 overflow-hidden rounded-xl lg:h-[28rem]">
              <img src={media('section.outdoor').src} style={media('section.outdoor').style} alt={media('section.outdoor').alt} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent" />
              <div className="absolute bottom-0 p-6 text-white">
                <h3 className="sport-title text-2xl lg:text-3xl">Sân ngoài trời</h3>
                <p className="mt-1 text-slate-100">Nắng sớm, gió mát, không gian thoáng cho những trận đấu sôi động.{total('outdoor') ? ` Hiện có ${total('outdoor')} sân.` : ''}</p>
                <span className="mt-3 inline-block font-semibold text-lime-300 transition-transform group-hover:translate-x-1">Xem giờ trống →</span>
              </div>
            </Link>
          </Reveal>
          <div className="grid gap-4">
            <Reveal from="right">
              <Link to="/dat-san?type=OUTDOOR" className="group relative block h-52 overflow-hidden rounded-xl">
                <img src={media('section.outdoor-2').src} style={media('section.outdoor-2').style} alt={media('section.outdoor-2').alt} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                <p className="absolute bottom-4 left-5 text-lg font-semibold text-white">Mặt sân chuẩn, đèn đêm đầy đủ</p>
              </Link>
            </Reveal>
            <Reveal from="right" delay={120}>
              <Link to="/dat-san?type=INDOOR" className="group relative flex h-52 flex-col justify-end overflow-hidden rounded-xl bg-slate-900 p-5 text-white">
                <img src={media('section.indoor').src} style={media('section.indoor').style} alt={media('section.indoor').alt} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent" />
                <h3 className="sport-title relative text-2xl">Sân trong nhà</h3>
                <p className="relative text-teal-50">Mát mẻ, không lo mưa nắng.{total('indoor') ? ` Hiện có ${total('indoor')} sân.` : ''}</p>
                <span className="relative mt-1 font-semibold text-lime-300 transition-transform group-hover:translate-x-1">Xem giờ trống →</span>
              </Link>
            </Reveal>
          </div>
        </div>
      </Section>

      <div className="flex flex-col gap-3">
        <Marquee images={[1, 2, 3, 4, 5, 6].map((n) => media(`gallery.${n}`))} />
        <Marquee images={[7, 8, 9, 10, 11, 12].map((n) => media(`gallery.${n}`))} reverse />
      </div>

      <Section id="gioi-thieu" eyebrow="Pickleball là gì" title="Môn thể thao dễ làm quen, càng chơi càng cuốn">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1fr] lg:items-center">
          <Reveal from="left">
            <img src={media('section.intro').src} style={media('section.intro').style} alt={media('section.intro').alt} loading="lazy" className="aspect-[3/2] w-full rounded-xl object-cover" />
          </Reveal>
          <div className="flex flex-col divide-y divide-slate-200">
            {FACTS.map(([title, text], i) => (
              <Reveal key={title} from="right" delay={i * 110} className="py-5 first:pt-0 last:pb-0">
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="mt-1 text-slate-600">{text}</p>
              </Reveal>
            ))}
          </div>
        </div>
      </Section>

      <Section id="cong-dong" dark eyebrow="Cộng đồng" title="Ra sân để khỏe, ở lại vì vui" className="bg-slate-900 text-white">
        <div className="grid auto-rows-[15rem] gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {COMMUNITY.map((c, i) => (
            <Reveal key={c.key} from="zoom" delay={i * 90} className={c.span}>
              <figure className="group relative h-full overflow-hidden rounded-xl">
                <img src={media(c.key).src} style={media(c.key).style} alt={media(c.key).alt} loading="lazy" className="h-full w-full object-cover transition duration-700 group-hover:scale-105" />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
                <figcaption className="sport-title absolute bottom-3 left-4 text-xl text-white">{c.caption}</figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="co-so" eyebrow="Hệ thống cơ sở" title="Chọn cụm sân gần bạn">
        <div className="grid gap-6 md:grid-cols-2">
          {venues.map((v, i) => (
            <Reveal key={v.id} delay={i * 120}>
              <article className="lift relative overflow-hidden rounded-xl bg-teal-700 p-6 text-white lg:p-8">
                <CourtArt className="pointer-events-none absolute -right-10 -top-8 w-72 text-teal-500/30" />
                <div className="relative">
                  <h3 className="text-2xl font-semibold">{v.name}</h3>
                  <p className="mt-1 text-teal-50">{v.address}</p>
                  <p className="text-teal-50">Mở cửa {v.openTime}–{v.closeTime}</p>
                  {v.today && (
                    <dl className="mt-6 grid grid-cols-3 gap-4 border-t border-white/25 pt-4">
                      <div><dt className="text-xs text-teal-50">Sân hoạt động</dt><dd className="text-2xl font-bold">{v.today.courtCount}</dd></div>
                      <div><dt className="text-xs text-teal-50">Ô trống hôm nay</dt><dd className="text-2xl font-bold text-lime-300">{v.today.freeSlots || 'Đã hết'}</dd></div>
                      <div><dt className="text-xs text-teal-50">Giá từ / giờ</dt><dd className="text-lg font-bold leading-8">{v.today.fromPrice ? vnd(v.today.fromPrice) : 'Đang cập nhật'}</dd></div>
                    </dl>
                  )}
                  <Link to={`/dat-san?venue=${v.id}`} className="mt-6 inline-block rounded-lg bg-white px-5 py-2.5 font-semibold text-slate-900 transition hover:bg-lime-300">Xem lịch cơ sở này</Link>
                </div>
              </article>
            </Reveal>
          ))}
          {venues.length === 0 && <p className="text-slate-600">Đang tải danh sách cơ sở…</p>}
        </div>
      </Section>

      <Section id="cach-dat" eyebrow="Cách đặt sân" title="Bốn bước là có sân" className="bg-white">
        <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([title, text], i) => (
            <Reveal as="li" key={title} delay={i * 110} className="border-t-2 border-teal-700 pt-4">
              <p className="text-3xl font-black italic text-teal-700">{i + 1}</p>
              <h3 className="mt-2 text-xl font-semibold">{title}</h3>
              <p className="mt-1 text-slate-600">{text}</p>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section id="dich-vu" eyebrow="Dịch vụ tại sân" title="Đến tay không vẫn chơi được">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div className="flex flex-col gap-4">
            {SERVICES.map(([title, text], i) => (
              <Reveal key={title} from="left" delay={i * 100} className="lift rounded-xl border border-slate-200 bg-white p-5">
                <h3 className="text-xl font-semibold">{title}</h3>
                <p className="mt-1 text-slate-600">{text}</p>
              </Reveal>
            ))}
            <p className="text-sm text-slate-600">Giá dịch vụ được niêm yết tại quầy và có thể khác nhau giữa các cơ sở.</p>
          </div>
          <Reveal from="right">
            <div className="grid grid-cols-2 gap-3">
              <img src={media('section.services').src} style={media('section.services').style} alt={media('section.services').alt} loading="lazy" className="col-span-2 aspect-[2/1] w-full rounded-xl object-cover" />
              <img src={media('section.break').src} style={media('section.break').style} alt={media('section.break').alt} loading="lazy" className="col-span-2 aspect-[2/1] w-full rounded-xl object-cover" />
            </div>
          </Reveal>
        </div>
      </Section>

      <Section id="hoi-dap" eyebrow="Câu hỏi thường gặp" title="Trước khi đặt sân" className="bg-white">
        <div className="max-w-3xl divide-y divide-slate-200 border-y border-slate-200">
          {faqs.map(([q, a]) => (
            <details key={q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {q}<span className="text-xl text-teal-700 transition group-open:rotate-45" aria-hidden="true">+</span>
              </summary>
              <p className="mt-2 text-slate-600">{a}</p>
            </details>
          ))}
        </div>
      </Section>

      <section className="relative overflow-hidden bg-lime-300 py-14">
        <Ball className="ball-roll absolute bottom-3 h-8 w-8" />
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-6 px-4 lg:px-8">
          <h2 className="sport-title max-w-xl text-3xl leading-tight text-slate-900">Giờ đẹp thường hết sớm. Chọn sân cho buổi chơi tới nhé.</h2>
          <Link to="/dat-san" className="rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition hover:-translate-y-0.5 hover:bg-slate-700">Đặt sân ngay</Link>
        </div>
      </section>

      <footer className="bg-slate-900 py-12 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 md:grid-cols-[1fr_2fr_auto] lg:px-8">
          <div>
            <p className="flex items-center gap-2 font-semibold text-white"><Ball className="h-5 w-5" />Pickleball Booking</p>
            <p className="mt-2 text-sm">{settings.project_name || 'Website quản lý và đặt sân Pickleball trực tuyến'}</p>
            {settings.hotline && <p className="mt-1 text-sm">Điện thoại: {settings.hotline}</p>}
          </div>
          <div className="grid gap-4 text-sm sm:grid-cols-2">
            {venues.map((v) => (
              <div key={v.id}>
                <p className="font-semibold text-white">{v.name}</p>
                <p>{v.address}</p>
                <p>Mở cửa {v.openTime}–{v.closeTime}</p>
              </div>
            ))}
          </div>
          <nav className="flex flex-col gap-2 text-sm" aria-label="Liên kết cuối trang">
            <Link to="/dat-san" className="hover:text-white">Đặt sân</Link>
            <a href="#hoi-dap" className="hover:text-white">Câu hỏi thường gặp</a>
            <Link to="/dang-nhap" className="hover:text-white">Đăng nhập</Link>
          </nav>
        </div>
        <dl className="mx-auto mt-8 grid max-w-7xl gap-x-8 gap-y-3 border-t border-white/10 px-4 pt-6 text-xs text-slate-400 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
          <div><dt className="font-semibold uppercase tracking-widest text-slate-300">{settings.project_type || 'Đồ án chuyên ngành'}</dt><dd className="mt-1">{settings.project_name}</dd></div>
          <div><dt className="font-semibold uppercase tracking-widest text-slate-300">Thực hiện</dt><dd className="mt-1">{settings.team_members || 'Đang cập nhật'}{settings.advisor ? ` · GVHD: ${settings.advisor}` : ''}</dd></div>
          <div><dt className="font-semibold uppercase tracking-widest text-slate-300">Công nghệ</dt><dd className="mt-1">{settings.tech_stack}</dd></div>
          <div><dt className="font-semibold uppercase tracking-widest text-slate-300">Triển khai</dt><dd className="mt-1">{settings.deployment}</dd></div>
        </dl>
      </footer>
    </>
  );
}
