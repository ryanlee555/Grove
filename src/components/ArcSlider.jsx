import { useState, useRef } from 'react'

const GRADIENTS = {
  'Food & Dining':  { id: 'grad-food',         start: '#2d6a4f', end: '#d4a843' },
  'Transport':      { id: 'grad-transport',     start: '#c45e1a', end: '#e8a838' },
  'Shopping':       { id: 'grad-shopping',      start: '#9b3d8f', end: '#d4a843' },
  'Events':         { id: 'grad-events',        start: '#1a6ec4', end: '#5bb8d4' },
  'Subscriptions':  { id: 'grad-subscriptions', start: '#1a6ec4', end: '#9b3d8f' },
  'Travel':         { id: 'grad-travel',        start: '#1a6ec4', end: '#9b3d8f' },
  'Groceries':      { id: 'grad-groceries',     start: '#3d8f3d', end: '#d4a843' },
  'Nightlife':      { id: 'grad-nightlife',     start: '#6b3d8f', end: '#d4a843' },
  'Miscellaneous':  { id: 'grad-misc',          start: '#888780', end: '#d4a843' },
}

const CX = 116, CY = 115, R = 100
const START_A = Math.PI * 0.78
const END_A   = Math.PI * 2.22
const SPAN    = END_A - START_A

function arcPt(a) {
  return [CX + R * Math.cos(a), CY + R * Math.sin(a)]
}

function arcD(a0, a1) {
  const [x0, y0] = arcPt(a0)
  const [x1, y1] = arcPt(a1)
  return `M ${x0} ${y0} A ${R} ${R} 0 ${(a1 - a0) > Math.PI ? 1 : 0} 1 ${x1} ${y1}`
}

function snapVal(v, max) {
  return Math.min(max, Math.max(0, Math.round(v / 50) * 50))
}

const TRACK_D = arcD(START_A, END_A)

export default function ArcSlider({
  category, spent, value: initVal, maxValue,
  onConfirm, onCancel, onRemove, dotColor,
}) {
  const [val, setVal] = useState(() => snapVal(initVal ?? 0, maxValue))
  const svgRef = useRef(null)
  const isDrag = useRef(false)

  const g     = GRADIENTS[category] ?? { id: 'grad-default', start: '#888780', end: '#d4a843' }
  const fillA = maxValue > 0 ? START_A + (val / maxValue) * SPAN : START_A
  const [hx, hy] = arcPt(fillA)
  const fillD = val > 0 ? arcD(START_A, fillA) : null

  const over = val > 0 && spent > val
  const diff = Math.abs(val - spent)

  function hit(clientX, clientY) {
    const el = svgRef.current
    if (!el || maxValue <= 0) return
    const rect = el.getBoundingClientRect()
    const sx = (clientX - rect.left) * (232 / rect.width)
    const sy = (clientY - rect.top)  * (230 / rect.height)
    let d = Math.atan2(sy - CY, sx - CX) - START_A
    if (d < 0) d += 2 * Math.PI
    if (d > SPAN) d = d < SPAN + (2 * Math.PI - SPAN) / 2 ? SPAN : 0
    setVal(snapVal((d / SPAN) * maxValue, maxValue))
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 10, borderRadius: 'inherit', overflow: 'hidden',
      backgroundColor: 'var(--color-bg-card)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: '20px 20px 16px', boxSizing: 'border-box',
    }}>

      {/* Category header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, alignSelf: 'flex-start' }}>
        <span style={{
          width: 10, height: 10, borderRadius: '50%',
          backgroundColor: dotColor, flexShrink: 0, display: 'inline-block',
        }} />
        <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: 600, color: 'var(--color-fg)' }}>
          {category}
        </span>
      </div>

      {/* Arc slider */}
      <div style={{ position: 'relative', width: 232, height: 230, flexShrink: 0 }}>
        <svg
          ref={svgRef}
          viewBox="0 0 232 230"
          width={232}
          height={230}
          style={{ display: 'block', userSelect: 'none', touchAction: 'none' }}
          onMouseMove={e => { if (isDrag.current) hit(e.clientX, e.clientY) }}
          onMouseUp={() => { isDrag.current = false }}
          onMouseLeave={() => { isDrag.current = false }}
          onTouchMove={e => { if (!isDrag.current) return; e.preventDefault(); hit(e.touches[0].clientX, e.touches[0].clientY) }}
          onTouchEnd={() => { isDrag.current = false }}
        >
          <defs>
            <linearGradient id={g.id} gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="232" y2="0">
              <stop offset="0%" stopColor={g.start} />
              <stop offset="100%" stopColor={g.end} />
            </linearGradient>
          </defs>

          {/* Track */}
          <path d={TRACK_D} fill="none" stroke="hsl(43,35%,88%)" strokeWidth={24} strokeLinecap="round" />

          {/* Fill */}
          {fillD && (
            <path d={fillD} fill="none" stroke={`url(#${g.id})`} strokeWidth={24} strokeLinecap="round" />
          )}

          {/* Handle visible */}
          <circle cx={hx} cy={hy} r={15} fill="white" stroke="hsl(145,38%,34%)" strokeWidth={4} style={{ pointerEvents: 'none' }} />

          {/* Handle hit target */}
          <circle
            cx={hx} cy={hy} r={26} fill="transparent"
            style={{ cursor: 'grab' }}
            onMouseDown={e => { e.preventDefault(); isDrag.current = true }}
            onTouchStart={e => { e.preventDefault(); isDrag.current = true }}
          />
        </svg>

        {/* Center amount */}
        <div style={{ position: 'absolute', top: 95, left: 0, right: 0, textAlign: 'center', pointerEvents: 'none' }}>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 32, fontWeight: 600, color: 'var(--color-fg)', lineHeight: 1 }}>
            ${Math.round(val).toLocaleString('en-US')}
          </div>
          <div style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 12, color: 'var(--color-muted-text)', marginTop: 4 }}>
            monthly limit
          </div>
        </div>

        {/* $0 label */}
        <div style={{ position: 'absolute', bottom: 0, left: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--color-muted-text)' }}>
          $0
        </div>

        {/* maxValue label */}
        <div style={{ position: 'absolute', bottom: 0, right: 16, fontFamily: "'DM Sans', sans-serif", fontSize: 11, color: 'var(--color-muted-text)' }}>
          ${Math.round(maxValue).toLocaleString('en-US')}
        </div>
      </div>

      {/* Spent / left row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', marginTop: 8, marginBottom: 12 }}>
        <span style={{ fontSize: 13, color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
          ${spent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} spent
        </span>
        {val > 0 && (
          <span style={{ fontSize: 13, fontWeight: 600, color: over ? 'hsl(0,65%,50%)' : 'hsl(145,38%,34%)', fontFamily: "'DM Sans', sans-serif" }}>
            ${diff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {over ? 'over' : 'left'}
          </span>
        )}
      </div>

      {/* Confirm */}
      <button
        onClick={() => onConfirm(val)}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
          backgroundColor: 'hsl(145,38%,34%)', color: '#fff',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", marginBottom: 8,
        }}
      >
        Confirm
      </button>

      {/* Cancel */}
      <button
        onClick={onCancel}
        style={{
          width: '100%', padding: '10px 0', borderRadius: 10,
          background: '#fcebeb', color: '#a32d2d', border: '1.5px solid #f09595',
          fontSize: 14, fontWeight: 600, cursor: 'pointer',
          fontFamily: "'DM Sans', sans-serif", marginBottom: 6,
        }}
      >
        Cancel
      </button>

      {/* Remove limit */}
      <button
        onClick={onRemove}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'hsl(0,65%,50%)', fontSize: 12,
          fontFamily: "'DM Sans', sans-serif", padding: '2px 0',
        }}
      >
        Remove limit
      </button>
    </div>
  )
}
