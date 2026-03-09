import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import {
  PieChart, Pie, Cell, Sector, Tooltip,
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { Moon, Sun, ChevronDown, X, Plus } from 'lucide-react'
import unlimitedRaw from './data/unlimited.CSV?raw'
import flexRaw from './data/flex.CSV?raw'

// ─── Constants ────────────────────────────────────────────────────────────────
const COLORS = {
  'Food & Dining':     '#f97316',
  'Groceries':         '#22c55e',
  'Events':            '#a855f7',
  'Subscriptions':     '#3b82f6',
  'Transport':         '#eab308',
  'Shopping':          '#ec4899',
  'Bills & Utilities': '#06b6d4',
  'Travel':            '#14b8a6',
  'Nightlife':         '#f43f5e',
  'Miscellaneous':     '#6b7280',
}
const CATEGORIES  = Object.keys(COLORS)

const PRESETS = [
  { id: 'this-month', label: 'This Month'   },
  { id: 'last-month', label: 'Last Month'   },
  { id: 'last-30',    label: 'Last 30 Days' },
  { id: 'last-90',    label: 'Last 90 Days' },
  { id: 'ytd',        label: 'Year to Date' },
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
    case 'ytd':        return { start: new Date(y,0,1),      end: new Date(today)      }
    default:           return { start: new Date(y,mo,1),     end: new Date(y,mo+1,0)   }
  }
}
function formatRangeLabel(preset, start, end) {
  if (preset === 'this-month' || preset === 'last-month')
    return start.toLocaleDateString('en-US', { month:'long', year:'numeric' })
  const fmt = d => d.toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })
  return `${fmt(start)} – ${fmt(end)}`
}

// ─── Keyword category mapping ─────────────────────────────────────────────────
function categorize(raw) {
  const d = raw.toUpperCase()
  if (/NETFLIX|SPOTIFY|HULU|DISNEY\+|APPLE\.COM\/BILL|AMAZON PRIME/.test(d)) return 'Subscriptions'
  if (/OPENAI|CHATGPT|CLAUDE\.AI/.test(d))                                     return 'Subscriptions'
  if (/GYMPASS/.test(d))                                                        return 'Subscriptions'
  if (/UBER.*(ONE|MEMBERSHIP)/.test(d))                                         return 'Subscriptions'
  if (/^TM \*|TICKETMASTER|^FGT\*|NITEHARTS|EDCVEGAS/.test(d))                 return 'Events'
  if (/AIRBNB|ALASKA AIR|ALASKA A\b|LA QUINTA|MARRIOTT|HILTON|HYATT|EXPEDIA/.test(d)) return 'Travel'
  if (/UBER.*TRIP|LYFT/.test(d))                                                return 'Transport'
  if (/CLIPPER|FASTRAK|BART|CALTRAIN/.test(d))                                  return 'Transport'
  if (/GASOLINE|COSTCO GAS|CHEVRON|ARCO|SHELL|EXXON|MOBIL/.test(d))            return 'Transport'
  if (/PARKING|GARAGE/.test(d))                                                 return 'Transport'
  if (/TAP HAUS|HANSHIN POCHA/.test(d))                                         return 'Nightlife'
  if (/COSTCO WHSE|TRADER JOE|WHOLE FOODS|SAFEWAY|KROGER|WALMART|KATHMANDU MARKET|BRUNO.S MARKET|SPROUTS|ALDI/.test(d)) return 'Groceries'
  if (/CHIPOTLE|TACO BELL|IN-N-OUT|MCDONALD|WENDY|SUBWAY|STARBUCKS/.test(d))   return 'Food & Dining'
  if (/DOORDASH|DD \*DOORDASH|GRUBHUB|UBEREATS/.test(d))                        return 'Food & Dining'
  if (/BAKERY|CAFE|COFFEE|BOBA|SUSHI|PHO|RAMEN|BURGER|PIZZA|NOODLE|GRILL|BISTRO|RESTAURANT|KITCHEN|CANTINA|DINER|RISTORANTE/.test(d)) return 'Food & Dining'
  if (/MATCHA|TEA|JUICE|YOGURT|ICE CREAM|CREAMERY|MALA|WINGS|GUKBAP|POCHA/.test(d)) return 'Food & Dining'
  if (/^SNACK\*|^TST\*|^HFS |^BCD-|JOE.*JUICE|85C |MENCHIE|PLENTEA|CHICK N|KUNG FU|SOMISOMI/.test(d)) return 'Food & Dining'
  if (/^SQ \*/.test(d) && !/SHOP|MARKET|STUDIO|SALON/.test(d))                 return 'Food & Dining'
  if (/TIKTOK SHOP|AMAZON(?! PRIME)|UNIQLO|WEVERSE|DEPOP|EBAY|ETSY/.test(d))   return 'Shopping'
  if (/WALGREENS|CVS|KNOTTY SHOP/.test(d))                                      return 'Shopping'
  if (/AT&T|VERIZON|COMCAST|PG&E|UTILITY|ELECTRICITY|WATER BILL/.test(d))      return 'Bills & Utilities'
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
function Card({ title, action, children }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-zinc-200 dark:border-white/[0.07] bg-white dark:bg-[#0e0e14]">
      <div className="flex items-center justify-between px-6 pt-5 pb-0 shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-zinc-400 dark:text-zinc-300">{title}</span>
        {action}
      </div>
      <div className="flex-1 overflow-hidden flex flex-col px-6 pb-5 pt-3">{children}</div>
    </div>
  )
}

function ChartTip({ active, payload }) {
  if (!active || !payload?.length) return null
  const item = payload[0].payload
  // PieChart items: { name, value }  ·  BarChart items: { label, amount }
  const label = item.name ?? item.label ?? ''
  const value = item.value ?? item.amount ?? payload[0].value ?? 0
  return (
    <div className="rounded-xl px-3 py-2 text-sm shadow-xl border bg-white dark:bg-[#1a1a24] border-zinc-200 dark:border-white/10">
      <p className="font-medium text-xs text-zinc-500 dark:text-zinc-300 mb-0.5">{label}</p>
      <p className="font-bold text-zinc-900 dark:text-zinc-50">${Number(value).toFixed(2)}</p>
    </div>
  )
}

const inputCls = 'w-full rounded-lg border border-zinc-200 dark:border-white/[0.1] bg-white dark:bg-[#1a1a24] text-zinc-900 dark:text-zinc-100 text-sm px-3 py-2 outline-none focus:border-indigo-400 dark:focus:border-indigo-500 transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-600'

// ─── Spending by Category section (Q2) ───────────────────────────────────────
function CategorySection({ byCategory, totalSpent, isDark }) {
  const [hoveredCat, setHoveredCat] = useState(null)
  const [lockedCat,  setLockedCat]  = useState(null)
  const activeCat = lockedCat ?? hoveredCat

  // Click outside the section → deselect locked
  const sectionRef = useRef(null)
  useEffect(() => {
    function handler(e) {
      if (sectionRef.current && !sectionRef.current.contains(e.target)) {
        setLockedCat(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

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
                  fill={COLORS[e.name] ?? '#6b7280'}
                  opacity={activeCat && e.name !== activeCat ? 0.3 : 1}
                  style={{ cursor: 'pointer', transition: 'opacity 0.2s' }}
                />
              ))}
            </Pie>
            <Tooltip content={<ChartTip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center label — fades in when a category is active */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          {activeCatData && (
            <div className="text-center px-3 max-w-[120px]" style={{ animation: 'fadeIn 0.15s ease' }}>
              <p className="text-[10px] font-bold uppercase tracking-widest mb-1 truncate"
                style={{ color: COLORS[activeCatData.name] }}>
                {activeCatData.name}
              </p>
              <p className="text-[17px] font-bold tabular-nums text-zinc-900 dark:text-zinc-50 leading-none">
                ${activeCatData.value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Legend list */}
      <div className="w-44 shrink-0 overflow-y-auto flex flex-col gap-0.5 py-1 pr-1">
        {byCategory.map(({ name, value }) => {
          const isActive = activeCat === name
          const isDimmed = activeCat && !isActive
          return (
            <div
              key={name}
              className={`flex items-center gap-2 px-2.5 py-2 rounded-lg cursor-pointer select-none
                transition-all duration-150
                ${isActive
                  ? 'bg-zinc-100 dark:bg-white/[0.08]'
                  : 'hover:bg-zinc-50 dark:hover:bg-white/[0.04]'}
                ${isDimmed ? 'opacity-35' : 'opacity-100'}`}
              onMouseEnter={() => { if (!lockedCat) setHoveredCat(name) }}
              onMouseLeave={() => { if (!lockedCat) setHoveredCat(null) }}
              onClick={() => { setLockedCat(l => l === name ? null : name); setHoveredCat(null) }}
            >
              <span className="w-2 h-2 rounded-full shrink-0 transition-transform duration-150"
                style={{ backgroundColor: COLORS[name] ?? '#6b7280',
                         transform: isActive ? 'scale(1.4)' : 'scale(1)' }} />
              <div className="min-w-0 flex-1">
                <p className={`text-[11px] truncate transition-all duration-150
                  ${isActive ? 'font-bold text-zinc-900 dark:text-zinc-50' : 'font-medium text-zinc-800 dark:text-zinc-200'}`}>
                  {name}
                </p>
                <p className="text-[10px] tabular-nums text-zinc-500 dark:text-zinc-300">
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
export default function App() {
  // Theme & nav
  const [isDark, setIsDark]             = useState(true)
  const [showDropdown, setShowDropdown] = useState(false)
  const dropdownRef = useRef(null)

  // Table sort
  const [sortCol, setSortCol] = useState('date')
  const [sortDir, setSortDir] = useState('desc')

  // Date range
  const initRange = getPresetRange('this-month')
  const [dateRange,    setDateRange]    = useState({ preset: 'this-month', ...initRange })
  const [showDatePicker, setShowDatePicker]   = useState(false)
  const [customStart,    setCustomStart]      = useState(toInputDate(initRange.start))
  const [customEnd,      setCustomEnd]        = useState(toInputDate(initRange.end))
  const [datePickerPos,  setDatePickerPos]    = useState({ top: 0, left: 0 })
  const dateBtnRef    = useRef(null)
  const datePickerRef = useRef(null)

  // Add expense modal
  const [showAddModal, setShowAddModal] = useState(false)
  const [formDate,     setFormDate]     = useState(toInputDate(new Date()))
  const [formMerchant, setFormMerchant] = useState('')
  const [formCategory, setFormCategory] = useState('Food & Dining')
  const [formPayment,  setFormPayment]  = useState('Chase Unlimited')
  const [formAmount,   setFormAmount]   = useState('')
  const [manualTx,     setManualTx]     = useState([])

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
    setDateRange({ preset: id, ...range })
    setCustomStart(toInputDate(range.start))
    setCustomEnd(toInputDate(range.end))
    setSortCol('date'); setSortDir('desc')
    setShowDatePicker(false)
  }

  const applyCustom = () => {
    if (!customStart || !customEnd) return
    const start = fromInputDate(customStart), end = fromInputDate(customEnd)
    if (start > end) return
    setDateRange({ preset: 'custom', start, end })
    setSortCol('date'); setSortDir('desc')
    setShowDatePicker(false)
  }

  const handleAddExpense = (e) => {
    e.preventDefault()
    setManualTx(prev => [...prev, {
      date:     toTxDateStr(fromInputDate(formDate)),
      merchant: formMerchant.trim(),
      category: formCategory,
      amount:   -Math.abs(parseFloat(formAmount)),
      source:   formPayment,
    }])
    setShowAddModal(false)
    setFormMerchant(''); setFormAmount('')
    setFormDate(toInputDate(new Date()))
    setFormCategory('Food & Dining'); setFormPayment('Chase Unlimited')
  }

  // ── Data ─────────────────────────────────────────────────────────────────────
  const allCsvTx = useMemo(() => {
    const unlimitedRows = parseCSV(unlimitedRaw)
    const flexRows      = parseCSV(flexRaw)
    console.log(`unlimited.CSV — total rows: ${unlimitedRows.length}`)
    console.log(`flex.CSV      — total rows: ${flexRows.length}`)
    const toTx = (r, src) => ({
      date:     r['Transaction Date'],
      merchant: decodeEntities(r['Description']),
      category: categorize(decodeEntities(r['Description'])),
      amount:   parseFloat(r['Amount']),
      source:   src,
    })
    return [
      ...unlimitedRows.filter(r => r['Type'] === 'Sale').map(r => toTx(r, 'Chase Unlimited')),
      ...flexRows.filter(r => r['Type'] === 'Sale').map(r => toTx(r, 'Chase Flex')),
    ]
  }, [])

  const transactions = useMemo(() => {
    return [...allCsvTx, ...manualTx].filter(t => {
      const d = parseTxDate(t.date)
      return d >= dateRange.start && d <= dateRange.end
    })
  }, [allCsvTx, manualTx, dateRange])

  const byCategory = useMemo(() => {
    const map = {}
    transactions.filter(t => t.amount < 0)
      .forEach(t => { map[t.category] = (map[t.category] || 0) + Math.abs(t.amount) })
    return Object.entries(map)
      .map(([name, value]) => ({ name, value: parseFloat(value.toFixed(2)) }))
      .sort((a, b) => b.value - a.value)
  }, [transactions])

  const trendData = useMemo(() => {
    const purchases = transactions.filter(t => t.amount < 0)
    const rangeDays = Math.ceil((dateRange.end - dateRange.start) / (1000*60*60*24)) + 1
    const buckets = []
    if (rangeDays <= 62) {
      let cursor = new Date(dateRange.start)
      while (cursor <= dateRange.end) {
        const wEnd = new Date(cursor); wEnd.setDate(wEnd.getDate() + 6)
        const bucketEnd = wEnd > dateRange.end ? new Date(dateRange.end) : wEnd
        buckets.push({ start: new Date(cursor), end: bucketEnd,
          label: cursor.toLocaleDateString('en-US', { month:'short', day:'numeric' }) })
        cursor.setDate(cursor.getDate() + 7)
      }
    } else {
      let cursor = new Date(dateRange.start.getFullYear(), dateRange.start.getMonth(), 1)
      while (cursor <= dateRange.end) {
        const mEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0)
        buckets.push({ start: new Date(cursor), end: mEnd,
          label: cursor.toLocaleDateString('en-US', { month:'short', year:'2-digit' }) })
        cursor.setMonth(cursor.getMonth() + 1)
      }
    }
    return buckets.map(b => ({
      label: b.label,
      amount: parseFloat(purchases
        .filter(t => { const d = parseTxDate(t.date); return d >= b.start && d <= b.end })
        .reduce((s, t) => s + (isNaN(t.amount) ? 0 : Math.abs(t.amount)), 0).toFixed(2)) || 0,
    }))
  }, [transactions, dateRange])

  const handleSort = (col) => {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir(col === 'date' ? 'desc' : 'asc') }
  }

  const sortedTx = useMemo(() => [...transactions].sort((a, b) => {
    let cmp = 0
    if (sortCol === 'date')     cmp = parseTxDate(a.date) - parseTxDate(b.date)
    else if (sortCol === 'merchant') cmp = a.merchant.localeCompare(b.merchant)
    else if (sortCol === 'category') cmp = a.category.localeCompare(b.category)
    else if (sortCol === 'amount')   cmp = Math.abs(a.amount) - Math.abs(b.amount)
    return sortDir === 'asc' ? cmp : -cmp
  }), [transactions, sortCol, sortDir])

  const totalSpent    = transactions.filter(t => t.amount < 0).reduce((s, t) => s + (isNaN(t.amount) ? 0 : Math.abs(t.amount)), 0)
  const purchaseCount = transactions.filter(t => t.amount < 0).length
  const topCategory   = byCategory[0]?.name  ?? '—'
  const topCatAmt     = byCategory[0]?.value ?? 0
  const rangeDays     = Math.max(1, Math.ceil((dateRange.end - dateRange.start) / (1000*60*60*24)) + 1)
  const dailyAvg      = totalSpent / rangeDays

  const chartGrid = isDark ? '#1f1f2e' : '#e4e4e7'
  const chartAxis = isDark ? '#d4d4d8' : '#a1a1aa'
  const chartBar  = isDark ? '#6366f1' : '#818cf8'

  return (
    <div className={isDark ? 'dark' : ''}>
      {/* keyframe for center label fade-in */}
      <style>{`@keyframes fadeIn { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:scale(1) } }`}</style>

      <div className="h-screen flex flex-col bg-zinc-50 dark:bg-[#07070b] font-sans antialiased overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <header className="shrink-0 border-b border-zinc-200 dark:border-white/[0.06] bg-white dark:bg-[#07070b] px-7 py-3.5 flex items-center justify-between">
          <div>
            <h1 className="text-[15px] font-bold tracking-tight leading-none text-zinc-900 dark:text-zinc-50">Money Spread</h1>
            <p className="text-[11px] mt-1 leading-none text-zinc-500 dark:text-zinc-300">Saving Money so I don't go broke</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative group">
              <button className="w-9 h-9 flex items-center justify-center rounded-xl text-lg transition-colors text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06]">💵</button>
              <div className="pointer-events-none absolute right-0 top-full mt-2 px-2.5 py-1.5 rounded-lg text-[11px] font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity shadow-lg z-50 bg-white dark:bg-[#15151e] border border-zinc-200 dark:border-white/[0.08] text-zinc-800 dark:text-zinc-200">
                Hamilton AI
              </div>
            </div>
            <button onClick={() => setIsDark(d => !d)}
              className="w-9 h-9 flex items-center justify-center rounded-xl transition-colors text-zinc-500 hover:text-zinc-800 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:text-zinc-100 dark:hover:bg-white/[0.06]">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="relative" ref={dropdownRef}>
              <button onClick={() => setShowDropdown(s => !s)}
                className="w-9 h-9 flex items-center justify-center rounded-full text-[13px] font-bold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors">P</button>
              {showDropdown && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-xl border shadow-2xl overflow-hidden z-50 bg-white dark:bg-[#15151e] border-zinc-200 dark:border-white/[0.08]">
                  <div className="px-4 py-3 border-b border-zinc-100 dark:border-white/[0.06]">
                    <p className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-100">Pingoo</p>
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-300">Personal account</p>
                  </div>
                  <button className="w-full text-left px-4 py-2.5 text-[12px] text-zinc-700 dark:text-zinc-300 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.05]">Settings</button>
                  <button className="w-full text-left px-4 py-2.5 text-[12px] text-red-500 dark:text-red-400 transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.05]">Sign out</button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* ── 2×2 grid ───────────────────────────────────────────────────── */}
        <main className="flex-1 overflow-hidden p-4">
          <div className="h-full grid grid-cols-2 grid-rows-2 gap-3">

            {/* Q1 — Total Spent */}
            <Card title="Total Spent"
              action={
                <button onClick={() => setShowAddModal(true)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-colors text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-500/10">
                  <Plus size={11} /> Add
                </button>
              }
            >
              <div className="flex flex-col h-full justify-between">
                <div>
                  <button ref={dateBtnRef} onClick={openDatePicker}
                    className="flex items-center gap-1 mb-2 text-[11px] font-medium text-zinc-500 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 transition-colors">
                    {formatRangeLabel(dateRange.preset, dateRange.start, dateRange.end)}
                    <ChevronDown size={11} className={`transition-transform ${showDatePicker ? 'rotate-180' : ''}`} />
                  </button>
                  <p className="text-5xl font-bold tracking-tight tabular-nums leading-none text-zinc-900 dark:text-zinc-50">
                    ${totalSpent.toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 })}
                  </p>
                </div>
                <div className="w-full h-px my-4 bg-zinc-100 dark:bg-white/[0.06]" />
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 text-zinc-400 dark:text-zinc-300">Daily Avg</p>
                    <p className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">${dailyAvg.toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 text-zinc-400 dark:text-zinc-300">Transactions</p>
                    <p className="text-xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{purchaseCount}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-widest font-semibold mb-1 text-zinc-400 dark:text-zinc-300">Top Category</p>
                    <p className="text-sm font-bold truncate" style={{ color: COLORS[topCategory] ?? '#6b7280' }}>{topCategory}</p>
                    <p className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-300">${topCatAmt.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </Card>

            {/* Q2 — Spending by Category */}
            <Card title="Spending by Category">
              <CategorySection
                byCategory={byCategory}
                totalSpent={totalSpent}
                isDark={isDark}
              />
            </Card>

            {/* Q3 — Transactions */}
            <Card title="Transactions" action={<span className="text-[10px] text-zinc-400 dark:text-zinc-300">{sortedTx.length} entries</span>}>
              <div className="flex-1 overflow-y-auto -mx-1 px-1">
                <table className="w-full text-sm border-separate border-spacing-0">
                  <thead className="sticky top-0 bg-white dark:bg-[#0e0e14]">
                    <tr>
                      {[
                        { col: 'date',     label: 'Date',    cls: 'pr-3 text-left' },
                        { col: 'merchant', label: 'Merchant',cls: 'pr-3 text-left' },
                        { col: 'category', label: 'Category',cls: 'pr-3 text-left' },
                        { col: 'source',   label: 'Card',    cls: 'pr-3 text-left', noSort: true },
                        { col: 'amount',   label: 'Amount',  cls: 'text-right' },
                      ].map(({ col, label, cls, noSort }) => {
                        const isActive = sortCol === col
                        return (
                          <th key={col}
                            className={`pb-2.5 ${cls} text-[10px] font-bold uppercase tracking-widest transition-colors select-none
                              ${noSort ? 'text-zinc-400 dark:text-zinc-300' : 'cursor-pointer ' + (isActive ? 'text-zinc-700 dark:text-zinc-100' : 'text-zinc-400 dark:text-zinc-300 hover:text-zinc-600 dark:hover:text-zinc-200')}`}
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
                    <tr><td colSpan={5}><div className="h-px w-full mb-1 bg-zinc-100 dark:bg-white/[0.06]" /></td></tr>
                  </thead>
                  <tbody>
                    {sortedTx.map((t, i) => {
                      const isUnlimited = t.source === 'Chase Unlimited'
                      const isFlex      = t.source === 'Chase Flex'
                      return (
                        <tr key={i} className="transition-colors hover:bg-zinc-50 dark:hover:bg-white/[0.03]">
                          <td className="py-2 pr-3 text-[11px] whitespace-nowrap tabular-nums text-zinc-500 dark:text-zinc-300">{t.date}</td>
                          <td className="py-2 pr-3 max-w-[130px]">
                            <span className="block truncate text-[12px] font-medium text-zinc-800 dark:text-zinc-200" title={t.merchant}>{t.merchant}</span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap"
                              style={{ backgroundColor:(COLORS[t.category]??'#6b7280')+'20', color:COLORS[t.category]??'#9ca3af' }}>
                              {t.category}
                            </span>
                          </td>
                          <td className="py-2 pr-3">
                            <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap
                              ${isUnlimited ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                              : isFlex      ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                              :               'bg-zinc-100 text-zinc-500 dark:bg-white/[0.06] dark:text-zinc-400'}`}>
                              {isUnlimited ? 'Unlimited' : isFlex ? 'Flex' : t.source}
                            </span>
                          </td>
                          <td className={`py-2 text-right text-[12px] font-semibold tabular-nums ${t.amount < 0 ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                            {t.amount < 0 ? `-$${Math.abs(t.amount).toFixed(2)}` : `+$${t.amount.toFixed(2)}`}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Q4 — Trends */}
            <Card title="Trends">
              <div className="flex flex-col h-full gap-3">
                <p className="text-[11px] text-zinc-500 dark:text-zinc-300">
                  {rangeDays <= 62 ? 'Weekly' : 'Monthly'} spending — {formatRangeLabel(dateRange.preset, dateRange.start, dateRange.end)}
                </p>
                <div className="flex-1 min-h-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendData} margin={{ top:4, right:4, left:-16, bottom: rangeDays <= 62 ? 14 : 0 }} barSize={28}>
                      <CartesianGrid vertical={false} stroke={chartGrid} strokeDasharray="3 3" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false}
                        tick={{ fill: chartAxis, fontSize: 10 }}
                        label={rangeDays <= 62
                          ? { value: 'Week of', position: 'insideBottom', offset: -2, fill: chartAxis, fontSize: 9 }
                          : undefined}
                      />
                      <YAxis tick={{ fill:chartAxis, fontSize:10 }} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`} />
                      <Tooltip content={<ChartTip />} cursor={{ fill: isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)' }} />
                      <Bar dataKey="amount" fill={chartBar} radius={[5,5,0,0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

          </div>
        </main>
      </div>

      {/* ── Date Range Picker ─────────────────────────────────────────────────── */}
      {showDatePicker && (
        <div ref={datePickerRef}
          style={{ position:'fixed', top:datePickerPos.top, left:datePickerPos.left, zIndex:200 }}
          className="w-72 rounded-2xl border shadow-2xl bg-white dark:bg-[#13131a] border-zinc-200 dark:border-white/[0.1] overflow-hidden">
          <div className="p-3 grid grid-cols-2 gap-1.5">
            {PRESETS.map(p => (
              <button key={p.id} onClick={() => applyPreset(p.id)}
                className={`px-3 py-2 rounded-lg text-[11px] font-semibold text-left transition-colors
                  ${dateRange.preset === p.id
                    ? 'bg-indigo-600 text-white'
                    : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-white/[0.06]'}`}>
                {p.label}
              </button>
            ))}
          </div>
          <div className="h-px bg-zinc-100 dark:bg-white/[0.06] mx-3" />
          <div className="p-3 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2">Custom Range</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">From</label>
                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] text-zinc-500 dark:text-zinc-400 mb-1">To</label>
                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className={inputCls} />
              </div>
            </div>
            <button onClick={applyCustom}
              className="w-full mt-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[12px] font-semibold transition-colors">
              Apply
            </button>
          </div>
        </div>
      )}

      {/* ── Add Expense Modal ─────────────────────────────────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowAddModal(false) }}>
          <div className="w-full max-w-md mx-4 rounded-2xl border shadow-2xl bg-white dark:bg-[#13131a] border-zinc-200 dark:border-white/[0.1]">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-zinc-100 dark:border-white/[0.06]">
              <h2 className="text-[15px] font-bold text-zinc-900 dark:text-zinc-50">Add Expense</h2>
              <button onClick={() => setShowAddModal(false)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-white/[0.06] transition-colors">
                <X size={14} />
              </button>
            </div>
            <form onSubmit={handleAddExpense} className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Date</label>
                  <input type="date" required value={formDate} onChange={e => setFormDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Amount ($)</label>
                  <input type="number" required min="0.01" step="0.01" placeholder="0.00"
                    value={formAmount} onChange={e => setFormAmount(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Merchant</label>
                <input type="text" required placeholder="e.g. Chipotle"
                  value={formMerchant} onChange={e => setFormMerchant(e.target.value)} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Category</label>
                  <select required value={formCategory} onChange={e => setFormCategory(e.target.value)} className={inputCls}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 mb-1.5">Payment Method</label>
                  <select value={formPayment} onChange={e => setFormPayment(e.target.value)} className={inputCls}>
                    <option value="Chase Unlimited">Chase Unlimited</option>
                    <option value="Chase Flex">Chase Flex</option>
                  </select>
                </div>
              </div>
              {formCategory && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 dark:bg-white/[0.04]">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[formCategory] }} />
                  <span className="text-[11px] text-zinc-600 dark:text-zinc-300">
                    {formMerchant || 'Merchant'} · {formCategory}{formAmount ? ` · -$${parseFloat(formAmount||0).toFixed(2)}` : ''}
                  </span>
                </div>
              )}
              <div className="flex gap-3 pt-1">
                <button type="submit"
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[13px] font-semibold transition-colors">
                  Add Expense
                </button>
                <button type="button" onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-zinc-200 dark:border-white/[0.1] text-zinc-700 dark:text-zinc-300 text-[13px] font-semibold hover:bg-zinc-50 dark:hover:bg-white/[0.04] transition-colors">
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
