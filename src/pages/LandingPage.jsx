import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { PieChart, Pie, Cell, ResponsiveContainer, Label } from 'recharts'
import LeafIcon from '../components/LeafIcon'

// ─── JS smooth scroll (easeInOutQuad, ~800ms) ─────────────────────────────────
function smoothScrollTo(element, duration = 800) {
  const start = window.scrollY
  const targetY = element.getBoundingClientRect().top + window.scrollY
  const distance = targetY - start
  let startTime = null
  const ease = t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
  function step(ts) {
    if (!startTime) startTime = ts
    const progress = Math.min((ts - startTime) / duration, 1)
    window.scrollTo(0, start + distance * ease(progress))
    if (progress < 1) requestAnimationFrame(step)
  }
  requestAnimationFrame(step)
}


// ─── Mock bar chart ───────────────────────────────────────────────────────────
const BAR_DATA = [
  { label: 'Jan', h: 38, accent: false },
  { label: 'Feb', h: 55, accent: false },
  { label: 'Mar', h: 48, accent: false },
  { label: 'Apr', h: 72, accent: true  },
  { label: 'May', h: 44, accent: false },
  { label: 'Jun', h: 60, accent: false },
]
function MockBarChart() {
  return (
    <div className="flex items-end gap-1.5" style={{ height: 72 }}>
      {BAR_DATA.map(({ label, h, accent }) => (
        <div key={label} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full rounded-sm"
            style={{ height: h, backgroundColor: accent ? 'var(--color-primary)' : 'var(--color-muted-bg)' }} />
          <span className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Mock line chart ──────────────────────────────────────────────────────────
const LINE_PTS = [3100, 2800, 3400, 3284, 2950, 3600]
const LINE_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun']
function MockLineChart() {
  const W = 260, H = 76
  const min = Math.min(...LINE_PTS) - 200, max = Math.max(...LINE_PTS) + 200
  const sx = i => (i / (LINE_PTS.length - 1)) * W
  const sy = v => H - ((v - min) / (max - min)) * H
  const pts = LINE_PTS.map((v, i) => `${sx(i)},${sy(v)}`).join(' ')
  return (
    <div>
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ overflow: 'visible' }}>
        <polyline points={pts} fill="none" stroke="hsl(145,38%,34%)" strokeWidth="2.5"
          strokeLinejoin="round" strokeLinecap="round" />
        {LINE_PTS.map((v, i) => (
          <circle key={i} cx={sx(i)} cy={sy(v)} r="3.5"
            fill="hsl(145,38%,34%)" stroke="white" strokeWidth="1.5" />
        ))}
      </svg>
      <div className="flex justify-between mt-1">
        {LINE_LABELS.map(l => (
          <span key={l} className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>{l}</span>
        ))}
      </div>
    </div>
  )
}

// ─── Mock donut chart ─────────────────────────────────────────────────────────
const DONUT_CATS = [
  { label: 'Food & Dining', pct: 34, color: 'hsl(145,38%,34%)' },
  { label: 'Groceries',     pct: 22, color: 'hsl(42,68%,58%)'  },
  { label: 'Transport',     pct: 14, color: 'hsl(25,55%,52%)'  },
  { label: 'Shopping',      pct: 9,  color: 'hsl(340,30%,55%)' },
  { label: 'Other',         pct: 21, color: 'hsl(140,16%,68%)' },
]
function MockDonut() {
  let cum = 0
  const stops = DONUT_CATS.map(c => {
    const stop = `${c.color} ${cum}% ${cum + c.pct}%`
    cum += c.pct
    return stop
  })
  return (
    <div className="flex items-center gap-5">
      <div className="relative shrink-0" style={{ width: 90, height: 90 }}>
        <div className="w-full h-full rounded-full"
          style={{ background: `conic-gradient(${stops.join(', ')})` }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="rounded-full" style={{ width: 52, height: 52, backgroundColor: 'var(--color-bg-card)' }} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {DONUT_CATS.slice(0, 4).map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
            <span className="text-[11px]" style={{ color: 'var(--color-fg)' }}>{c.label}</span>
            <span className="text-[11px] font-semibold ml-auto pl-2 tabular-nums" style={{ color: 'var(--color-muted-text)' }}>{c.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Transaction row ──────────────────────────────────────────────────────────
function TxRow({ merchant, category, amount, color }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium truncate" style={{ color: 'var(--color-fg)' }}>{merchant}</p>
      </div>
      <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
        style={{ backgroundColor: color + '22', color }}>
        {category}
      </span>
      <span className="text-[12px] font-semibold tabular-nums text-red-600 shrink-0">-{amount}</span>
    </div>
  )
}

// ─── Slide wrapper card ───────────────────────────────────────────────────────
function SlideCard({ children, badge }) {
  return (
    <div className="relative">
      <div className="rounded-2xl p-5 relative z-10"
        style={{
          backgroundColor: 'var(--color-bg-card)',
          boxShadow: '0 24px 64px rgba(58,125,84,0.12), 0 4px 16px rgba(0,0,0,0.06)',
          transform: 'rotate(1.5deg)',
        }}>
        {children}
      </div>
      {badge && (
        <div className="absolute -top-3 -right-4 z-20 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white"
          style={{ backgroundColor: 'var(--color-primary)', boxShadow: '0 2px 8px rgba(58,125,84,0.35)' }}>
          {badge}
        </div>
      )}
    </div>
  )
}

// ─── Slide 1: Total Spent ─────────────────────────────────────────────────────
function Slide1() {
  return (
    <SlideCard badge="✦ On track">
      <div className="flex justify-between items-start mb-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-text)' }}>Total Spent</span>
        <span className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>April 2026</span>
      </div>
      <p className="text-[30px] font-bold leading-none mb-1"
        style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>$3,284</p>
      <p className="text-[11px] mb-4 font-medium" style={{ color: 'var(--color-primary)' }}>↗ +8.4% vs last month</p>
      <MockBarChart />
      <div className="my-3" style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
      <div className="flex flex-col gap-2">
        {[
          { label: 'Food & Dining', pct: 34, color: 'hsl(145,38%,34%)' },
          { label: 'Groceries',     pct: 22, color: 'hsl(42,68%,58%)'  },
          { label: 'Transport',     pct: 14, color: 'hsl(25,55%,52%)'  },
        ].map(c => (
          <div key={c.label} className="flex items-center gap-2">
            <span className="text-[10px] w-24 shrink-0" style={{ color: 'var(--color-fg)' }}>{c.label}</span>
            <div className="flex-1 rounded-full overflow-hidden" style={{ height: 4, backgroundColor: 'var(--color-muted-bg)' }}>
              <div className="h-full rounded-full" style={{ width: `${c.pct}%`, backgroundColor: c.color }} />
            </div>
            <span className="text-[10px] w-7 text-right tabular-nums shrink-0" style={{ color: 'var(--color-muted-text)' }}>{c.pct}%</span>
          </div>
        ))}
      </div>
      {/* Toast */}
      <div className="absolute -bottom-5 -left-5 z-20 flex items-center gap-2 px-3 py-2 rounded-full"
        style={{ backgroundColor: 'var(--color-bg-card)', boxShadow: '0 4px 16px rgba(0,0,0,0.10)' }}>
        <span style={{ fontSize: 12 }}>🔔</span>
        <span className="text-[10px] font-medium whitespace-nowrap" style={{ color: 'var(--color-fg)' }}>
          Largest spend: Food & Dining
        </span>
      </div>
    </SlideCard>
  )
}

// ─── Slide 2: Spending by Category ───────────────────────────────────────────
function Slide2() {
  return (
    <SlideCard badge="✦ April 2026">
      <div className="flex justify-between items-start mb-4">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-text)' }}>
          Spending by Category
        </span>
      </div>
      <MockDonut />
      <div className="my-3" style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
      <div className="flex justify-between">
        {[
          { label: 'Total spent',   val: '$3,284', green: false },
          { label: 'Transactions',  val: '47',     green: false },
          { label: 'Categories',    val: '5',      green: true  },
        ].map(s => (
          <div key={s.label} className="text-center">
            <p className="text-[18px] font-bold"
              style={{ color: s.green ? 'var(--color-primary)' : 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
              {s.val}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>{s.label}</p>
          </div>
        ))}
      </div>
    </SlideCard>
  )
}

// ─── Slide 3: Monthly Trends ──────────────────────────────────────────────────
function Slide3() {
  return (
    <SlideCard badge="✦ Trending up">
      <div className="flex justify-between items-start mb-1">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-text)' }}>
          Monthly Trends
        </span>
        <span className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>Jan – Jun 2026</span>
      </div>
      <p className="text-[28px] font-bold leading-none mb-0.5"
        style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>$3,190</p>
      <p className="text-[11px] mb-4" style={{ color: 'var(--color-primary)' }}>avg / month</p>
      <MockLineChart />
      <div className="my-3" style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
      <div className="flex gap-3">
        {[
          { label: 'Highest', val: '$3,600', sub: 'June',     green: false },
          { label: 'Lowest',  val: '$2,800', sub: 'February', green: false },
          { label: 'Trend',   val: '↗ +16%', sub: '6 months', green: true  },
        ].map(s => (
          <div key={s.label} className="flex-1 text-center">
            <p className="text-[13px] font-bold"
              style={{ color: s.green ? 'var(--color-primary)' : 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
              {s.val}
            </p>
            <p className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>{s.label}</p>
            <p className="text-[9px]" style={{ color: 'var(--color-muted-text)' }}>{s.sub}</p>
          </div>
        ))}
      </div>
    </SlideCard>
  )
}

// ─── Slide 4: Recent Activity ─────────────────────────────────────────────────
function Slide4() {
  const txns = [
    { merchant: 'Chipotle',     category: 'Food & Dining', amount: '$14.50', color: 'hsl(145,38%,34%)' },
    { merchant: "Trader Joe's", category: 'Groceries',     amount: '$87.32', color: 'hsl(42,68%,58%)'  },
    { merchant: 'Netflix',      category: 'Subscriptions', amount: '$15.99', color: 'hsl(200,30%,52%)' },
    { merchant: 'Uber',         category: 'Transport',     amount: '$12.40', color: 'hsl(25,55%,52%)'  },
    { merchant: 'Starbucks',    category: 'Food & Dining', amount: '$6.75',  color: 'hsl(145,38%,34%)' },
  ]
  return (
    <SlideCard badge="✦ Today">
      <div className="flex justify-between items-start mb-3">
        <span className="text-[9px] font-bold uppercase tracking-[0.12em]" style={{ color: 'var(--color-muted-text)' }}>
          Recent Activity
        </span>
        <span className="text-[9px]" style={{ color: 'var(--color-primary)' }}>View all →</span>
      </div>
      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginBottom: 8 }} />
      {txns.map((t, i) => <TxRow key={i} {...t} />)}
      <div style={{ height: 1, backgroundColor: 'var(--color-border)', marginTop: 8 }} />
      <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--color-muted-text)' }}>
        47 transactions this month
      </p>
    </SlideCard>
  )
}

// ─── Hero slideshow with descriptions ────────────────────────────────────────
const SLIDES = [Slide1, Slide2, Slide3, Slide4]
const SLIDE_DESCRIPTIONS = [
  'See your total spending at a glance, broken down by card and compared to last month.',
  'Grove automatically sorts every transaction into categories — no manual work needed.',
  'Track how your spending changes month over month and spot patterns early.',
  'Every transaction logged instantly, with merchant names, categories, and amounts in one clean view.',
]

function HeroSlideshow() {
  const [active, setActive] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setActive(prev => (prev + 1) % SLIDES.length), 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div>
      {/* Slides */}
      <div className="relative" style={{ minHeight: 390 }}>
        {SLIDES.map((Slide, i) => (
          <div key={i} style={{
            position: 'absolute', inset: 0,
            opacity: active === i ? 1 : 0,
            transition: 'opacity 0.4s ease',
            pointerEvents: active === i ? 'auto' : 'none',
          }}>
            <Slide />
          </div>
        ))}
      </div>

      {/* Slide descriptions + dots — pulled up to align with left-column CTAs */}
      <div style={{ marginTop: '-24px' }}>
      <div className="relative" style={{ minHeight: '4.5em' }}>
        {SLIDE_DESCRIPTIONS.map((desc, i) => (
          <p key={i}
            className="absolute inset-x-0 text-center"
            style={{
              fontSize: 15,
              lineHeight: 1.6,
              color: 'var(--color-muted-text)',
              fontFamily: "'DM Sans', sans-serif",
              opacity: active === i ? 1 : 0,
              transition: 'opacity 0.4s ease',
            }}>
            {desc}
          </p>
        ))}
      </div>

      {/* Dot indicators */}
      <div className="flex justify-center gap-2 mt-4">
        {SLIDES.map((_, i) => (
          <button key={i} onClick={() => setActive(i)} aria-label={`Slide ${i + 1}`}
            style={{
              width: active === i ? 20 : 6, height: 6, borderRadius: 3,
              backgroundColor: active === i ? 'var(--color-primary)' : 'var(--color-border)',
              border: 'none', cursor: 'pointer', padding: 0,
              transition: 'all 0.3s ease',
            }} />
        ))}
      </div>
      </div>{/* end pull-up wrapper */}
    </div>
  )
}

// ─── SVG feature icons ────────────────────────────────────────────────────────
function IconChart({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="8" rx="1"/><rect x="10" y="8" width="4" height="12" rx="1"/><rect x="17" y="4" width="4" height="16" rx="1"/>
    </svg>
  )
}
function IconTarget({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
    </svg>
  )
}
function IconSparkle({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l2.4 7.4L22 12l-7.6 2.6L12 22l-2.4-7.4L2 12l7.6-2.6Z"/>
    </svg>
  )
}
function IconShield({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 22C12 22 4 18 4 12V5l8-3 8 3v7c0 6-8 10-8 10z"/>
    </svg>
  )
}
function IconBell({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  )
}
function IconLock({ color }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
    </svg>
  )
}

// ─── About photo carousel ─────────────────────────────────────────────────────
const ABOUT_PHOTOS = [
  '/RotateNumberOne.webp',
  '/RotateNumberTwo.webp',
  '/ROtateNumberThree.webp',
  '/RotateNumber4.webp',
  '/RotateNumber5.webp',
  '/RotateNumber6.webp',
]

function PhotoCarousel() {
  const [current, setCurrent] = useState(0)
  const [animKey, setAnimKey] = useState(0)
  const timerRef = useRef(null)

  const go = useCallback((dir) => {
    setCurrent(prev => (prev + dir + ABOUT_PHOTOS.length) % ABOUT_PHOTOS.length)
    setAnimKey(k => k + 1)
  }, [])

  const resetTimer = useCallback(() => {
    clearInterval(timerRef.current)
    timerRef.current = setInterval(() => go(1), 6000)
  }, [go])

  useEffect(() => {
    timerRef.current = setInterval(() => go(1), 6000)
    return () => clearInterval(timerRef.current)
  }, [go])

  const prev = (current - 1 + ABOUT_PHOTOS.length) % ABOUT_PHOTOS.length

  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: '3/4', borderRadius: 20, overflow: 'hidden', userSelect: 'none' }}>
      {/* Previous photo acts as the visible stack underneath */}
      <img src={ABOUT_PHOTOS[prev]} alt=""
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 1 }} />
      {/* Active photo slides in on top */}
      <img key={animKey} src={ABOUT_PHOTOS[current]} alt="" className="photo-card-in"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 2 }} />
      {/* Arrow buttons */}
      <button onClick={() => { go(-1); resetTimer() }}
        style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 4,
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
          backgroundColor: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(145,38%,34%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6"/>
        </svg>
      </button>
      <button onClick={() => { go(1); resetTimer() }}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 4,
          width: 34, height: 34, borderRadius: '50%', border: 'none', cursor: 'pointer',
          backgroundColor: 'rgba(255,255,255,0.75)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="hsl(145,38%,34%)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6"/>
        </svg>
      </button>

      {/* Dot indicators */}
      <div style={{ position: 'absolute', bottom: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, zIndex: 3 }}>
        {ABOUT_PHOTOS.map((_, i) => (
          <div key={i} onClick={() => { setCurrent(i); setAnimKey(k => k + 1); resetTimer() }}
            style={{
              width: i === current ? 18 : 6, height: 6, borderRadius: 3, cursor: 'pointer',
              backgroundColor: i === current ? 'white' : 'rgba(255,255,255,0.55)',
              transition: 'all 0.3s ease',
            }} />
        ))}
      </div>
    </div>
  )
}

// ─── Feature card ─────────────────────────────────────────────────────────────
function FeatureCard({ icon, iconBg, title, body, delay = 0 }) {
  return (
    <div className="animate-on-scroll flex-1 p-6 rounded-2xl"
      style={{
        backgroundColor: 'var(--color-bg-card)',
        border: '1px solid var(--color-border)',
        transitionDelay: `${delay}ms`,
      }}>
      <div className="w-11 h-11 flex items-center justify-center mb-4"
        style={{ backgroundColor: iconBg, borderRadius: 12 }}>
        {icon}
      </div>
      <h3 className="text-[17px] font-semibold mb-2"
        style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
        {title}
      </h3>
      <p className="text-[14px] leading-relaxed"
        style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
        {body}
      </p>
    </div>
  )
}

// ─── How it works step ────────────────────────────────────────────────────────
function Step({ num, title, body, delay = 0 }) {
  return (
    <div className="animate-on-scroll flex-1 text-center px-6"
      style={{ transitionDelay: `${delay}ms` }}>
      <p className="text-[52px] font-bold leading-none mb-3"
        style={{ color: 'var(--color-secondary)', fontFamily: "'Playfair Display', serif" }}>
        {num}
      </p>
      <h3 className="text-[17px] font-semibold mb-2"
        style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
        {title}
      </h3>
      <p className="text-[14px] leading-relaxed"
        style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
        {body}
      </p>
    </div>
  )
}

// ─── How It Works — Spending Breakdown Card ──────────────────────────────────
const SPENDING_DATA = [
  { name: 'Housing',       value: 33 },
  { name: 'Food & Dining', value: 22 },
  { name: 'Transport',     value: 14 },
  { name: 'Shopping',      value: 18 },
  { name: 'Other',         value: 13 },
]
const SPENDING_COLORS = [
  'hsl(145,42%,26%)',
  'hsl(145,35%,40%)',
  'hsl(140,22%,54%)',
  'hsl(140,18%,70%)',
  'hsl(140,10%,85%)',
]

function DonutCenterLabel({ viewBox }) {
  const { cx, cy } = viewBox
  return (
    <g>
      <text x={cx} y={cy - 7} textAnchor="middle"
        style={{ fontSize: 14, fontWeight: 700, fontFamily: "'Playfair Display', serif", fill: 'hsl(150,22%,14%)' }}>
        $4,280
      </text>
      <text x={cx} y={cy + 10} textAnchor="middle"
        style={{ fontSize: 10, fontFamily: "'DM Sans', sans-serif", fill: 'hsl(145,14%,46%)' }}>
        this month
      </text>
    </g>
  )
}

function SpendingBreakdownCard() {
  return (
    <div className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-4"
        style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
        Spending Breakdown
      </p>
      <div className="flex items-center gap-5">
        <div style={{ width: 160, height: 160, flexShrink: 0 }}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={SPENDING_DATA} cx="50%" cy="50%" innerRadius={50} outerRadius={74}
                dataKey="value" startAngle={90} endAngle={-270} stroke="none">
                {SPENDING_DATA.map((_, i) => <Cell key={i} fill={SPENDING_COLORS[i]} />)}
                <Label content={<DonutCenterLabel />} />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex flex-col gap-2.5 flex-1 min-w-0">
          {SPENDING_DATA.map((d, i) => (
            <div key={d.name} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: SPENDING_COLORS[i] }} />
              <span className="text-[12px] flex-1 truncate"
                style={{ color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif" }}>
                {d.name}
              </span>
              <span className="text-[12px] font-semibold tabular-nums"
                style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
                {d.value}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── How It Works — Budget Tracker Card ──────────────────────────────────────
const BUDGET_DATA = [
  { label: 'Groceries',     spent: 340, total: 400 },
  { label: 'Dining out',    spent: 180, total: 200 },
  { label: 'Entertainment', spent: 62,  total: 150 },
  { label: 'Subscriptions', spent: 88,  total: 100 },
]

function BudgetTrackerCard() {
  return (
    <div className="rounded-2xl p-5"
      style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)' }}>
      <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-4"
        style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
        Budget Tracker
      </p>
      <div className="flex flex-col gap-4">
        {BUDGET_DATA.map(({ label, spent, total }) => {
          const pct = Math.round((spent / total) * 100)
          const isWarn = pct > 85
          const barColor = isWarn ? 'hsl(16,80%,52%)' : 'hsl(145,38%,34%)'
          const amountColor = isWarn ? 'hsl(16,80%,52%)' : 'var(--color-fg)'
          return (
            <div key={label}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[13px] font-medium"
                  style={{ color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif" }}>
                  {label}
                </span>
                <span className="text-[12px] font-semibold tabular-nums"
                  style={{ color: amountColor, fontFamily: "'DM Sans', sans-serif" }}>
                  ${spent}{' '}
                  <span style={{ color: 'var(--color-muted-text)', fontWeight: 400 }}>/ ${total}</span>
                </span>
              </div>
              <div className="w-full rounded-full overflow-hidden"
                style={{ height: 5, backgroundColor: 'var(--color-muted-bg)' }}>
                <div className="h-full rounded-full"
                  style={{ width: `${pct}%`, backgroundColor: barColor }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── How It Works — two-column layout with scroll animations ─────────────────
function HowItWorksSection() {
  const card1Ref = useRef(null)
  const card2Ref = useRef(null)
  const [card1Visible, setCard1Visible] = useState(false)
  const [card2Visible, setCard2Visible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          if (e.target === card1Ref.current) setCard1Visible(true)
          if (e.target === card2Ref.current) setCard2Visible(true)
        }
      }),
      { threshold: 0.12 }
    )
    if (card1Ref.current) observer.observe(card1Ref.current)
    if (card2Ref.current) observer.observe(card2Ref.current)
    return () => observer.disconnect()
  }, [])

  const steps = [
    {
      num: '01', filled: true,
      title: 'Connect your accounts',
      body: 'Link any US bank, credit card, or investment account in seconds using Plaid — fully secure, read-only access.',
    },
    {
      num: '02', filled: false,
      title: 'We do the analysis',
      body: 'Grove automatically categorizes every transaction and builds a complete picture of your financial life.',
    },
    {
      num: '03', filled: false,
      title: 'You gain clarity',
      body: 'View beautiful dashboards, set budgets, and watch your savings grow — all updated in real time.',
    },
  ]

  return (
    <div style={{ background: 'linear-gradient(to bottom, hsl(140, 16%, 92%), var(--color-bg))', position: 'relative', overflow: 'hidden' }}>
      <div className="absolute pointer-events-none rounded-full"
        style={{ width: 520, height: 520, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: 'var(--color-secondary)', opacity: 0.15, zIndex: 0 }} />
      <section id="how-it-works" className="max-w-7xl mx-auto px-10 py-24" style={{ position: 'relative', zIndex: 1 }}>
        <div className="flex flex-col lg:flex-row gap-16 items-center">

          {/* Left column */}
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] mb-5"
              style={{ color: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif" }}>
              How it works
            </p>
            <h2 className="animate-on-scroll font-bold leading-[1.15] mb-12"
              style={{
                color: 'var(--color-fg)',
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(30px, 3.2vw, 42px)',
                maxWidth: 420,
              }}>
              Set up in minutes. Benefits for a lifetime.
            </h2>
            <div className="flex flex-col gap-8">
              {steps.map(({ num, filled, title, body }) => (
                <div key={num} className="animate-on-scroll flex items-start gap-5">
                  <div className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center"
                    style={{
                      backgroundColor: filled ? 'hsl(145,38%,28%)' : 'transparent',
                      border: filled ? 'none' : '1.5px solid hsl(140,20%,72%)',
                    }}>
                    <span className="text-[12px] font-bold tabular-nums"
                      style={{ color: filled ? 'white' : 'hsl(145,20%,50%)', fontFamily: "'DM Sans', sans-serif" }}>
                      {num}
                    </span>
                  </div>
                  <div className="pt-1.5">
                    <h3 className="text-[16px] font-semibold mb-1"
                      style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
                      {title}
                    </h3>
                    <p className="text-[14px] leading-relaxed"
                      style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
                      {body}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column — two stacked preview cards */}
          <div className="flex-1 min-w-0 flex flex-col gap-5 w-full">
            <div ref={card1Ref} style={{
              transform: card1Visible ? 'translateX(0)' : 'translateX(40px)',
              opacity: card1Visible ? 1 : 0,
              transition: 'transform 600ms ease-out, opacity 600ms ease-out',
            }}>
              <SpendingBreakdownCard />
            </div>
            <div ref={card2Ref} style={{
              transform: card2Visible ? 'translateX(0)' : 'translateX(40px)',
              opacity: card2Visible ? 1 : 0,
              transition: 'transform 600ms ease-out, opacity 600ms ease-out',
              transitionDelay: '150ms',
            }}>
              <BudgetTrackerCard />
            </div>
          </div>

        </div>
      </section>
    </div>
  )
}

// ─── Main landing page ────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)

  const NAV_LINKS = [
    { label: 'Features',     href: '#features'     },
    { label: 'How it works', href: '#how-it-works' },
    { label: 'About',        href: '#about'        },
  ]

  const FEATURES_ROW1 = [
    { icon: <IconChart   color="hsl(145,38%,34%)" />, iconBg: 'hsl(140,30%,88%)', title: 'Effortless tracking', body: 'Your spending organizes itself into categories you actually understand. No manual entry, no mystery.' },
    { icon: <IconTarget  color="hsl(42,68%,45%)"  />, iconBg: 'hsl(42,68%,90%)',  title: 'Goals that stick',    body: 'Set savings goals that fit your life. Grove shows your progress gently, without guilt trips.' },
    { icon: <IconSparkle color="hsl(145,38%,34%)" />, iconBg: 'hsl(140,30%,88%)', title: 'Smart suggestions',   body: 'Personalized nudges arrive exactly when you need them — quiet guidance, never pressure.' },
  ]
  const FEATURES_ROW2 = [
    { icon: <IconShield color="hsl(145,38%,34%)" />, iconBg: 'hsl(140,30%,88%)', title: 'Bank-grade security', body: "256-bit encryption and read-only access. We see nothing we don't need — and keep it safe." },
    { icon: <IconBell   color="hsl(42,68%,45%)"  />, iconBg: 'hsl(42,68%,90%)',  title: 'Gentle alerts',       body: 'Spending nudges arrive as calm reminders, not alarms. You stay aware without feeling watched.' },
    { icon: <IconLock   color="hsl(145,38%,34%)" />, iconBg: 'hsl(140,30%,88%)', title: 'Total privacy',       body: 'Your data is yours. We never sell it, share it, or use it for advertising.' },
  ]

  // Sticky navbar — scroll detection
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // IntersectionObserver — fade-up sections on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting) {
            entry.target.classList.add('visible')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.12 }
    )
    document.querySelectorAll('.animate-on-scroll').forEach(el => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  // Nav smooth scroll handler
  const handleNavClick = (e, href) => {
    e.preventDefault()
    const target = document.querySelector(href)
    if (target) smoothScrollTo(target, 800)
  }

  return (
    <div style={{ backgroundColor: 'var(--color-bg)', minHeight: '100vh' }}>

      {/* ── Sticky Navbar ──────────────────────────────────────────────────── */}
      <nav
        className="flex items-center justify-between px-10 py-4 max-w-7xl mx-auto"
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 100,
          transition: 'border-color 200ms ease, background-color 200ms ease, backdrop-filter 200ms ease',
          borderBottom: scrolled ? '1px solid var(--color-border)' : '1px solid transparent',
          backgroundColor: scrolled ? 'hsl(43, 35%, 97%)' : 'var(--color-bg)',
          backdropFilter: scrolled ? 'blur(8px)' : 'none',
          maxWidth: '100%',
        }}>
        {/* Inner max-width wrapper */}
        <div className="flex items-center justify-between w-full max-w-7xl mx-auto">
          <div className="flex items-center gap-3" style={{ cursor: 'pointer' }}
            onClick={() => smoothScrollTo(document.documentElement, 800)}>
            <LeafIcon size={32} />
            <span className="text-[18px] font-semibold"
              style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
              Grove
            </span>
          </div>

          <div className="hidden md:flex items-center gap-8">
            {NAV_LINKS.map(({ label, href }) => (
              <a key={label} href={href}
                onClick={e => handleNavClick(e, href)}
                className="text-[14px] transition-opacity hover:opacity-60"
                style={{ color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif", textDecoration: 'none' }}>
                {label}
              </a>
            ))}
          </div>

          <div className="flex items-center gap-4">
            <Link to="/login"
              className="text-[14px] transition-opacity hover:opacity-60"
              style={{ color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif", textDecoration: 'none' }}>
              Log in
            </Link>
            <Link to="/login"
              className="px-5 py-2.5 rounded-full text-[14px] font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif", textDecoration: 'none' }}>
              Get started free
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ───────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden max-w-7xl mx-auto px-10 pt-16 pb-20">
        {/* Decorative circles */}
        <div className="absolute top-0 right-0 w-[520px] h-[520px] rounded-full pointer-events-none"
          style={{ backgroundColor: 'var(--color-muted-bg)', opacity: 0.55, transform: 'translate(30%, -30%)' }} />
        <div className="absolute top-24 right-40 w-[320px] h-[320px] rounded-full pointer-events-none"
          style={{ backgroundColor: 'var(--color-secondary)', opacity: 0.3, transform: 'translate(20%, -10%)' }} />

        <div className="flex flex-col md:flex-row items-start gap-16 relative z-10">
          {/* Left — 60% */}
          <div className="flex-[3] min-w-0">
            {/* Pill label */}
            <div className="hero-animate inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8"
              style={{ backgroundColor: 'var(--color-muted-bg)', animationDelay: '0ms' }}>
              <svg viewBox="0 0 12 14" fill="none" style={{ width: 11, height: 13 }}>
                <path d="M6 0C6 0 10.5 3 10.5 7C10.5 9.49 8.49 11.5 6 11.5C3.51 11.5 1.5 9.49 1.5 7C1.5 3 6 0 6 0Z"
                  fill="hsl(145, 38%, 34%)" />
              </svg>
              <span className="text-[11px] font-semibold uppercase tracking-widest"
                style={{ color: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif" }}>
                Your finances, finally at peace
              </span>
            </div>

            {/* Headline */}
            <h1 className="hero-animate leading-[1.08] mb-6"
              style={{
                fontFamily: "'Playfair Display', serif",
                fontSize: 'clamp(44px, 5.5vw, 68px)',
                fontWeight: 800,
                animationDelay: '100ms',
              }}>
              <span style={{ color: 'var(--color-fg)', display: 'block' }}>Grow your savings,</span>
              <span style={{ color: 'var(--color-primary)', fontStyle: 'italic', display: 'block' }}>naturally.</span>
            </h1>

            {/* Subheadline */}
            <p className="hero-animate text-[18px] leading-relaxed mb-10 max-w-lg"
              style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif", animationDelay: '200ms' }}>
              Grove connects to your accounts and gently guides you toward your financial goals —
              no stress, no jargon, just clarity.
            </p>

            {/* CTAs */}
            <div className="hero-animate flex flex-wrap items-center gap-4"
              style={{ animationDelay: '300ms', marginTop: '80px' }}>
              <Link to="/login"
                className="px-8 py-4 rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif", textDecoration: 'none' }}>
                Get started free →
              </Link>
              <a href="#how-it-works"
                onClick={e => handleNavClick(e, '#how-it-works')}
                className="px-8 py-4 rounded-full text-[16px] font-semibold transition-opacity hover:opacity-70"
                style={{ color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif", border: '1.5px solid var(--color-border)', textDecoration: 'none' }}>
                See how it works ↓
              </a>
            </div>
          </div>

          {/* Right — 40% */}
          <div className="hero-animate flex-[2] min-w-0 flex justify-center md:justify-end w-full"
            style={{ animationDelay: '200ms' }}>
            <div className="w-full max-w-sm">
              <HeroSlideshow />
            </div>
          </div>
        </div>
      </section>

      {/* ── Features ───────────────────────────────────────────────────────── */}
      <div style={{ background: 'linear-gradient(to bottom, var(--color-bg), hsl(140, 16%, 92%))', position: 'relative', overflow: 'hidden' }}>
        {/* Decorative circle — bottom left */}
        <div className="absolute pointer-events-none rounded-full" style={{ width: 340, height: 340, bottom: -60, left: -80, backgroundColor: 'var(--color-secondary)', opacity: 0.28, zIndex: 0 }} />
        <section id="features" className="max-w-7xl mx-auto px-10 py-24" style={{ position: 'relative', zIndex: 1 }}>
          <h2 className="animate-on-scroll text-[38px] font-bold mb-14 text-center"
            style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
            Everything you need to grow smarter
          </h2>
          <div className="flex flex-col md:flex-row gap-5 mb-5">
            {FEATURES_ROW1.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 100} />)}
          </div>
          <div className="flex flex-col md:flex-row gap-5">
            {FEATURES_ROW2.map((f, i) => <FeatureCard key={f.title} {...f} delay={i * 100} />)}
          </div>
        </section>
      </div>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-10">
        <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
      </div>

      {/* ── How it works ───────────────────────────────────────────────────── */}
      <HowItWorksSection />

      {/* ── About ──────────────────────────────────────────────────────────── */}
      <section id="about" className="max-w-7xl mx-auto px-10 py-24">
        <div className="animate-on-scroll rounded-2xl overflow-hidden flex flex-col md:flex-row"
          style={{ border: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-card)' }}>

          {/* Left: photo carousel */}
          <div className="flex-[5] min-w-0 p-6" style={{ minWidth: 0, maxWidth: 340 }}>
            <PhotoCarousel />
          </div>

          {/* Right: personal note */}
          <div className="flex-[7] min-w-0 p-10 flex flex-col justify-center"
            style={{ borderLeft: '1px solid var(--color-border)' }}>
            <h2 className="text-[32px] font-bold mb-6"
              style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
              Why I Built Grove
            </h2>
            <p className="text-[15px] leading-[1.8] mb-4"
              style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
              Hey! I'm Ryan, a broke college student who got tired of always having no idea where his money was going. My bank would show me a long list of transactions and call it a day, but that wasn't enough. I wanted to actually <em>see</em> it — like, where is my money really going every month?
            </p>
            <p className="text-[15px] leading-[1.8] mb-4"
              style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
              That's why I built Grove. Grove is a clean, simple, and transparent tool that shows exactly where your money is going, so you can have a clearer idea of how to budget more effectively. While it first started as a personal project to make sense of my own spending, Grove turned into something I genuinely utilize every week.
            </p>
            <p className="text-[15px] leading-[1.8]"
              style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
              If you're a student, a young professional, or just someone who wants more clarity on their finances without the overwhelm, Grove was made for you.
            </p>
          </div>
        </div>
      </section>

      {/* Divider */}
      <div className="max-w-7xl mx-auto px-10">
        <div style={{ height: 1, backgroundColor: 'var(--color-border)' }} />
      </div>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="max-w-7xl mx-auto px-10 py-10" style={{ fontFamily: "'DM Sans', sans-serif" }}>
        <div className="flex flex-col md:flex-row items-center justify-between gap-8">
          {/* Left: brand */}
          <div className="flex items-center gap-3">
            <LeafIcon size={32} />
            <p className="text-[13px]" style={{ color: 'var(--color-muted-text)' }}>
              © 2026 Grove. Built for people who want to understand their money.
            </p>
          </div>

          {/* Right: contact */}
          <div className="flex flex-col items-center md:items-end gap-2">
            <p className="text-[13px] font-semibold" style={{ color: 'var(--color-fg)' }}>Any questions?</p>
            <p className="text-[13px]" style={{ color: 'var(--color-muted-text)' }}>
              Reach out to me at{' '}
              <a href="mailto:ryan.lee55@berkeley.edu"
                className="hover:underline"
                style={{ color: 'var(--color-primary)', textDecoration: 'none' }}>
                ryan.lee55@berkeley.edu
              </a>
            </p>
            <a href="https://www.linkedin.com/in/ryan-lee-uc-berkeley/" target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 hover:underline"
              style={{ color: 'var(--color-primary)', textDecoration: 'none', fontSize: 13 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="hsl(145,38%,34%)">
                <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
              </svg>
              Connect on LinkedIn
            </a>
          </div>
        </div>
      </footer>

    </div>
  )
}
