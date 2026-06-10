import { useState, useMemo, useRef, useEffect, useCallback, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  PieChart, Pie, Cell, Sector, Tooltip,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line,
} from 'recharts'
import { ChevronDown, X, Plus } from 'lucide-react'
import { supabase } from './supabaseClient'
import LeafIcon from './components/LeafIcon'
import HamiltonAI from './components/HamiltonAI'
import hamiltonIcon from './assets/hamilton-icon.png'

const GET_TRANSACTIONS_URL = 'https://dovjukmgimhslsskmjhk.supabase.co/functions/v1/get-transactions'

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = {
  'Food & Dining':     '#0D530E',
  'Events':            '#546B41',
  'Shopping':          '#4C5C2D',
  'Groceries':         '#306D29',
  'Subscriptions':     '#99AD7A',
  'Transport':         '#A5CF83',
  'Zelle':             '#6FCF97',
  'Venmo':             '#DCCCAC',
  'Nightlife':         '#2E7D4F',
  'Travel':            '#B8C99A',
  'Bills & Utilities': '#7A9E5F',
  'Miscellaneous':     '#48A111',
}
const CARD_PALETTE = [
  '#0D530E',
  '#306D29',
  '#546B41',
  '#4C5C2D',
  '#99AD7A',
  '#A5CF83',
  '#6FCF97',
  '#2E7D4F',
]
const CATEGORIES   = Object.keys(COLORS)
const CARD_OPTIONS = ['Chase Unlimited', 'Chase Flex', 'Other']

let _txId = 0
const nextId = () => ++_txId

const PRESETS = [
  { id: 'this-month', label: 'This Month'    },
  { id: 'last-month', label: 'Last Month'    },
  { id: 'last-30',    label: 'Last 30 Days'  },
  { id: 'last-90',    label: 'Last 90 Days'  },
]

// ─── Date utilities ───────────────────────────────────────────────────────────
function parseTxDate(str) {
  const [m, d, y] = str.split('/'); return new Date(+y, +m - 1, +d)
}
function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function fromInputDate(s) {
  const [y, m, d] = s.split('-'); return new Date(+y, +m - 1, +d)
}
function toTxDateStr(d) {
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`
}
function getPresetRange(id) {
  const today = new Date(); today.setHours(0,0,0,0)
  const y = today.getFullYear(), mo = today.getMonth()
  switch (id) {
    case 'this-month': return { start: new Date(y,mo,1),     end: new Date(y,mo+1,0)   }
    case 'last-month': return { start: new Date(y,mo-1,1),   end: new Date(y,mo,0)     }
    case 'last-30': { const s=new Date(today); s.setDate(s.getDate()-29); return {start:s,end:new Date(today)} }
    case 'last-90': { const s=new Date(today); s.setDate(s.getDate()-89); return {start:s,end:new Date(today)} }
    case 'last-3m': { const s=new Date(today); s.setMonth(s.getMonth()-3); return {start:s,end:new Date(today)} }
    default:           return { start: new Date(y,mo,1),     end: new Date(y,mo+1,0)   }
  }
}
// Plaid returns "YYYY-MM-DD", dashboard expects "MM/DD/YYYY"
function plaidDateToTxDate(str) {
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

function formatRangeLabel(preset, start, end) {
  if (preset === 'this-month' || preset === 'last-month')
    return start.toLocaleDateString('en-US', { month:'long', year:'numeric' })
  const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// ─── Weekly/monthly bucket builder (shared by Trends + Compare) ──────────────
function computeWeeklyBuckets(allTx, rangeStart, rangeEnd) {
  const purchases = allTx.filter(t => t.amount < 0)
  const rangeDays = Math.max(1, Math.ceil((rangeEnd - rangeStart) / (1000*60*60*24)) + 1)
  const buckets = []
  if (rangeDays <= 62) {
    let cursor = new Date(rangeStart)
    while (cursor <= rangeEnd) {
      const wEnd = new Date(cursor); wEnd.setDate(wEnd.getDate() + 6)
      const bucketEnd = wEnd > rangeEnd ? new Date(rangeEnd) : wEnd
      buckets.push({ start: new Date(cursor), end: new Date(bucketEnd),
        label: cursor.toLocaleDateString('en-US', { month:'short', day:'numeric' }) })
      cursor.setDate(cursor.getDate() + 7)
    }
  } else {
    let cursor = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1)
    while (cursor <= rangeEnd) {
      const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
      buckets.push({ start: new Date(cursor), end: new Date(mEnd),
        label: cursor.toLocaleDateString('en-US', { month:'short', year:'2-digit' }) })
      cursor.setMonth(cursor.getMonth() + 1)
    }
  }
  return buckets.map(b => {
    const bucketTx = purchases.filter(t => { const d = parseTxDate(t.date); return d >= b.start && d <= b.end })
    const result = { label: b.label }
    let total = 0
    CATEGORIES.forEach(cat => {
      const v = parseFloat(bucketTx.filter(t => t.category === cat)
        .reduce((s, t) => s + (isNaN(t.amount) ? 0 : Math.abs(t.amount)), 0).toFixed(2)) || 0
      result[cat] = v
      total += v
    })
    result.total = parseFloat(total.toFixed(2))
    return result
  })
}

// ─── Keyword category mapping ─────────────────────────────────────────────────
function plaidCategoryToGrove(detailed = '', name = '') {
  const d = detailed.toUpperCase()
  const n = name.toUpperCase()

  if (/ZELLE/.test(n)) return 'Zelle'
  if (/VENMO/.test(n)) return 'Venmo'
  if (/RESTAURANT|FAST_FOOD|COFFEE|FOOD_AND_DRINK|DINING|BAKERY|BAR|JUICE|FOOD_DELIVERY/.test(d)) return 'Food & Dining'
  if (/GROCERIES|SUPERMARKET|FARMERS_MARKET/.test(d)) return 'Groceries'
  if (/TAXI|RIDE|TRANSIT|GAS|PARKING|AUTO|AIRLINE|FERRY|SUBWAY|TRAIN|TOLL|FUEL|TRANSPORT/.test(d)) return 'Transport'
  if (/TRAVEL|HOTEL|LODGING|HOSTEL|MOTEL|AIRBNB|VACATION|FLIGHT/.test(d)) return 'Travel'
  if (/SUBSCRIPTION|STREAMING|DIGITAL|SOFTWARE|INTERNET|CABLE|PHONE|WIRELESS/.test(d)) return 'Subscriptions'
  if (/ENTERTAINMENT|EVENT|TICKET|CONCERT|SPORT|MOVIE|MUSEUM|AMUSEMENT/.test(d)) return 'Events'
  if (/NIGHTLIFE|DRINKING|CLUB|LOUNGE/.test(d)) return 'Nightlife'
  if (/SHOPS|RETAIL|CLOTHING|ELECTRONICS|ONLINE_MARKETPLACE|DEPARTMENT_STORE|AMAZON|MARKETPLACE/.test(d)) return 'Shopping'
  if (/UTILITIES|ELECTRIC|WATER|GAS_UTILITIES|INTERNET_SERVICE|PHONE_SERVICE/.test(d)) return 'Bills & Utilities'

  // Fall back to keyword matching on merchant name
  const up = n.toUpperCase()
  if (/NETFLIX|SPOTIFY|HULU|DISNEY|APPLE\.COM\/BILL|AMAZON PRIME|OPENAI|CHATGPT|CLAUDE|GYMPASS/.test(up)) return 'Subscriptions'
  if (/TICKETMASTER|EDCVEGAS|NITEHARTS/.test(up)) return 'Events'
  if (/AIRBNB|ALASKA AIR|MARRIOTT|HILTON|HYATT|EXPEDIA/.test(up)) return 'Travel'
  if (/UBER|LYFT|CLIPPER|FASTRAK|BART|CALTRAIN|PARKING|CHEVRON|ARCO|SHELL/.test(up)) return 'Transport'
  if (/TAP HAUS|HANSHIN POCHA/.test(up)) return 'Nightlife'
  if (/COSTCO|TRADER JOE|WHOLE FOODS|SAFEWAY|KROGER|WALMART|SPROUTS/.test(up)) return 'Groceries'
  if (/CHIPOTLE|TACO BELL|STARBUCKS|DOORDASH|GRUBHUB|UBEREATS|RESTAURANT|CAFE|COFFEE|SUSHI|PIZZA/.test(up)) return 'Food & Dining'
  if (/AMAZON|UNIQLO|EBAY|ETSY|TIKTOK SHOP/.test(up)) return 'Shopping'
  if (/AT&T|VERIZON|COMCAST|PG&E/.test(up)) return 'Bills & Utilities'

  return 'Miscellaneous'
}

// ─── CSV parser ───────────────────────────────────────────────────────────────
function parseCSV(raw) {
  const lines = raw.trim().split('\n')
  const headers = lines[0].split(',').map(h => h.trim())
  return lines.slice(1).filter(Boolean).map(line => {
    const cols = line.split(',')
    return Object.fromEntries(headers.map((h, i) => [h, (cols[i] ?? '').trim()]))
  })
}
function decodeEntities(s) {
  return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
}


// ─── Shared components ────────────────────────────────────────────────────────
function Card({ title, action, children, divider = false, colDivider = false }) {
  return (
    <div className="flex flex-col overflow-hidden"
      style={{
        ...(divider    && { borderTop:  '1px solid var(--color-border)' }),
        ...(colDivider && { borderLeft: '1px solid var(--color-border)' }),
      }}>
      <div className="flex items-center justify-between px-6 pt-5 pb-0 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em]"
          style={{ color: 'var(--color-muted-text)' }}>{title}</span>
        {action}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col px-6 pb-5 pt-3">{children}</div>
    </div>
  )
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  const label = item.name ?? item.label ?? ''
  const value = item.value ?? item.amount ?? payload[0].value ?? 0
  return (
    <div className="rounded-xl px-3 py-2 text-sm shadow-xl border"
      style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
      <p className="font-medium text-xs mb-0.5" style={{ color: 'var(--color-muted-text)' }}>{label}</p>
      <p className="font-bold" style={{ color: 'var(--color-fg)' }}>${Number(value).toFixed(2)}</p>
    </div>
  )
}

// Stacked bar tooltip — total header + per-category breakdown
function StackedBarTip({ active, payload, label, isWeekly }) {
  if (!active || !payload?.length) return null
  const items = payload.filter(p => p.value > 0).slice().reverse()
  const total = items.reduce((s, p) => s + p.value, 0)
  const header = isWeekly ? `Week of ${label}` : label
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-xl border min-w-[195px]"
      style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
      <p className="font-bold text-[13px] mb-2 leading-tight" style={{ color: 'var(--color-fg)' }}>
        {header} <span style={{ color: 'var(--color-primary)' }}>· ${total.toFixed(2)}</span>
      </p>
      <div className="space-y-1">
        {items.map(p => (
          <div key={p.dataKey} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-2 h-2 rounded-sm shrink-0" style={{ backgroundColor: p.fill }} />
              <span className="text-[11px] truncate" style={{ color: 'var(--color-muted-text)' }}>{p.dataKey}</span>
            </div>
            <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: 'var(--color-fg)' }}>
              ${Number(p.value).toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// Line chart tooltip — period + $ per series
function LineTip({ active, payload, label, compareRanges, selectedPeriod, lineColors, hasComparisons }) {
  if (!active || !payload?.length) return null
  const visible = payload.filter(p => p.value != null)
  return (
    <div className="rounded-xl px-3 py-2.5 shadow-xl border min-w-[160px]"
      style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
      <p className="text-[10px] font-medium mb-1.5" style={{ color: 'var(--color-muted-text)' }}>
        {hasComparisons ? label : `Week of ${label}`}
      </p>
      {visible.map(p => {
        const idx = p.dataKey === 'primary' ? 0 : parseInt(p.dataKey.replace('comp', '')) + 1
        const periodName = p.dataKey === 'primary'
          ? formatRangeLabel(selectedPeriod.preset, selectedPeriod.start, selectedPeriod.end)
          : compareRanges[parseInt(p.dataKey.replace('comp', ''))]?.label ?? p.dataKey
        return (
          <div key={p.dataKey} className="flex items-center justify-between gap-3 py-0.5">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="w-3 h-[2px] rounded shrink-0" style={{ backgroundColor: lineColors[idx] }} />
              <span className="text-[11px] truncate max-w-[90px]" style={{ color: 'var(--color-muted-text)' }}>{periodName}</span>
            </div>
            <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: 'var(--color-fg)' }}>
              ${Number(p.value).toFixed(2)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

const inputCls = [
  'w-full rounded-lg border text-sm px-3 py-2 outline-none transition-colors',
  'placeholder:opacity-60',
].join(' ')
const inputStyle = {
  borderColor: 'var(--color-border)',
  backgroundColor: 'var(--color-bg)',
  color: 'var(--color-fg)',
}

// ─── Inline transaction edit form ─────────────────────────────────────────────
function TxEditForm({ tx, onSave, onDelete, onCancel, accounts = [] }) {
  const [date,     setDate]     = useState(toInputDate(parseTxDate(tx.date)))
  const [merchant, setMerchant] = useState(tx.merchant)
  const [category, setCategory] = useState(tx.category)
  const [source,   setSource]   = useState(tx.source)
  const [amount,   setAmount]   = useState(tx.amount.toString())

  const sourceOptions = accounts.length > 0
    ? accounts
        .filter(a => !a.hidden)
        .map(a => ({ value: a.name, label: a.label ?? a.name }))
    : CARD_OPTIONS.map(o => ({ value: o, label: o }))

  const handleSave = (e) => {
    e.preventDefault()
    const parsed = parseFloat(amount)
    if (!date || !merchant.trim() || isNaN(parsed)) return
    onSave({ date: toTxDateStr(fromInputDate(date)), merchant: merchant.trim(), category, source, amount: parsed })
  }

  return (
    <form onSubmit={handleSave}
      className="px-4 py-3 border-t"
      style={{ backgroundColor: 'var(--color-muted-bg)', borderColor: 'var(--color-border)' }}
      onClick={e => e.stopPropagation()}>
      <div className="grid grid-cols-5 gap-2 mb-2.5">
        <input type="date" value={date} onChange={e => setDate(e.target.value)} className={inputCls} style={inputStyle} />
        <input type="text" value={merchant} onChange={e => setMerchant(e.target.value)} placeholder="Merchant" className={inputCls} style={inputStyle} />
        <select value={category} onChange={e => setCategory(e.target.value)} className={inputCls} style={inputStyle}>
          {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={source}
            onChange={e => setSource(e.target.value)}
            style={{
              appearance: 'none',
              WebkitAppearance: 'none',
              padding: '3px 24px 3px 10px',
              borderRadius: 999,
              border: 'none',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              backgroundColor: source?.includes('Unlimited')
                ? 'hsl(145, 38%, 90%)'
                : source?.includes('Flex')
                ? 'hsl(140, 16%, 88%)'
                : 'var(--color-muted-bg)',
              color: source?.includes('Unlimited')
                ? 'hsl(145, 38%, 28%)'
                : source?.includes('Flex')
                ? 'hsl(140, 16%, 38%)'
                : 'var(--color-muted-text)',
              outline: 'none',
              minWidth: 80,
            }}
          >
            {sourceOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <span style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            pointerEvents: 'none', fontSize: 9,
            color: source?.includes('Unlimited') ? 'hsl(145, 38%, 28%)' : source?.includes('Flex') ? 'hsl(140, 16%, 38%)' : 'var(--color-muted-text)',
          }}>▾</span>
        </div>
        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
          placeholder="Amount" step="0.01" className={inputCls} style={inputStyle} />
      </div>
      <div className="flex items-center gap-2">
        <button type="submit"
          className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white transition-colors"
          style={{ backgroundColor: 'var(--color-primary)' }}>
          Save
        </button>
        <button type="button" onClick={onCancel}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
          style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-fg)' }}>
          Cancel
        </button>
        <button type="button" onClick={onDelete}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-semibold bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
          Delete
        </button>
      </div>
    </form>
  )
}

// ─── Trends section (Q4) ──────────────────────────────────────────────────────
const LINE_COLORS = [
  'hsl(145, 38%, 34%)',
  'hsl(42, 68%, 58%)',
  'hsl(200, 30%, 52%)',
  'hsl(25, 55%, 52%)',
  'hsl(270, 20%, 52%)',
]

function TrendsSection({ allTx, selectedPeriod, rangeDays }) {
  const [view,          setView]          = useState('bar')
  const [compareRanges, setCompareRanges] = useState([])
  const [compMonthId,   setCompMonthId]   = useState('')

  const cg         = 'hsl(140, 18%, 80%)'
  const ca         = 'hsl(145, 14%, 46%)'
  const cursorFill = 'rgba(58, 125, 84, 0.06)'
  const isWeekly   = rangeDays <= 62

  // Check whether the current date range is exactly a full calendar month
  const isFullMonth = useMemo(() => {
    const { start, end } = selectedPeriod
    if (start.getDate() !== 1) return false
    const lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0)
    return end.getFullYear() === lastDay.getFullYear() &&
      end.getMonth() === lastDay.getMonth() &&
      end.getDate() === lastDay.getDate()
  }, [selectedPeriod])

  // ID of current month (to exclude from dropdown)
  const currentMonthId = isFullMonth
    ? `${selectedPeriod.start.getFullYear()}-${String(selectedPeriod.start.getMonth()+1).padStart(2,'0')}`
    : null

  // Primary buckets (stacked bar + line primary)
  const primaryData = useMemo(() =>
    computeWeeklyBuckets(allTx, selectedPeriod.start, selectedPeriod.end),
    [allTx, selectedPeriod]
  )

  const hasComparisons = compareRanges.length > 0

  // Merged line data — uses "Week N" x-labels when comparing so months align
  const lineData = useMemo(() => {
    if (view !== 'line') return []
    const compBuckets = compareRanges.map(cr =>
      computeWeeklyBuckets(allTx, cr.start, cr.end)
    )
    const maxLen = Math.max(primaryData.length, ...compBuckets.map(b => b.length), 0)
    return Array.from({ length: maxLen }, (_, i) => ({
      label:   hasComparisons ? `Week ${i + 1}` : (primaryData[i]?.label ?? `W${i+1}`),
      primary: primaryData[i]?.total ?? null,
      ...Object.fromEntries(compBuckets.map((cb, ci) => [`comp${ci}`, cb[i]?.total ?? null]))
    }))
  }, [view, primaryData, compareRanges, allTx, hasComparisons])

  // Available months from transaction data, excluding current month
  const availableMonths = useMemo(() => {
    const seen = new Set()
    allTx.forEach(t => {
      const d = parseTxDate(t.date)
      seen.add(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`)
    })
    return [...seen].sort().reverse()
      .filter(m => m !== currentMonthId)
      .map(m => {
        const [y, mo] = m.split('-')
        return {
          id: m,
          label: new Date(+y, +mo-1, 1).toLocaleDateString('en-US', { month:'long', year:'numeric' }),
          start: new Date(+y, +mo-1, 1),
          end:   new Date(+y, +mo, 0),
        }
      })
  }, [allTx, currentMonthId])

  const addComparison = (start, end, label) => {
    const id = `${start.getTime()}-${end.getTime()}`
    if (compareRanges.find(r => r.id === id) || compareRanges.length >= 4) return
    setCompareRanges(prev => [...prev, { id, label, start, end }])
  }
  const removeComparison = (id) => setCompareRanges(prev => prev.filter(r => r.id !== id))

  const addMonth = (id) => {
    if (!id) return
    const m = availableMonths.find(x => x.id === id)
    if (!m) return
    const compId = `${m.start.getTime()}-${m.end.getTime()}`
    if (compareRanges.find(r => r.id === compId)) {
      removeComparison(compId)
    } else {
      addComparison(m.start, m.end, m.label)
    }
    setCompMonthId('')
  }

  return (
    <div className="flex flex-col h-full gap-2">

      {/* Row 1 — subtitle + Bar/Line toggle */}
      <div className="flex items-center justify-between shrink-0 gap-2">
        <p className="text-[11px] truncate" style={{ color: 'var(--color-muted-text)' }}>
          {isWeekly ? 'Weekly' : 'Monthly'} spending — {formatRangeLabel(selectedPeriod.preset, selectedPeriod.start, selectedPeriod.end)}
        </p>
        <div className="flex items-center gap-0.5 rounded-lg p-0.5 shrink-0"
          style={{ backgroundColor: 'var(--color-muted-bg)' }}>
          {['bar','line'].map(v => (
            <button key={v} onClick={() => setView(v)}
              className="px-2.5 py-1 rounded-md text-[10px] font-semibold capitalize transition-colors"
              style={view === v
                ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-fg)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', cursor: 'pointer' }
                : { color: 'var(--color-muted-text)', cursor: 'pointer' }}>
              {v === 'bar' ? 'Bar' : 'Line'}
            </button>
          ))}
        </div>
      </div>

      {/* Row 2 — Compare controls (line mode only) */}
      {view === 'line' && (
        <div className="shrink-0 space-y-1.5">
          {!isFullMonth ? (
            <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2.5 py-1.5 leading-snug">
              Compare is only available for full months. Adjust your date range to a single full month to enable it.
            </p>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-wide shrink-0"
                style={{ color: 'var(--color-muted-text)' }}>Compare:</span>
              <select
                value={compMonthId}
                onChange={e => addMonth(e.target.value)}
                className="px-2 py-1 rounded-md border text-[10px] outline-none cursor-pointer transition-colors"
                style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-card)', color: 'var(--color-fg)' }}>
                <option value="">Add month…</option>
                {availableMonths.map(m => {
                  const compId = `${m.start.getTime()}-${m.end.getTime()}`
                  const isActive = !!compareRanges.find(r => r.id === compId)
                  return <option key={m.id} value={m.id}>{isActive ? '✓ ' : ''}{m.label}</option>
                })}
              </select>
            </div>
          )}

          {/* Active comparison pills */}
          {hasComparisons && (
            <div className="flex gap-1.5 flex-wrap">
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                style={{ backgroundColor: LINE_COLORS[0] + '28', color: LINE_COLORS[0] }}>
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[0] }} />
                {formatRangeLabel(selectedPeriod.preset, selectedPeriod.start, selectedPeriod.end)}
              </span>
              {compareRanges.map((cr, i) => (
                <span key={cr.id} className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                  style={{ backgroundColor: LINE_COLORS[i+1] + '28', color: LINE_COLORS[i+1] }}>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: LINE_COLORS[i+1] }} />
                  {cr.label}
                  <button onClick={() => removeComparison(cr.id)} className="ml-0.5 opacity-60 hover:opacity-100 leading-none">×</button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Chart area */}
      <div className="flex-1 min-h-0">
        {view === 'bar' ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={primaryData} margin={{ top:4, right:4, left:-16, bottom: isWeekly ? 14 : 0 }}>
              <CartesianGrid vertical={false} stroke={cg} strokeDasharray="3 3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false}
                tick={{ fill: ca, fontSize: 10 }}
                label={isWeekly ? { value:'Week of', position:'insideBottom', offset:-2, fill:ca, fontSize:9 } : undefined}
              />
              <YAxis tick={{ fill:ca, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`} />
              <Tooltip
                content={(props) => <StackedBarTip {...props} isWeekly={isWeekly} />}
                cursor={{ fill: cursorFill }}
              />
              {CATEGORIES.map(cat => (
                <Bar key={cat} dataKey={cat} stackId="a" fill={COLORS[cat]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={lineData} margin={{ top:4, right:4, left:-16, bottom:0 }}>
              <CartesianGrid vertical={false} stroke={cg} strokeDasharray="3 3" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill:ca, fontSize:10 }} />
              <YAxis tick={{ fill:ca, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`} />
              <Tooltip
                content={(props) => <LineTip {...props} compareRanges={compareRanges} selectedPeriod={selectedPeriod} lineColors={LINE_COLORS} hasComparisons={hasComparisons} />}
                cursor={{ stroke: 'rgba(58, 125, 84, 0.2)', strokeWidth:1 }}
              />
              <Line dataKey="primary" stroke={LINE_COLORS[0]} strokeWidth={2.5} dot={false} connectNulls activeDot={{ r:4, strokeWidth:0 }} />
              {compareRanges.map((cr, i) => (
                <Line key={cr.id} dataKey={`comp${i}`} stroke={LINE_COLORS[i+1]} strokeWidth={2} dot={false} connectNulls strokeDasharray="5 3" activeDot={{ r:4, strokeWidth:0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Line legend (line mode + comparisons active) */}
      {view === 'line' && hasComparisons && (
        <div className="shrink-0 flex items-center gap-3 flex-wrap pt-0.5">
          {[
            { key:'primary', label: formatRangeLabel(selectedPeriod.preset, selectedPeriod.start, selectedPeriod.end), color: LINE_COLORS[0], dashed: false },
            ...compareRanges.map((cr, i) => ({ key: cr.id, label: cr.label, color: LINE_COLORS[i+1], dashed: true })),
          ].map(({ key, label, color, dashed }) => (
            <div key={key} className="flex items-center gap-1.5 min-w-0">
              <svg width="20" height="6" viewBox="0 0 20 6" className="shrink-0">
                <line x1="0" y1="3" x2="20" y2="3" stroke={color} strokeWidth="2"
                  strokeDasharray={dashed ? '5 3' : 'none'} strokeLinecap="round" />
              </svg>
              <span className="text-[10px] truncate max-w-[110px]" style={{ color: 'var(--color-muted-text)' }}>{label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Spending by Category section (Q2) ───────────────────────────────────────
function CategorySection({ byCategory, totalSpent, transactions, budgetLimits = {}, onEditTx, onDeleteTx, accounts = [] }) {
  const navigate = useNavigate()
  const [hoveredCat,     setHoveredCat]     = useState(null)
  const [lockedCat,      setLockedCat]      = useState(null)
  const [openPopover,       setOpenPopover]       = useState(null) // { name, x, y }
  const [popoverLockedOpen, setPopoverLockedOpen] = useState(false)
  const [catExpandedRow, setCatExpandedRow] = useState(null)
  const activeCat = lockedCat ?? hoveredCat

  // Click outside the section → deselect locked
  const sectionRef = useRef(null)
  const popoverRef = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) {
        setLockedCat(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Click outside popover → close it
  useEffect(() => {
    if (!openPopover) return
    function handler(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setOpenPopover(null)
        setPopoverLockedOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [openPopover])

  // ── Pie interactions ─────────────────────────────────────────────────────────
  const activeIndex = activeCat ? byCategory.findIndex(e => e.name === activeCat) : -1
  const activeCatData = activeCat ? byCategory.find(e => e.name === activeCat) : null

  const renderActiveShape = useCallback((props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return (
      <Sector
        cx={cx} cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius + 10}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
    )
  }, [])

  const handleSliceEnter = useCallback((_, index) => {
    if (!lockedCat) setHoveredCat(byCategory[index]?.name ?? null)
  }, [lockedCat, byCategory])

  const handleSliceLeave = useCallback(() => {
    if (!lockedCat) setHoveredCat(null)
  }, [lockedCat])

  const handleSliceClick = useCallback((_, index) => {
    const name = byCategory[index]?.name
    setLockedCat(l => l === name ? null : name)
    setHoveredCat(null)
  }, [byCategory])

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div ref={sectionRef} className="flex h-full gap-4 overflow-hidden">

      {/* Chart area */}
      <div className="flex-1 min-w-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={byCategory}
              cx="50%" cy="50%"
              innerRadius="50%" outerRadius="74%"
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
              activeIndex={activeIndex >= 0 ? activeIndex : undefined}
              activeShape={renderActiveShape}
              onMouseEnter={handleSliceEnter}
              onMouseLeave={handleSliceLeave}
              onClick={handleSliceClick}
            >
              {byCategory.map(e => (
                <Cell
                  key={e.name}
                  fill={COLORS[e.name] ?? 'hsl(140, 16%, 68%)'}
                  opacity={activeCat && e.name !== activeCat ? 0.3 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — total spent by default, active category when hovering */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {hoveredCat && !lockedCat && activeCatData ? (
            <div className="text-center px-3 max-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate"
                style={{ color: COLORS[activeCatData.name], fontFamily: "'DM Sans', sans-serif" }}>
                {activeCatData.name}
              </p>
              <p className="text-[17px] font-bold tabular-nums leading-none" style={{ color: 'var(--color-fg)' }}>
                ${activeCatData.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          ) : !lockedCat && (
            <div className="text-center px-3 max-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                style={{ color: 'var(--color-muted-text)' }}>
                Total
              </p>
              <p className="text-[17px] font-bold tabular-nums leading-none" style={{ color: 'var(--color-fg)' }}>
                ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        {/* Locked category detail overlay */}
        {lockedCat && activeCatData && (() => {
          const catTx = transactions.filter(t => t.category === lockedCat && t.amount < 0)
            .sort((a, b) => new Date(b.date) - new Date(a.date))
          return (
            <div className="absolute inset-0 rounded-xl flex flex-col p-3 overflow-hidden"
              style={{ backgroundColor: 'var(--color-bg)' }}>
              {/* Header */}
              <div className="flex items-start justify-between mb-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest truncate"
                    style={{ color: COLORS[lockedCat], fontFamily: "'DM Sans', sans-serif" }}>
                    {lockedCat}
                  </p>
                  <p className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'var(--color-fg)' }}>
                    ${activeCatData.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <button
                  onClick={() => { setLockedCat(null); setHoveredCat(null) }}
                  className="ml-2 shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs leading-none transition-colors"
                  style={{ color: 'var(--color-muted-text)' }}>
                  ✕
                </button>
              </div>
              {/* Transaction list */}
              <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
                {catTx.length === 0 ? (
                  <p className="text-[11px] text-center mt-4" style={{ color: 'var(--color-muted-text)' }}>No transactions</p>
                ) : catTx.map((t) => {
                  const txId = t.id ?? t.transaction_id
                  return (
                    <div key={txId}>
                      {catExpandedRow === txId ? (
                        <TxEditForm
                          tx={t}
                          onSave={(updated) => { onEditTx(txId, updated); setCatExpandedRow(null) }}
                          onDelete={() => { onDeleteTx(txId); setCatExpandedRow(null); setLockedCat(null) }}
                          onCancel={() => setCatExpandedRow(null)}
                          accounts={accounts}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-between gap-2 py-1.5 px-1.5 rounded-lg transition-colors cursor-pointer"
                          style={{}}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          onClick={() => setCatExpandedRow(txId)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-fg)' }}>{t.merchant}</p>
                            <p className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted-text)' }}>{t.date}</p>
                          </div>
                          <p className="text-[11px] font-semibold tabular-nums text-red-600 shrink-0">
                            -${Math.abs(t.amount).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[9px] text-center mt-1.5 shrink-0" style={{ color: 'var(--color-muted-text)' }}>
                {catTx.length} transaction{catTx.length !== 1 ? 's' : ''}
              </p>
            </div>
          )
        })()}
      </div>

      {/* Legend list */}
      <div className="w-44 shrink-0 overflow-y-auto flex flex-col gap-0.5 py-1 pr-1">
        {byCategory.map(({ name, value }) => {
          const isActive = activeCat === name
          const isDimmed = activeCat && !isActive
          const limit  = budgetLimits[name]
          const isOver = limit != null && value > limit
          const overBy = isOver ? value - limit : 0
          return (
            <div
              key={name}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer select-none transition-all duration-150"
              style={{
                backgroundColor: isActive ? 'var(--color-muted-bg)' : 'transparent',
                opacity: isDimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => { if (!lockedCat) setHoveredCat(name) }}
              onMouseLeave={() => { if (!lockedCat) setHoveredCat(null) }}
              onClick={() => { setLockedCat(l => l === name ? null : name); setHoveredCat(null) }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 transition-transform duration-150"
                style={{ backgroundColor: COLORS[name] ?? 'hsl(140, 16%, 68%)',
                         transform: isActive ? 'scale(1.4)' : 'scale(1)' }} />
              <div className="min-w-0 flex-1">
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <p className="text-[11px] truncate transition-all duration-150"
                    style={{ fontWeight: isActive ? 700 : 500, color: 'var(--color-fg)', margin: 0, fontFamily: "'DM Sans', sans-serif" }}>
                    {name}
                  </p>
                  {isOver && (
                    <div style={{ position: 'relative', flexShrink: 0, marginLeft: 5 }}>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          const rect = e.currentTarget.getBoundingClientRect()
                          if (popoverLockedOpen && openPopover?.name === name) {
                            setPopoverLockedOpen(false)
                            setOpenPopover(null)
                          } else {
                            setPopoverLockedOpen(true)
                            setOpenPopover({ name, x: rect.left, y: rect.top + rect.height / 2 })
                          }
                        }}
                        onMouseEnter={e => {
                          const rect = e.currentTarget.getBoundingClientRect()
                          setOpenPopover({ name, x: rect.left, y: rect.top + rect.height / 2 })
                        }}
                        onMouseLeave={() => {
                          if (!popoverLockedOpen) setOpenPopover(null)
                        }}
                        style={{
                          width: 16, height: 16, borderRadius: '50%',
                          backgroundColor: 'hsl(0, 65%, 50%)', color: '#fff',
                          fontSize: 10, fontWeight: 700, lineHeight: 1,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          border: 'none', cursor: 'pointer', padding: 0,
                        }}
                      >
                        !
                      </button>
                    </div>
                  )}
                </div>
                <p className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted-text)' }}>
                  ${value.toFixed(2)} · {((value / totalSpent) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )
        })}

        {/* Over-budget popover — fixed to viewport so it escapes overflow */}
        {openPopover && (
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              right: window.innerWidth - openPopover.x + 8,
              top: openPopover.y,
              transform: 'translateY(-50%)',
              zIndex: 100,
              minWidth: 180,
              backgroundColor: 'var(--color-bg-card)',
              border: '1px solid var(--color-border)',
              borderRadius: 12,
              padding: 14,
              boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <p style={{ fontFamily: "'DM Sans', sans-serif", fontWeight: 700, fontSize: 13, color: 'var(--color-fg)', margin: '0 0 8px' }}>
              {openPopover.name}
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-muted-text)', margin: '0 0 4px' }}>
              Spent: <span style={{ color: 'var(--color-fg)', fontWeight: 600 }}>${byCategory.find(e => e.name === openPopover.name)?.value.toFixed(2)}</span>
            </p>
            <p style={{ fontSize: 12, color: 'var(--color-muted-text)', margin: '0 0 4px' }}>
              Limit: <span style={{ color: 'var(--color-fg)', fontWeight: 600 }}>${(budgetLimits[openPopover.name] ?? 0).toFixed(2)}</span>
            </p>
            <p style={{ fontSize: 12, fontWeight: 600, color: 'hsl(0, 60%, 48%)', margin: '0 0 12px' }}>
              Over by: ${(byCategory.find(e => e.name === openPopover.name)?.value - budgetLimits[openPopover.name]).toFixed(2)}
            </p>
            <button
              onClick={() => { setOpenPopover(null); navigate('/budgets') }}
              style={{
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                fontSize: 12, fontWeight: 600, color: 'hsl(145, 38%, 34%)',
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              View Budgets →
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

// ─── Spending by Card section (Q2 alternate) ──────────────────────────────────
function CardSection({ byCard, totalSpent, transactions, cardColorMap = {}, onEditTx, onDeleteTx, accounts = [] }) {
  const [hoveredCard,    setHoveredCard]    = useState(null)
  const [lockedCard,     setLockedCard]     = useState(null)
  const [catExpandedRow, setCatExpandedRow] = useState(null)
  const activeCard = lockedCard ?? hoveredCard

  const sectionRef = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) setLockedCard(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const activeIndex    = activeCard ? byCard.findIndex(e => e.name === activeCard) : -1
  const activeCardData = activeCard ? byCard.find(e => e.name === activeCard) : null

  const renderActiveShape = useCallback((props) => {
    const { cx, cy, innerRadius, outerRadius, startAngle, endAngle, fill } = props
    return <Sector cx={cx} cy={cy} innerRadius={innerRadius} outerRadius={outerRadius + 10}
      startAngle={startAngle} endAngle={endAngle} fill={fill} />
  }, [])

  const handleSliceEnter = useCallback((_, i) => {
    if (!lockedCard) setHoveredCard(byCard[i]?.name ?? null)
  }, [lockedCard, byCard])

  const handleSliceLeave = useCallback(() => {
    if (!lockedCard) setHoveredCard(null)
  }, [lockedCard])

  const handleSliceClick = useCallback((_, i) => {
    const name = byCard[i]?.name
    setLockedCard(l => l === name ? null : name)
    setHoveredCard(null)
  }, [byCard])

  return (
    <div ref={sectionRef} className="flex h-full gap-4 overflow-hidden">

      {/* Chart area */}
      <div className="flex-1 min-w-0 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={byCard}
              cx="50%" cy="50%"
              innerRadius="50%" outerRadius="74%"
              paddingAngle={2}
              dataKey="value"
              strokeWidth={0}
              activeIndex={activeIndex >= 0 ? activeIndex : undefined}
              activeShape={renderActiveShape}
              onMouseEnter={handleSliceEnter}
              onMouseLeave={handleSliceLeave}
              onClick={handleSliceClick}
            >
              {byCard.map(e => (
                <Cell
                  key={e.name}
                  fill={cardColorMap[e.name] ?? 'hsl(140, 16%, 68%)'}
                  opacity={activeCard && e.name !== activeCard ? 0.3 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — total spent by default, active card when hovering */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {hoveredCard && !lockedCard && activeCardData ? (
            <div className="text-center px-3 max-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate"
                style={{ color: cardColorMap[activeCardData.name] }}>
                {activeCardData.name}
              </p>
              <p className="text-[17px] font-bold tabular-nums leading-none" style={{ color: 'var(--color-fg)' }}>
                ${activeCardData.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          ) : !lockedCard && (
            <div className="text-center px-3 max-w-[120px]">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1"
                style={{ color: 'var(--color-muted-text)' }}>
                TOTAL
              </p>
              <p className="text-[17px] font-bold tabular-nums leading-none" style={{ color: 'var(--color-fg)' }}>
                ${totalSpent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>

        {/* Locked card detail overlay */}
        {lockedCard && activeCardData && (() => {
          const cardTx = transactions.filter(t => t.source === lockedCard && t.amount < 0)
            .sort((a, b) => parseTxDate(b.date) - parseTxDate(a.date))
          return (
            <div className="absolute inset-0 rounded-xl flex flex-col p-3 overflow-hidden"
              style={{ backgroundColor: 'var(--color-bg)' }}>
              <div className="flex items-start justify-between mb-2 shrink-0">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-widest truncate"
                    style={{ color: cardColorMap[lockedCard] }}>
                    {lockedCard}
                  </p>
                  <p className="text-[15px] font-bold tabular-nums leading-tight" style={{ color: 'var(--color-fg)' }}>
                    ${activeCardData.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                </div>
                <button
                  onClick={() => { setLockedCard(null); setHoveredCard(null) }}
                  className="ml-2 shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-xs leading-none transition-colors"
                  style={{ color: 'var(--color-muted-text)' }}>
                  ✕
                </button>
              </div>
              <div className="flex-1 overflow-y-auto space-y-0.5 -mx-1 px-1">
                {cardTx.length === 0 ? (
                  <p className="text-[11px] text-center mt-4" style={{ color: 'var(--color-muted-text)' }}>No transactions</p>
                ) : cardTx.map((t) => {
                  const txId = t.id ?? t.transaction_id
                  return (
                    <div key={txId}>
                      {catExpandedRow === txId ? (
                        <TxEditForm
                          tx={t}
                          onSave={(updated) => { onEditTx(txId, updated); setCatExpandedRow(null) }}
                          onDelete={() => { onDeleteTx(txId); setCatExpandedRow(null); setLockedCard(null) }}
                          onCancel={() => setCatExpandedRow(null)}
                          accounts={accounts}
                        />
                      ) : (
                        <div
                          className="flex items-center justify-between gap-2 py-1.5 px-1.5 rounded-lg transition-colors cursor-pointer"
                          style={{}}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                          onClick={() => setCatExpandedRow(txId)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--color-fg)' }}>{t.merchant}</p>
                            <p className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted-text)' }}>{t.date}</p>
                          </div>
                          <p className="text-[11px] font-semibold tabular-nums text-red-600 shrink-0">
                            -${Math.abs(t.amount).toFixed(2)}
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <p className="text-[9px] text-center mt-1.5 shrink-0" style={{ color: 'var(--color-muted-text)' }}>
                {cardTx.length} transaction{cardTx.length !== 1 ? 's' : ''}
              </p>
            </div>
          )
        })()}
      </div>

      {/* Legend list */}
      <div className="w-44 shrink-0 overflow-y-auto flex flex-col gap-0.5 py-1 pr-1">
        {byCard.map(({ name, value }) => {
          const isActive = activeCard === name
          const isDimmed = activeCard && !isActive
          return (
            <div
              key={name}
              className="flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer select-none transition-all duration-150"
              style={{
                backgroundColor: isActive ? 'var(--color-muted-bg)' : 'transparent',
                opacity: isDimmed ? 0.35 : 1,
              }}
              onMouseEnter={() => { if (!lockedCard) setHoveredCard(name) }}
              onMouseLeave={() => { if (!lockedCard) setHoveredCard(null) }}
              onClick={() => { setLockedCard(l => l === name ? null : name); setHoveredCard(null) }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 transition-transform duration-150"
                style={{ backgroundColor: cardColorMap[name] ?? 'hsl(140, 16%, 68%)',
                         transform: isActive ? 'scale(1.4)' : 'scale(1)' }} />
              <div className="min-w-0 flex-1">
                <p className="text-[11px] truncate transition-all duration-150"
                  style={{ fontWeight: isActive ? 700 : 500, color: 'var(--color-fg)' }}>
                  {name}
                </p>
                <p className="text-[10px] tabular-nums" style={{ color: 'var(--color-muted-text)' }}>
                  ${value.toFixed(2)} · {((value / totalSpent) * 100).toFixed(1)}%
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App({ selectedPeriod, setSelectedPeriod }) {
  const navigate = useNavigate()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [profile, setProfile] = useState({ display_name: '', avatar_url: '', hamilton_style: 'default' })
  const [settingName, setSettingName] = useState('')
  const [settingStyle, setSettingStyle] = useState('default')
  const [settingSaving, setSettingSaving] = useState(false)
  const [pendingAvatarFile, setPendingAvatarFile] = useState(null)
  const [avatarUrl,          setAvatarUrl]          = useState(null)
  const [cropSrc,        setCropSrc]        = useState(null)
  const [cropFile,       setCropFile]       = useState(null)
  const [showCropModal,  setShowCropModal]  = useState(false)
  const [cropScale,      setCropScale]      = useState(1)
  const [cropOffset,     setCropOffset]     = useState({ x: 0, y: 0 })
  const [cropIsDragging, setCropIsDragging] = useState(false)
  const [cropDragStart,  setCropDragStart]  = useState({ x: 0, y: 0 })
  const [cropPreviewUrl, setCropPreviewUrl] = useState(null)
  const [hamiltonOpen, setHamiltonOpen] = useState(false)
  const [hamiltonHovered, setHamiltonHovered] = useState(false)
  const [user, setUser] = useState(null)
  const dropdownRef = useRef(null)

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  // Table sort
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // Date range
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [customStart,    setCustomStart]    = useState(toInputDate(selectedPeriod.start))
  const [customEnd,      setCustomEnd]      = useState(toInputDate(selectedPeriod.end))
  const [datePickerPos,  setDatePickerPos]  = useState({ top: 0, left: 0 })
  const dateBtnRef    = useRef(null)
  const datePickerRef = useRef(null)

  // Add expense modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [formDate,     setFormDate]     = useState(toInputDate(new Date()))
  const [formMerchant, setFormMerchant] = useState('')
  const [formCategory, setFormCategory] = useState('Food & Dining')
  const [formPayment,  setFormPayment]  = useState('Chase Unlimited')
  const [formAmount,   setFormAmount]   = useState('')

  // Unified transaction store (Plaid + manual), each tx has a stable id
  const [allTx,        setAllTx]        = useState([])
  const [accounts,     setAccounts]     = useState([])
  const [cardNameMap,   setCardNameMap]   = useState({})  // account_id -> display name
  const [cardColorMap,  setCardColorMap]  = useState({})  // display name -> color
  const [accountSettings, setAccountSettings] = useState({})  // account_id -> { custom_name, hidden }
  const [accountOrder, setAccountOrder] = useState([])
  const [dragOver, setDragOver] = useState(null)
  const [txLoading,     setTxLoading]     = useState(true)
  const [txError,       setTxError]       = useState('')
  const [dashBudgets,   setDashBudgets]   = useState({})
  const [editingCardId, setEditingCardId] = useState(null)
  const [editCardName,  setEditCardName]  = useState('')
  const [hoveredCardId, setHoveredCardId] = useState(null)

  useEffect(() => {
    async function loadTransactions() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setTxLoading(false); return }

      const res = await fetch(GET_TRANSACTIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await res.json()
      console.log('accounts from API:', data.accounts)

      if (!res.ok || !data.transactions) {
        setTxError('Failed to load transactions. Please refresh.')
        setTxLoading(false)
        return
      }

      // Build card name/color maps from accounts data
      const accountsData = data.accounts ?? []
      const localNameMap = {}
      const localColorMap = {}
      accountsData.forEach((a, i) => {
        const baseName = (a.official_name && a.official_name.trim()) ? a.official_name.trim() : (a.name ?? '')
        const displayName = baseName + (a.mask ? ` ••${a.mask}` : '')
        localNameMap[a.account_id] = displayName || `Card ••${a.mask ?? '????'}`
        localColorMap[localNameMap[a.account_id]] = CARD_PALETTE[i % CARD_PALETTE.length]
      })
      const mapped = data.transactions
        .filter(t => {
          const primary = t.personal_finance_category?.primary ?? ''
          const name = (t.merchant_name || t.name || '').toUpperCase()
          if (primary === 'LOAN_PAYMENTS') return false
          if (primary === 'TRANSFER_OUT' && !name.includes('ZELLE')) return false
          if (primary === 'TRANSFER_IN'  && !name.includes('ZELLE')) return false
          return true
        })
        .map(t => ({
          id:               t.transaction_id,
          date:             plaidDateToTxDate(t.date),
          merchant: (() => {
            const raw = t.merchant_name || t.name || ''
            return raw.replace(/\s+[A-Z0-9]{8,}\s*$/i, '').trim()
          })(),
          category:         plaidCategoryToGrove(t.personal_finance_category?.detailed ?? '', t.merchant_name || t.name),
          amount:           -t.amount, // Plaid positive = debit, negative = credit
          account_id:       t.account_id,
          source:           localNameMap[t.account_id] ?? 'Unknown Card',
          institution_name: t.institution_name ?? null,
        }))

        // Load overrides from Supabase and merge
        const { data: { user } } = await supabase.auth.getUser()
        setUser(user)
        const { data: overrides } = await supabase
          .from('transaction_overrides')
          .select('*')
          .eq('user_id', user.id)

        const overrideMap = {}
        ;(overrides || []).forEach(o => { overrideMap[o.transaction_id] = o })

        const withOverrides = mapped.map(t => ({
          ...t,
          ...(overrideMap[t.id] ? {
            category: overrideMap[t.id].category ?? t.category,
            merchant: overrideMap[t.id].name ?? t.merchant,
          } : {})
        }))

        const { data: deletedRows } = await supabase
          .from('deleted_transactions')
          .select('transaction_id')
          .eq('user_id', user.id)

        const deletedIds = new Set((deletedRows || []).map(r => r.transaction_id))
        const filteredTx = withOverrides.filter(t => !deletedIds.has(t.id))

        // Fetch account settings (custom names + hidden status)
        const { data: acctRows } = await supabase
          .from('account_settings')
          .select('account_id, custom_name, hidden, sort_order')
          .eq('user_id', user.id)

        const settingsMap = {}
        ;(acctRows || []).forEach(r => {
          settingsMap[r.account_id] = { custom_name: r.custom_name ?? null, hidden: r.hidden ?? false, sort_order: r.sort_order ?? 9999 }
        })

        // Apply custom name overrides to the name/color maps
        Object.entries(settingsMap).forEach(([accountId, s]) => {
          if (!s.custom_name) return
          const oldName = localNameMap[accountId]
          if (oldName && oldName !== s.custom_name) {
            const color = localColorMap[oldName]
            delete localColorMap[oldName]
            localColorMap[s.custom_name] = color
          }
          localNameMap[accountId] = s.custom_name
        })

        // Fetch manual transactions and merge with Plaid transactions
        const { data: manualRows } = await supabase
          .from('manual_transactions')
          .select('*')
          .eq('user_id', user.id)

        const manualTx = (manualRows || []).map(r => ({
          id:       r.id,
          date:     r.date,
          merchant: r.merchant,
          category: r.category,
          amount:   r.amount,
          source:   r.source,
          isManual: true,
        }))

        const plaidTx = filteredTx.map(t => ({
          ...t,
          source: localNameMap[t.account_id] ?? t.source,
        }))

        setAllTx([...plaidTx, ...manualTx])
        setAccounts(data.accounts ?? [])
        setCardNameMap({ ...localNameMap })
        setCardColorMap({ ...localColorMap })
        setAccountSettings(settingsMap)
        const ordered = [...(data.accounts ?? [])].sort((a, b) => {
          const aOrder = settingsMap[a.account_id]?.sort_order ?? 9999
          const bOrder = settingsMap[b.account_id]?.sort_order ?? 9999
          return aOrder - bOrder
        })
        setAccountOrder(ordered.map(a => a.account_id))
        setTxLoading(false)
    }

    loadTransactions()
  }, [])

  useEffect(() => {
    if (txLoading) return
    async function fetchBudgets() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('budgets').select('*').eq('user_id', user.id)
      const map = {}
      ;(data || []).forEach(b => { map[b.category] = b.monthly_limit })
      setDashBudgets(map)
    }
    fetchBudgets()
  }, [txLoading])

  // Q2 Category / Card toggle
  const [catCardView, setCatCardView] = useState('category')

  // Inline row editing
  const [expandedRow, setExpandedRow] = useState(null)

  // Click-outside handlers
  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowDropdown(false)
      if (showDatePicker &&
          datePickerRef.current && !datePickerRef.current.contains(e.target) &&
          dateBtnRef.current   && !dateBtnRef.current.contains(e.target))
        setShowDatePicker(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showDatePicker])

  const openDatePicker = useCallback(() => {
    if (!showDatePicker) {
      const rect = dateBtnRef.current.getBoundingClientRect()
      setDatePickerPos({ top: rect.bottom + 6, left: rect.left })
    }
    setShowDatePicker(s => !s)
  }, [showDatePicker])

  const applyPreset = (id) => {
    const range = getPresetRange(id)
    setSelectedPeriod({ preset: id, ...range })
    setCustomStart(toInputDate(range.start))
    setCustomEnd(toInputDate(range.end))
    setSortCol('date'); setSortDir('desc')
    setShowDatePicker(false)
  }

  const applyCustom = () => {
    if (!customStart || !customEnd) return
    const start = fromInputDate(customStart), end = fromInputDate(customEnd)
    if (start > end) return
    setSelectedPeriod({ preset: 'custom', start, end })
    setSortCol('date'); setSortDir('desc')
    setShowDatePicker(false)
  }

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_profile').select('display_name, avatar_url, hamilton_style').eq('user_id', user.id).single()
      if (data) {
        const rawAvatar = data.avatar_url ?? ''
        // FIX 3: always cache-bust on load so a freshly uploaded photo isn't served stale
        const avatar_url = rawAvatar
          ? `${rawAvatar.split('?')[0]}?t=${Date.now()}`
          : ''
        setProfile({ display_name: data.display_name ?? '', avatar_url, hamilton_style: data.hamilton_style ?? 'default' })
        if (avatar_url) setAvatarUrl(avatar_url)
        setSettingName(data.display_name ?? '')
        setSettingStyle(data.hamilton_style ?? 'default')
      }
    }
    loadProfile()
  }, [])

  const handleSaveProfile = async () => {
    setSettingSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()

      let avatar_url = profile.avatar_url ?? null

      if (pendingAvatarFile) {
        const path = `${user.id}.jpg`
        const { error: upErr } = await supabase.storage
          .from('avatars')
          .upload(path, pendingAvatarFile, { contentType: 'image/jpeg', upsert: true })
        if (!upErr) {
          const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path)
          avatar_url = `${urlData.publicUrl}?t=${Date.now()}`
        }
      }

      await supabase.from('user_profile').upsert({
        user_id: user.id,
        display_name: settingName,
        avatar_url: avatar_url ? avatar_url.split('?')[0] : null,
        hamilton_style: settingStyle,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

      setAvatarUrl(avatar_url)
      setProfile(prev => ({ ...prev, display_name: settingName, avatar_url }))
      setPendingAvatarFile(null)
      setCropPreviewUrl(null)
      setShowSettings(false)
    } finally {
      setSettingSaving(false)
    }
  }

  const handleAddExpense = async (e) => {
    e.preventDefault()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const newTx = {
      user_id:  user.id,
      date:     toTxDateStr(fromInputDate(formDate)),
      merchant: formMerchant.trim(),
      category: formCategory,
      amount:   parseFloat(formAmount),
      source:   formPayment,
    }

    const { data, error } = await supabase
      .from('manual_transactions')
      .insert(newTx)
      .select()
      .single()

    if (!error && data) {
      setAllTx(prev => [...prev, { ...newTx, id: data.id, isManual: true }])
    }

    setShowAddModal(false)
    setFormMerchant(''); setFormAmount('')
    setFormDate(toInputDate(new Date()))
    setFormCategory('Food & Dining'); setFormPayment('Chase Unlimited')
  }

  const handleEditTx = async (id, updated) => {
    setAllTx(prev => prev.map(t => t.id === id ? { ...t, ...updated, isManual: t.isManual } : t))
    const { data: { user } } = await supabase.auth.getUser()
    const tx = allTx.find(t => t.id === id)
    if (tx?.isManual) {
      await supabase.from('manual_transactions').update({
        merchant: updated.merchant,
        category: updated.category,
        amount:   updated.amount,
        source:   updated.source,
        date:     updated.date,
      }).eq('id', id).eq('user_id', user.id)
    } else {
      await supabase.from('transaction_overrides').upsert({
        user_id:        user.id,
        transaction_id: id,
        category:       updated.category,
        name:           updated.merchant,
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'user_id,transaction_id' })
    }
  }

  const handleDeleteTx = async (id) => {
    const tx = allTx.find(t => t.id === id)
    setAllTx(prev => prev.filter(t => t.id !== id))
    const { data: { user } } = await supabase.auth.getUser()
    if (tx?.isManual) {
      await supabase.from('manual_transactions').delete().eq('id', id).eq('user_id', user.id)
    } else {
      await supabase.from('deleted_transactions').upsert({
        user_id:        user.id,
        transaction_id: id,
      }, { onConflict: 'user_id,transaction_id' })
    }
  }

  // ── Card settings handlers ────────────────────────────────────────────────────
  const handleRenameAccount = async (accountId, newName) => {
    const trimmed = (newName || '').trim()
    setEditingCardId(null)
    const oldName = cardNameMap[accountId]
    const color = cardColorMap[oldName] ?? CARD_PALETTE[0]
    const resolvedName = trimmed || (() => {
      const acct = accounts.find(a => a.account_id === accountId)
      return acct
        ? ((acct.official_name?.trim() || acct.name || '') + (acct.mask ? ` ••${acct.mask}` : '')) || `Card ••${acct.mask ?? '????'}`
        : oldName
    })()
    setAccountSettings(prev => ({ ...prev, [accountId]: { ...prev[accountId], custom_name: trimmed || null } }))
    setCardNameMap(prev => ({ ...prev, [accountId]: resolvedName }))
    setCardColorMap(prev => { const n = { ...prev }; delete n[oldName]; n[resolvedName] = color; return n })
    setAllTx(prev => prev.map(t => t.account_id === accountId ? { ...t, source: resolvedName } : t))
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('account_settings').upsert({
      user_id: user.id,
      account_id: accountId,
      custom_name: trimmed || null,
      hidden: accountSettings[accountId]?.hidden ?? false,
    }, { onConflict: 'user_id,account_id' })
  }

  const handleToggleHideAccount = async (accountId) => {
    const current = accountSettings[accountId]?.hidden ?? false
    const next = !current
    setAccountSettings(prev => ({ ...prev, [accountId]: { ...prev[accountId], hidden: next } }))
    const { data: { user } } = await supabase.auth.getUser()
    await supabase.from('account_settings').upsert({
      user_id: user.id,
      account_id: accountId,
      custom_name: accountSettings[accountId]?.custom_name ?? null,
      hidden: next,
    }, { onConflict: 'user_id,account_id' })
  }

  const handleReorder = async (newOrderIds) => {
    setAccountOrder(newOrderIds)
    const { data: { user } } = await supabase.auth.getUser()
    const upserts = newOrderIds.map((accountId, i) => ({
      user_id: user.id,
      account_id: accountId,
      custom_name: accountSettings[accountId]?.custom_name ?? null,
      hidden: accountSettings[accountId]?.hidden ?? false,
      sort_order: i,
    }))
    await supabase.from('account_settings').upsert(upserts, { onConflict: 'user_id,account_id' })
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const transactions = useMemo(() => {
    return allTx.filter(t => {
      if (accountSettings[t.account_id]?.hidden) return false
      const d = parseTxDate(t.date)
      return d >= selectedPeriod.start && d <= selectedPeriod.end
    })
  }, [allTx, selectedPeriod, accountSettings])

  const byCategory = useMemo(() => {
    const map = {}
    transactions.filter(t => t.amount < 0)
      .forEach(t => { map[t.category] = (map[t.category] || 0) + Math.abs(t.amount) })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }, [transactions])

  const byCard = useMemo(() => {
    const map = {}
    transactions.filter(t => t.amount < 0)
      .forEach(t => { map[t.source] = (map[t.source] || 0) + Math.abs(t.amount) })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }, [transactions])

  const handleSort = (col) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
  }

  const sortedTx = useMemo(() => [...transactions].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'date')          cmp = parseTxDate(a.date) - parseTxDate(b.date)
    else if (sortCol === 'merchant') cmp = a.merchant.localeCompare(b.merchant)
    else if (sortCol === 'category') cmp = a.category.localeCompare(b.category)
    else if (sortCol === 'amount')   cmp = Math.abs(a.amount) - Math.abs(b.amount)
    return sortDir === 'asc' ? cmp : -cmp
  }), [transactions, sortCol, sortDir])

  // Enriched account list for source selectors — { name: display name, hidden: bool }
  const sourceAccounts = useMemo(() =>
    accountOrder
      .map(id => ({ name: cardNameMap[id] ?? '', hidden: accountSettings[id]?.hidden ?? false }))
      .filter(a => a.name),
    [accountOrder, cardNameMap, accountSettings]
  )

  // Sync formPayment default once accounts load (in case 'Chase Unlimited' doesn't exist)
  useEffect(() => {
    if (sourceAccounts.length > 0 && formPayment === 'Chase Unlimited' && !sourceAccounts.find(a => a.name === 'Chase Unlimited')) {
      setFormPayment(sourceAccounts.filter(a => !a.hidden)[0]?.name ?? formPayment)
    }
  }, [sourceAccounts])   // eslint-disable-line react-hooks/exhaustive-deps

  const totalSpent    = transactions.filter(t => t.amount < 0).reduce((s, t) => s + (isNaN(t.amount) ? 0 : Math.abs(t.amount)), 0)
  const purchaseCount = transactions.filter(t => t.amount < 0).length
  const topCategory   = byCategory[0]?.name  ?? '—'
  const topCatAmt     = byCategory[0]?.value ?? 0

  const overBudgetCats = useMemo(() => {
    const set = new Set()
    byCategory.forEach(({ name, value }) => {
      if (dashBudgets[name] != null && value > dashBudgets[name]) set.add(name)
    })
    return set
  }, [byCategory, dashBudgets])
  const rangeDays     = Math.max(1, Math.ceil((selectedPeriod.end - selectedPeriod.start) / (1000*60*60*24)) + 1)
  const dailyAvg      = totalSpent / rangeDays

  const hamiltonContext = useMemo(() => {
    // Current period summary (what's on screen)
    const periodLabel = selectedPeriod.label ?? 'current period'
    const catLines = byCategory.map(c => {
      const budget = dashBudgets[c.name]
      const over = budget != null && c.value > budget
      return `- ${c.name}: $${c.value.toFixed(2)}${budget != null ? ` (budget: $${budget}, ${over ? 'OVER by $' + (c.value - budget).toFixed(2) : 'under budget'})` : ''}`
    }).join('\n')

    // Build full history summary from allTx
    const allSpending = allTx.filter(t => t.amount < 0)

    // Monthly totals per category across all time
    const monthlyMap = {}
    allSpending.forEach(t => {
      const [m, , y] = t.date.split('/')
      const monthKey = `${y}-${m.padStart(2, '0')}`
      if (!monthlyMap[monthKey]) monthlyMap[monthKey] = {}
      if (!monthlyMap[monthKey][t.category]) monthlyMap[monthKey][t.category] = 0
      monthlyMap[monthKey][t.category] += Math.abs(t.amount)
    })

    const monthlyLines = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cats]) => {
        const total = Object.values(cats).reduce((s, v) => s + v, 0)
        const catBreakdown = Object.entries(cats)
          .sort(([,a],[,b]) => b - a)
          .map(([cat, amt]) => `    ${cat}: $${amt.toFixed(2)}`)
          .join('\n')
        return `${month} (total: $${total.toFixed(2)}):\n${catBreakdown}`
      }).join('\n\n')

    // All-time category totals
    const allTimeCats = {}
    allSpending.forEach(t => {
      if (!allTimeCats[t.category]) allTimeCats[t.category] = 0
      allTimeCats[t.category] += Math.abs(t.amount)
    })
    const allTimeTotal = Object.values(allTimeCats).reduce((s, v) => s + v, 0)
    const allTimeCatLines = Object.entries(allTimeCats)
      .sort(([,a],[,b]) => b - a)
      .map(([cat, amt]) => `- ${cat}: $${amt.toFixed(2)}`)
      .join('\n')

    // Date range of available data
    const dates = allSpending.map(t => {
      const [m, d, y] = t.date.split('/')
      return new Date(+y, +m - 1, +d)
    })
    const earliest = dates.length ? new Date(Math.min(...dates)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'unknown'
    const latest = dates.length ? new Date(Math.max(...dates)).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'unknown'

    return `User's Grove finance data:

DATA RANGE: ${earliest} to ${latest}

CURRENT VIEW (${periodLabel}):
Total spent: $${totalSpent.toFixed(2)}
Transactions: ${purchaseCount}
Daily average: $${dailyAvg.toFixed(2)}
Top category: ${topCategory} ($${topCatAmt.toFixed(2)})
Over-budget categories: ${[...overBudgetCats].join(', ') || 'none'}

Spending by category this period:
${catLines}

ALL-TIME TOTALS (${earliest} to ${latest}):
Total spent: $${allTimeTotal.toFixed(2)}
By category:
${allTimeCatLines}

FULL MONTHLY BREAKDOWN:
${monthlyLines}

Use all this data to answer questions accurately. If asked about a specific time period or month, calculate from the monthly breakdown.`
  }, [allTx, byCategory, dashBudgets, overBudgetCats, totalSpent, purchaseCount, dailyAvg, topCategory, topCatAmt, selectedPeriod])

  const displayName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'

  const sortedAccounts = useMemo(() => {
    const visibleIds = accountOrder.filter(id => !(accountSettings[id]?.hidden ?? false))
    const hiddenIds  = accountOrder.filter(id =>   accountSettings[id]?.hidden ?? false)
    const unseenIds  = accounts.map(a => a.account_id).filter(id => !accountOrder.includes(id))
    const finalOrder = [...visibleIds, ...unseenIds, ...hiddenIds]
    return finalOrder.map(id => accounts.find(a => a.account_id === id)).filter(Boolean)
  }, [accountOrder, accountSettings, accounts])

  return (
    <div>
      <style>{`
        @keyframes fadeIn { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:scale(1) } }
        @keyframes hamiltonWiggle {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(-8deg); }
          40%  { transform: rotate(8deg); }
          60%  { transform: rotate(-4deg); }
          80%  { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>

      <div className="h-screen flex flex-col antialiased overflow-hidden"
        style={{ backgroundColor: 'var(--color-bg)' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="shrink-0 relative z-10 px-7 py-3.5 flex items-center justify-between"
          style={{ backgroundColor: 'var(--color-bg)' }}>
          <div className="flex items-center gap-3">
            <LeafIcon size={32} />
            <div>
              <h1 className="text-[17px] font-semibold leading-none" style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>Grove</h1>
              <p className="text-[11px] mt-0.5 leading-none" style={{ color: 'var(--color-muted-text)' }}>Grow your wealth, naturally.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => navigate('/budgets')}
              style={{
                backgroundColor: overBudgetCats.size === 0
                  ? 'hsl(145, 38%, 34%)'
                  : overBudgetCats.size <= 2
                  ? 'hsl(42, 68%, 58%)'
                  : 'hsl(0, 65%, 50%)',
                color: '#fff',
                border: 'none', borderRadius: 999, padding: '6px 14px',
                fontSize: 13, fontWeight: 600, cursor: 'pointer',
                fontFamily: "'DM Sans', sans-serif",
              }}>
              {overBudgetCats.size === 0 ? `✓ 0 over budget` : `⚠ ${overBudgetCats.size} over budget`}
            </button>
            <button
              onClick={() => navigate('/onboarding')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-colors"
              style={{ backgroundColor: 'var(--color-muted-bg)', color: 'var(--color-fg)', cursor: 'pointer' }}
              onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
              onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}>
              <Plus size={11} /> Add bank
            </button>
            <div className="relative group">
              <button className="w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-colors"
                style={{ color: 'var(--color-muted-text)', cursor: 'pointer' }}
                onClick={() => setHamiltonOpen(true)}
                onMouseEnter={() => setHamiltonHovered(true)}
                onMouseLeave={() => setHamiltonHovered(false)}>
                <img src={hamiltonIcon} alt="Hamilton AI" style={{ width: 30, height: 30, animation: hamiltonHovered ? 'hamiltonWiggle 0.4s ease forwards' : 'none' }} />
              </button>
              <div className="pointer-events-none absolute right-0 top-full mt-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50 border"
                style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}>
                Hamilton AI
              </div>
            </div>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setShowDropdown(s => !s)}
                className="text-[13px] font-bold text-white transition-colors hover:opacity-90"
                style={{
                  width: 36, height: 36, borderRadius: '50%',
                  overflow: 'hidden', padding: 0, border: 'none', cursor: 'pointer',
                  backgroundColor: avatarUrl ? 'transparent' : 'var(--color-primary)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar"
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                      onError={() => setAvatarUrl(null)}
                    />
                  : (profile.display_name?.[0]?.toUpperCase() || 'P')}
              </button>
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border shadow-2xl overflow-hidden z-50"
                  style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--color-border)' }}>
                    <p className="text-[13px] font-semibold" style={{ color: 'var(--color-fg)' }}>Pingoo</p>
                    <p className="text-[11px]" style={{ color: 'var(--color-muted-text)' }}>Personal account</p>
                  </div>
                  <button onClick={() => { setCropPreviewUrl(profile.avatar_url || null); setShowSettings(true); setShowDropdown(false) }} className="w-full text-left px-4 py-2.5 text-[12px] transition-colors hover:opacity-80"
                    style={{ color: 'var(--color-fg)', cursor: 'pointer' }}>Settings</button>
                  <button onClick={handleSignOut} className="w-full text-left px-4 py-2.5 text-[12px] text-red-600 transition-colors hover:opacity-80" style={{ cursor: 'pointer' }}>Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── 2×2 grid ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden p-4 relative">
          {txLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center"
              style={{ backgroundColor: 'var(--color-bg)' }}>
              <p className="text-[14px]" style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
                Loading transactions…
              </p>
            </div>
          )}
          {txError && !txLoading && (
            <div className="absolute inset-0 z-20 flex items-center justify-center">
              <p className="text-[14px]" style={{ color: 'hsl(0,65%,50%)', fontFamily: "'DM Sans', sans-serif" }}>
                {txError}
              </p>
            </div>
          )}
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-0">

            {/* Q1 — Total Spent */}
            <Card title="Total Spent">
              <div className="flex flex-col h-full">
                {/* Row: date toggle left | big amount + stats right */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <button ref={dateBtnRef} onClick={openDatePicker}
                      className="flex items-center gap-1 text-[11px] font-medium transition-colors"
                      style={{ color: 'var(--color-muted-text)', marginBottom: 4, cursor: 'pointer' }}>
                      {formatRangeLabel(selectedPeriod.preset, selectedPeriod.start, selectedPeriod.end)}
                      <ChevronDown size={11} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                    </button>
                    <p className="text-5xl font-bold tracking-tight tabular-nums leading-none" style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>
                      ${totalSpent.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
                    </p>
                  </div>
                  <div style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', marginBottom: 6 }}>Daily Avg</span>
                      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display', serif", color: 'var(--color-fg)' }}>${dailyAvg.toFixed(2)}</span>
                      <div style={{ height: 18 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', marginBottom: 6 }}>Transactions</span>
                      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display', serif", color: 'var(--color-fg)' }}>{purchaseCount}</span>
                      <div style={{ height: 18 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.15em', color: 'var(--color-primary)', fontFamily: "'DM Sans', sans-serif", textTransform: 'uppercase', marginBottom: 6 }}>Top Category</span>
                      <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "'Playfair Display', serif", color: 'var(--color-fg)' }}>{topCategory}</span>
                      <span style={{ fontSize: 12, color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif", marginTop: 2 }}>${topCatAmt.toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                <div className="w-full h-px mb-3" style={{ backgroundColor: 'var(--color-border)' }} />
                <div className="flex-1 min-h-0">
                  <p className="text-[11px] uppercase tracking-wide mb-2"
                    style={{ color: 'var(--color-muted-text)', fontFamily: "'DM Sans', sans-serif" }}>
                    Banks &amp; Credit / Debit Cards:
                  </p>
                  <div className="space-y-1" style={{ maxHeight: 160, overflowY: 'auto' }}>
                    {sortedAccounts.map((acct, _i) => {
                      const accountId = acct.account_id
                      const plaidName = cardNameMap[accountId] ?? ((acct.official_name?.trim() || acct.name || '') + (acct.mask ? ` ••${acct.mask}` : ''))
                      const isHidden = accountSettings[accountId]?.hidden ?? false
                      const displayName = accountSettings[accountId]?.custom_name || plaidName
                      const color = cardColorMap[plaidName] ?? cardColorMap[displayName] ?? CARD_PALETTE[0]
                      const amt = allTx.filter(t => t.account_id === accountId && t.amount < 0
                        && parseTxDate(t.date) >= selectedPeriod.start && parseTxDate(t.date) <= selectedPeriod.end)
                        .reduce((s, t) => s + Math.abs(t.amount), 0)
                      const isEditingThis = editingCardId === accountId
                      const isHovered = hoveredCardId === accountId
                      return (
                        <div key={accountId}
                          data-acct-row=""
                          onDragOver={!isHidden ? (e) => {
                            e.preventDefault()
                            setDragOver(accountId)
                          } : undefined}
                          onDragLeave={!isHidden ? () => setDragOver(null) : undefined}
                          onDrop={!isHidden ? (e) => {
                            e.preventDefault()
                            setDragOver(null)
                            const fromId = e.dataTransfer.getData('text/plain')
                            if (fromId === accountId) return
                            const currentVisible = accountOrder.filter(id => !(accountSettings[id]?.hidden ?? false))
                            const fromIdx = currentVisible.indexOf(fromId)
                            const toIdx   = currentVisible.indexOf(accountId)
                            if (fromIdx === -1 || toIdx === -1) return
                            const reordered = [...currentVisible]
                            reordered.splice(fromIdx, 1)
                            reordered.splice(toIdx, 0, fromId)
                            const hidden = accountOrder.filter(id => accountSettings[id]?.hidden ?? false)
                            handleReorder([...reordered, ...hidden])
                          } : undefined}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, opacity: isHidden ? 0.4 : 1, transition: 'opacity 0.15s', outline: dragOver === accountId ? '2px solid hsl(145,38%,34%)' : 'none', borderRadius: 8 }}
                          onMouseEnter={() => setHoveredCardId(accountId)}
                          onMouseLeave={() => setHoveredCardId(null)}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                            <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: color, flexShrink: 0, display: 'inline-block' }} />
                            {isEditingThis ? (
                              <>
                                <input
                                  autoFocus
                                  value={editCardName}
                                  onChange={e => setEditCardName(e.target.value)}
                                  onBlur={() => handleRenameAccount(accountId, editCardName)}
                                  onKeyDown={e => {
                                    if (e.key === 'Enter') handleRenameAccount(accountId, editCardName)
                                    if (e.key === 'Escape') setEditingCardId(null)
                                  }}
                                  style={{
                                    borderBottom: '1px solid var(--color-border)', background: 'transparent',
                                    fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                                    color: 'var(--color-fg)', outline: 'none', width: 150,
                                  }}
                                />
                                <button onClick={() => handleRenameAccount(accountId, editCardName)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-primary)', padding: 0 }}>✓</button>
                                <button onClick={() => setEditingCardId(null)}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-muted-text)', padding: 0 }}>✕</button>
                              </>
                            ) : (
                              <>
                                <span
                                  draggable={!isHidden}
                                  onDragStart={!isHidden ? (e) => {
                                    e.dataTransfer.setData('text/plain', accountId)
                                    e.currentTarget.closest('[data-acct-row]').style.opacity = '0.4'
                                  } : undefined}
                                  onDragEnd={!isHidden ? (e) => {
                                    e.currentTarget.closest('[data-acct-row]').style.opacity = isHidden ? '0.4' : '1'
                                    setDragOver(null)
                                  } : undefined}
                                  style={{ fontSize: 14, fontWeight: 700, color: 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: isHidden ? 'line-through' : 'none', cursor: isHidden ? 'default' : 'grab' }}>
                                  {displayName}
                                </span>
                                {isHovered && (
                                  <>
                                    <button
                                      onClick={() => { setEditingCardId(accountId); setEditCardName(displayName) }}
                                      title="Rename"
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-muted-text)', padding: 0, lineHeight: 1, flexShrink: 0 }}>
                                      ✎
                                    </button>
                                    <button
                                      onClick={() => handleToggleHideAccount(accountId)}
                                      title={isHidden ? 'Show' : 'Hide'}
                                      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--color-muted-text)', padding: 0, lineHeight: 1, flexShrink: 0 }}>
                                      {isHidden ? '👁' : '🚫'}
                                    </button>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                          {!isEditingThis && (
                            <span style={{ fontSize: 14, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", color: 'var(--color-fg)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                              ${amt.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
                            </span>
                          )}
                        </div>
                      )
                    })}
                    </div>{/* end scrollable */}
                  </div>{/* end flex-1 */}
              </div>
            </Card>

            {/* Q2 — Spending by Category / Card */}
            <Card title="Spending by Category" colDivider
              action={
                <div className="flex items-center gap-0.5 rounded-lg p-0.5"
                  style={{ backgroundColor: 'var(--color-muted-bg)' }}>
                  {['category', 'card'].map(v => (
                    <button key={v} onClick={() => setCatCardView(v)}
                      className="px-2.5 py-1 rounded-md text-[10px] font-semibold capitalize transition-colors"
                      style={catCardView === v
                        ? { backgroundColor: 'var(--color-bg-card)', color: 'var(--color-fg)', boxShadow: '0 1px 2px rgba(0,0,0,0.08)', cursor: 'pointer' }
                        : { color: 'var(--color-muted-text)', cursor: 'pointer' }}>
                      {v === 'category' ? 'Category' : 'Card'}
                    </button>
                  ))}
                </div>
              }
            >
              {catCardView === 'category' ? (
                <CategorySection
                  byCategory={byCategory}
                  totalSpent={totalSpent}
                  transactions={transactions}
                  budgetLimits={dashBudgets}
                  onEditTx={(id, updated) => handleEditTx(id, updated)}
                  onDeleteTx={(id) => handleDeleteTx(id)}
                  accounts={sourceAccounts}
                />
              ) : (
                <CardSection
                  byCard={byCard}
                  totalSpent={totalSpent}
                  transactions={transactions}
                  cardColorMap={cardColorMap}
                  onEditTx={(id, updated) => handleEditTx(id, updated)}
                  onDeleteTx={(id) => handleDeleteTx(id)}
                  accounts={sourceAccounts}
                />
              )}
            </Card>

            {/* Q3 — Transactions */}
            <Card title="Transactions" divider action={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="text-[10px]" style={{ color: 'var(--color-muted-text)' }}>{sortedTx.length} entries</span>
                <button
                  onClick={() => setShowAddModal(true)}
                  style={{
                    width: 22, height: 22,
                    borderRadius: 6,
                    border: '1.5px solid var(--color-border)',
                    backgroundColor: 'transparent',
                    color: 'var(--color-primary)',
                    fontSize: 16,
                    lineHeight: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  title="Add transaction"
                >+</button>
              </div>
            }>
              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 z-10" style={{ backgroundColor: 'var(--color-bg)' }}>
                    <tr>
                      {[
                        { col: 'date',     label: 'Date',     cls: 'pr-3 text-left' },
                        { col: 'merchant', label: 'Merchant', cls: 'pr-3 text-left' },
                        { col: 'category', label: 'Category', cls: 'pr-3 text-left' },
                        { col: 'source',   label: 'Card',     cls: 'pr-3 text-left', noSort: true },
                        { col: 'amount',   label: 'Amount',   cls: 'text-right' },
                      ].map(({ col, label, cls, noSort }) => {
                        const isActive = sortCol === col
                        return (
                          <th key={col}
                            className={`pb-2.5 ${cls} text-[10px] font-bold uppercase tracking-widest transition-colors select-none
                              ${!noSort ? 'cursor-pointer' : ''}`}
                            style={{ color: isActive ? 'var(--color-fg)' : 'var(--color-muted-text)' }}
                            onClick={noSort ? undefined : () => handleSort(col)}>
                            {label}
                            {!noSort && (
                              <span className={`ml-1 ${isActive ? 'opacity-100' : 'opacity-25'}`}>
                                {isActive ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                              </span>
                            )}
                          </th>
                        )
                      })}
                    </tr>
                    <tr><td colSpan={5}><div className="h-px w-full mb-1" style={{ backgroundColor: 'var(--color-border)' }} /></td></tr>
                  </thead>
                  <tbody>
                    {sortedTx.map((t) => {
                      const isExpanded  = expandedRow === t.id
                      return (
                        <Fragment key={t.id}>
                          <tr
                            className="cursor-pointer transition-colors select-none"
                            style={{ backgroundColor: isExpanded ? 'var(--color-muted-bg)' : 'transparent' }}
                            onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)' }}
                            onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent' }}
                            onClick={() => setExpandedRow(r => r === t.id ? null : t.id)}>
                            <td className="py-2 pr-3 text-[11px] whitespace-nowrap tabular-nums" style={{ color: 'var(--color-muted-text)' }}>{t.date}</td>
                            <td className="py-2 pr-3 max-w-[130px]">
                              <span className="block truncate text-[12px] font-medium" style={{ color: 'var(--color-fg)' }} title={t.merchant}>{t.merchant}</span>
                              {t.institution_name && (
                              <span className="block truncate text-[10px]" style={{ color: 'var(--color-muted-text)' }}>{t.institution_name}</span>
                              )}
                            </td>
                            <td className="py-2 pr-3">
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                style={{ backgroundColor:(COLORS[t.category]??'hsl(140, 16%, 68%)')+'20', color:COLORS[t.category]??'hsl(140, 16%, 50%)' }}>
                                {t.category}
                              </span>
                            </td>
                            <td className="py-2 pr-3">
                              {(() => {
                                const c = cardColorMap[t.source] ?? 'hsl(140, 16%, 68%)'
                                return (
                                  <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                                    style={{ backgroundColor: c + '28', color: c }}>
                                    {t.source}
                                  </span>
                                )
                              })()}
                            </td>
                            <td className={`py-2 text-right text-[12px] font-semibold tabular-nums ${t.amount < 0 ? 'text-red-600' : ''}`}
                              style={t.amount >= 0 ? { color: 'var(--color-primary)' } : {}}>
                              {t.amount < 0 ? `-$${Math.abs(t.amount).toFixed(2)}` : `+$${t.amount.toFixed(2)}`}
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr>
                              <td colSpan={5} className="p-0">
                                <TxEditForm
                                  tx={t}
                                  onSave={(updated) => { handleEditTx(t.id, updated); setExpandedRow(null) }}
                                  onDelete={() => { handleDeleteTx(t.id); setExpandedRow(null) }}
                                  onCancel={() => setExpandedRow(null)}
                                  accounts={sourceAccounts}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Q4 — Trends */}
            <Card title="Trends" divider colDivider>
              <TrendsSection
                allTx={allTx}
                selectedPeriod={selectedPeriod}
                rangeDays={rangeDays}
              />
            </Card>

          </div>
        </main>

        <HamiltonAI
          isOpen={hamiltonOpen}
          onClose={() => setHamiltonOpen(false)}
          userName={displayName}
          displayName={profile.display_name}
          hamiltonStyle={profile.hamilton_style}
          financialContext={hamiltonContext}
        />
      </div>

      {/* ── Date Range Picker ─────────────────────────────────────────────────── */}
      {showDatePicker && (
        <div ref={datePickerRef}
          className="rounded-2xl border shadow-2xl overflow-hidden"
          style={{ position:'fixed', top:datePickerPos.top, left:datePickerPos.left, zIndex:200, width:'18rem', backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
          <div className="p-3 grid grid-cols-2 gap-1.5">
              {PRESETS.map(p => (
                <button key={p.id} onClick={() => applyPreset(p.id)}
                  className="px-3 py-2 rounded-lg text-[11px] font-semibold text-left transition-colors"
                  style={selectedPeriod.preset === p.id
                    ? { backgroundColor: 'var(--color-primary)', color: 'white', cursor: 'pointer' }
                    : { color: 'var(--color-fg)', cursor: 'pointer' }}
                  onMouseEnter={e => { if (selectedPeriod.preset !== p.id) e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)' }}
                  onMouseLeave={e => { if (selectedPeriod.preset !== p.id) e.currentTarget.style.backgroundColor = 'transparent' }}>
                  {p.label}
                </button>
              ))}
            </div>
            <div className="h-px mx-3" style={{ backgroundColor: 'var(--color-border)' }} />
            <div className="p-3 space-y-2">
              <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--color-muted-text)' }}>Custom Range</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: 'var(--color-muted-text)' }}>From</label>
                  <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
                <div>
                  <label className="block text-[10px] mb-1" style={{ color: 'var(--color-muted-text)' }}>To</label>
                  <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={inputCls} style={{ ...inputStyle, cursor: 'pointer' }} />
                </div>
              </div>
              <button onClick={applyCustom}
                className="w-full mt-1 py-2 rounded-lg text-white text-[12px] font-semibold transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)', cursor: 'pointer' }}>
                Apply
              </button>
            </div>
        </div>
      )}

      {/* ── Settings Modal ───────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) { setPendingAvatarFile(null); setShowSettings(false) } }}>
          <div className="w-full max-w-md mx-4 rounded-2xl border shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b shrink-0"
              style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>Settings</h2>
              <button onClick={() => { setPendingAvatarFile(null); setShowSettings(false) }}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-muted-text)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <X size={14} />
              </button>
            </div>
            <div className="px-6 py-5 space-y-5 overflow-y-auto flex-1">
              {/* Profile Photo */}
              <div>
                <p className="text-[11px] font-semibold mb-3" style={{ color: 'var(--color-muted-text)' }}>Profile Photo</p>
                <div className="flex items-center gap-4">
                  <div className="w-[60px] h-[60px] rounded-full overflow-hidden flex items-center justify-center text-[22px] font-bold text-white shrink-0"
                    style={{ backgroundColor: (cropPreviewUrl || profile.avatar_url) ? 'transparent' : 'var(--color-primary)' }}>
                    {cropPreviewUrl
                      ? <img src={cropPreviewUrl} alt="preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                          onError={() => setCropPreviewUrl(null)}
                        />
                      : profile.avatar_url
                        ? <img src={profile.avatar_url} alt="avatar"
                            style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                            onError={() => setProfile(p => ({ ...p, avatar_url: '' }))}
                          />
                        : (settingName?.[0]?.toUpperCase() || 'P')}
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors cursor-pointer"
                      style={{ backgroundColor: 'var(--color-muted-bg)', color: 'var(--color-fg)' }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}>
                      Upload photo
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        const file = e.target.files?.[0]
                        if (!file) return
                        const reader = new FileReader()
                        reader.onload = ev => {
                          setCropSrc(ev.target.result)
                          setCropFile(file)
                          setCropScale(1)
                          setCropOffset({ x: 0, y: 0 })
                          setShowCropModal(true)
                        }
                        reader.readAsDataURL(file)
                        e.target.value = ''
                      }} />
                    </label>
                    <button onClick={() => { setPendingAvatarFile(null); setCropPreviewUrl(null); setProfile(p => ({ ...p, avatar_url: '' })) }}
                      className="text-left text-[12px] font-semibold"
                      style={{ color: 'hsl(0, 65%, 50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                      Remove
                    </button>
                  </div>
                </div>
              </div>
              {/* Display Name */}
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Display Name</label>
                <p className="text-[11px] mb-2" style={{ color: 'var(--color-muted-text)' }}>This is what Hamilton AI will call you.</p>
                <input type="text" value={settingName} onChange={e => setSettingName(e.target.value)}
                  placeholder="Your name" className={inputCls} style={inputStyle} />
              </div>
              {/* Hamilton AI Style */}
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Hamilton AI Style</label>
                <p className="text-[11px] mb-2.5" style={{ color: 'var(--color-muted-text)' }}>Choose how Hamilton communicates with you.</p>
                <div className="flex flex-col gap-2">
                  {[
                    { id: 'default',   name: 'Default',         desc: 'Balanced and friendly, like a knowledgeable friend.' },
                    { id: 'concise',   name: 'Concise',         desc: 'Short and direct. No fluff, just the numbers.' },
                    { id: 'detailed',  name: 'Detailed',        desc: 'Deep dives with full breakdowns and context.' },
                    { id: 'hype',      name: 'Hype',            desc: 'Enthusiastic and encouraging about every win.' },
                    { id: 'roast',     name: 'Roast',           desc: 'Brutally honest about your spending. No filter.' },
                    { id: 'linmanuel', name: 'Lin-Manuel 🎭',   desc: 'Hamilton the musical energy — rise up, not throwing away your shot.' },
                  ].map(({ id, name, desc }) => {
                    const isSelected = settingStyle === id
                    return (
                      <button key={id} type="button" onClick={() => setSettingStyle(id)}
                        style={{
                          display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                          width: '100%', textAlign: 'left', padding: '10px 14px', borderRadius: 10,
                          border: `1.5px solid ${isSelected ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          backgroundColor: isSelected ? 'hsl(145, 38%, 34%, 0.08)' : 'transparent',
                          cursor: 'pointer', transition: 'border-color 0.15s, background-color 0.15s',
                        }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: isSelected ? 'var(--color-primary)' : 'var(--color-fg)', fontFamily: "'DM Sans', sans-serif" }}>{name}</span>
                        <span style={{ fontSize: 11, color: 'var(--color-muted-text)', marginTop: 2, fontFamily: "'DM Sans', sans-serif" }}>{desc}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5 shrink-0">
              <button onClick={handleSaveProfile} disabled={settingSaving}
                className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                style={{ backgroundColor: 'var(--color-primary)', opacity: settingSaving ? 0.7 : 1, cursor: settingSaving ? 'default' : 'pointer' }}>
                {settingSaving ? 'Saving…' : 'Save'}
              </button>
              <button type="button" onClick={() => { setPendingAvatarFile(null); setShowSettings(false) }}
                className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors"
                style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Crop Photo Modal ─────────────────────────────────────────────────── */}
      {showCropModal && (
        <div
          className="fixed inset-0 z-[500] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onMouseMove={e => {
            if (!cropIsDragging) return
            setCropOffset({ x: e.clientX - cropDragStart.x, y: e.clientY - cropDragStart.y })
          }}
          onMouseUp={() => setCropIsDragging(false)}
          onTouchMove={e => {
            if (!cropIsDragging) return
            const t = e.touches[0]
            setCropOffset({ x: t.clientX - cropDragStart.x, y: t.clientY - cropDragStart.y })
          }}
          onTouchEnd={() => setCropIsDragging(false)}
        >
          <div style={{
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 20, padding: 28,
            width: 320, fontFamily: "'DM Sans', sans-serif",
            boxShadow: '0 8px 40px rgba(0,0,0,0.18)',
          }}>
            <h3 style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 600, color: 'var(--color-fg)', margin: '0 0 20px' }}>
              Crop Photo
            </h3>

            {/* Circular preview */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <div
                style={{
                  width: 200, height: 200, borderRadius: '50%',
                  overflow: 'hidden', position: 'relative',
                  backgroundColor: 'var(--color-muted-bg)',
                  cursor: cropIsDragging ? 'grabbing' : 'grab',
                  userSelect: 'none', flexShrink: 0,
                }}
                onMouseDown={e => {
                  e.preventDefault()
                  setCropIsDragging(true)
                  setCropDragStart({ x: e.clientX - cropOffset.x, y: e.clientY - cropOffset.y })
                }}
                onTouchStart={e => {
                  const t = e.touches[0]
                  setCropIsDragging(true)
                  setCropDragStart({ x: t.clientX - cropOffset.x, y: t.clientY - cropOffset.y })
                }}
              >
                {cropSrc && (
                  <img
                    src={cropSrc}
                    alt="crop preview"
                    draggable={false}
                    style={{
                      position: 'absolute',
                      top: '50%', left: '50%',
                      transform: `translate(calc(-50% + ${cropOffset.x}px), calc(-50% + ${cropOffset.y}px)) scale(${cropScale})`,
                      transformOrigin: 'center center',
                      maxWidth: 'none',
                      pointerEvents: 'none',
                      userSelect: 'none',
                    }}
                  />
                )}
              </div>
            </div>

            {/* Zoom slider */}
            <div style={{ marginBottom: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-muted-text)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                Zoom
              </p>
              <input
                type="range" min={1} max={3} step={0.01}
                value={cropScale}
                onChange={e => setCropScale(parseFloat(e.target.value))}
                style={{ width: '100%', accentColor: 'var(--color-primary)' }}
              />
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => { setShowCropModal(false); setCropSrc(null); setCropFile(null) }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12,
                  border: '1px solid var(--color-border)',
                  backgroundColor: 'transparent', color: 'var(--color-fg)',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const canvas = document.createElement('canvas')
                  canvas.width = 200
                  canvas.height = 200
                  const ctx = canvas.getContext('2d')
                  const img = new Image()
                  img.onload = () => {
                    ctx.drawImage(
                      img,
                      100 + cropOffset.x - (img.naturalWidth * cropScale) / 2,
                      100 + cropOffset.y - (img.naturalHeight * cropScale) / 2,
                      img.naturalWidth * cropScale,
                      img.naturalHeight * cropScale
                    )
                    canvas.toBlob(blob => {
                      const croppedFile = new File([blob], 'avatar.jpg', { type: 'image/jpeg' })
                      setPendingAvatarFile(croppedFile)
                      setCropPreviewUrl(URL.createObjectURL(blob))
                      setShowCropModal(false)
                      setCropSrc(null)
                      setCropFile(null)
                    }, 'image/jpeg', 0.92)
                  }
                  img.src = cropSrc
                }}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 12,
                  border: 'none', backgroundColor: 'var(--color-primary)',
                  color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Use Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Expense Modal ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="w-full max-w-md mx-4 rounded-2xl border shadow-2xl"
            style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b"
              style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>Add Expense</h2>
              <button onClick={() => setShowAddModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg transition-colors"
                style={{ color: 'var(--color-muted-text)' }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Date</label>
                  <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)} className={inputCls} style={inputStyle} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Amount ($)</label>
                  <input type="number" required step="0.01" placeholder="0.00"
                    value={formAmount} onChange={e => setFormAmount(e.target.value)} className={inputCls} style={inputStyle} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Merchant</label>
                <input type="text" required placeholder="e.g. Chipotle"
                  value={formMerchant} onChange={e => setFormMerchant(e.target.value)} className={inputCls} style={inputStyle} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Category</label>
                  <select required value={formCategory} onChange={e => setFormCategory(e.target.value)} className={inputCls} style={inputStyle}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold mb-1.5" style={{ color: 'var(--color-muted-text)' }}>Payment Method</label>
                  <select value={formPayment} onChange={e => setFormPayment(e.target.value)} className={inputCls} style={inputStyle}>
                    {(sourceAccounts.length > 0
                      ? sourceAccounts.filter(a => !a.hidden).map(a => ({ value: a.name, label: a.label ?? a.name }))
                      : CARD_OPTIONS.map(o => ({ value: o, label: o }))
                    ).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              {formCategory && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
                  style={{ backgroundColor: 'var(--color-muted-bg)' }}>
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[formCategory] }} />
                  <span className="text-[11px]" style={{ color: 'var(--color-fg)' }}>
                    {formMerchant || 'Merchant'} · {formCategory}{formAmount ? ` · ${parseFloat(formAmount||0) >= 0 ? '+' : '-'}$${Math.abs(parseFloat(formAmount||0)).toFixed(2)}` : ''}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-colors hover:opacity-90"
                  style={{ backgroundColor: 'var(--color-primary)' }}>
                  Add Expense
                </button>
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border text-[13px] font-semibold transition-colors"
                  style={{ borderColor: 'var(--color-border)', color: 'var(--color-fg)' }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
