import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, X } from 'lucide-react'
import { supabase } from '../supabaseClient'
import LeafIcon from '../components/LeafIcon'
import ArcSlider from '../components/ArcSlider'
import HamiltonAI from '../components/HamiltonAI'
import hamiltonIcon from '../assets/hamilton-icon.png'

const GET_TRANSACTIONS_URL = 'https://dovjukmgimhslsskmjhk.supabase.co/functions/v1/get-transactions'

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

const CATEGORIES = Object.keys(COLORS)

const PERIODS = [
  { id: 'this-month', label: 'This Month',    multiplier: 1    },
  { id: 'last-month', label: 'Last Month',    multiplier: 1    },
  { id: 'last-3',     label: 'Last 3 Months', multiplier: 3    },
  { id: 'custom',     label: 'Custom',        multiplier: null },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function plaidDateToTxDate(str) {
  const [y, m, d] = str.split('-')
  return `${m}/${d}/${y}`
}

function parseTxDate(str) {
  const [m, d, y] = str.split('/')
  return new Date(+y, +m - 1, +d)
}

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
  if (/NETFLIX|SPOTIFY|HULU|DISNEY|APPLE\.COM\/BILL|AMAZON PRIME|OPENAI|CHATGPT|CLAUDE|GYMPASS/.test(n)) return 'Subscriptions'
  if (/TICKETMASTER|EDCVEGAS|NITEHARTS/.test(n)) return 'Events'
  if (/AIRBNB|ALASKA AIR|MARRIOTT|HILTON|HYATT|EXPEDIA/.test(n)) return 'Travel'
  if (/UBER|LYFT|CLIPPER|FASTRAK|BART|CALTRAIN|PARKING|CHEVRON|ARCO|SHELL/.test(n)) return 'Transport'
  if (/TAP HAUS|HANSHIN POCHA/.test(n)) return 'Nightlife'
  if (/COSTCO|TRADER JOE|WHOLE FOODS|SAFEWAY|KROGER|WALMART|SPROUTS/.test(n)) return 'Groceries'
  if (/CHIPOTLE|TACO BELL|STARBUCKS|DOORDASH|GRUBHUB|UBEREATS|RESTAURANT|CAFE|COFFEE|SUSHI|PIZZA/.test(n)) return 'Food & Dining'
  if (/AMAZON|UNIQLO|EBAY|ETSY|TIKTOK SHOP/.test(n)) return 'Shopping'
  if (/AT&T|VERIZON|COMCAST|PG&E/.test(n)) return 'Bills & Utilities'
  return 'Miscellaneous'
}

function fmt(n) {
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function toInputDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getPeriodRange(id, customFrom = '', customTo = '') {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const y = now.getFullYear(), m = now.getMonth()
  switch (id) {
    case 'this-month': return { start: new Date(y, m, 1),     end: new Date(y, m + 1, 0) }
    case 'last-month': return { start: new Date(y, m - 1, 1), end: new Date(y, m, 0)     }
    case 'last-3':     return { start: new Date(y, m - 2, 1), end: new Date(y, m + 1, 0) }
    case 'custom': {
      if (!customFrom || !customTo) return { start: now, end: now }
      return { start: new Date(customFrom + 'T00:00:00'), end: new Date(customTo + 'T00:00:00') }
    }
    default: return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0) }
  }
}

function getPeriodLabel(id, customFrom = '', customTo = '') {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const short = d => d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
  switch (id) {
    case 'this-month': return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'last-month': return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    case 'last-3':     return `${short(new Date(y, m - 2, 1))} – ${short(new Date(y, m, 1))}`
    case 'custom': {
      if (!customFrom || !customTo) return 'Custom Range'
      const from = new Date(customFrom + 'T00:00:00')
      const to   = new Date(customTo   + 'T00:00:00')
      const d = dt => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      return `${d(from)} – ${d(to)}`
    }
    default: return now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }
}

const inputCls = 'w-full rounded-lg border text-sm px-3 py-2 outline-none transition-colors placeholder:opacity-60'
const inputStyle = { borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg)', color: 'var(--color-fg)' }

// ── Main component ────────────────────────────────────────────────────────────

export default function BudgetsPage({ selectedPeriod, setSelectedPeriod }) {
  const navigate = useNavigate()

  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [allTx, setAllTx]           = useState([])
  const [budgets, setBudgets]       = useState({})
  const [userId, setUserId]         = useState(null)
  const [userEmail, setUserEmail]   = useState('')

  const period = selectedPeriod.preset
  const [prevPeriod, setPrevPeriod] = useState(selectedPeriod.preset)
  const [pendingPeriod, setPending] = useState(null)
  const [pendingMult, setPendingMult] = useState(1)
  const [useMultiplier, setUseMultiplier] = useState(true)

  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo]     = useState('')

  const [editing, setEditing]       = useState({})
  const [saving, setSaving]         = useState({})
  const [showHamilton, setShowHamilton] = useState(false)
  const [hamiltonOpen, setHamiltonOpen] = useState(false)
  const [hamiltonHovered, setHamiltonHovered] = useState(false)
  const [user, setUser] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [profile, setProfile] = useState({ display_name: '', avatar_url: '', hamilton_style: 'default' })
  const [settingName, setSettingName] = useState('')
  const [settingAvatar, setSettingAvatar] = useState(null)
  const [settingStyle, setSettingStyle] = useState('default')
  const [settingSaving, setSettingSaving] = useState(false)
  const dropdownRef = useRef(null)
  const [highlightOver, setHighlightOver] = useState(false)
  const cardsGridRef = useRef(null)

  const [editingCategory, setEditingCategory] = useState(null)
  const [draftLimit, setDraftLimit] = useState(0)

  // ── Data fetching (unchanged Supabase logic) ──────────────────────────────
  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { setLoading(false); return }

    const { data: { user } } = await supabase.auth.getUser()
    setUser(user)
    setUserId(user.id)
    setUserEmail(user.email ?? '')

    const res = await fetch(GET_TRANSACTIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
    })
    const data = await res.json()

    if (!res.ok || !data.transactions) {
      setError('Failed to load transactions. Please refresh.')
      setLoading(false)
      return
    }

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
        id:       t.transaction_id,
        date:     plaidDateToTxDate(t.date),
        name:     t.merchant_name || t.name || '',
        category: plaidCategoryToGrove(t.personal_finance_category?.detailed ?? '', t.merchant_name || t.name),
        amount:   -t.amount,
      }))

    const { data: overrides } = await supabase
      .from('transaction_overrides').select('*').eq('user_id', user.id)

    const overrideMap = {}
    ;(overrides || []).forEach(o => { overrideMap[o.transaction_id] = o })

    const withOverrides = mapped.map(t => ({
      ...t,
      ...(overrideMap[t.id] ? {
        category: overrideMap[t.id].category ?? t.category,
        name:     overrideMap[t.id].name ?? t.name,
      } : {})
    }))

    const { data: deletedRows } = await supabase
      .from('deleted_transactions').select('transaction_id').eq('user_id', user.id)

    const deletedIds = new Set((deletedRows || []).map(r => r.transaction_id))
    setAllTx(withOverrides.filter(t => !deletedIds.has(t.id)))

    const { data: budgetRows } = await supabase
      .from('budgets').select('category, monthly_limit').eq('user_id', user.id)

    const budgetMap = {}
    ;(budgetRows || []).forEach(b => { budgetMap[b.category] = b.monthly_limit })
    setBudgets(budgetMap)

    setLoading(false)
  }, [])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    async function loadProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data } = await supabase.from('user_profile').select('display_name, avatar_url, hamilton_style').eq('user_id', user.id).single()
      if (data) {
        setProfile({ display_name: data.display_name ?? '', avatar_url: data.avatar_url ?? '', hamilton_style: data.hamilton_style ?? 'default' })
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
      let avatar_url = profile.avatar_url
      if (settingAvatar) {
        const ext = settingAvatar.name.split('.').pop()
        await supabase.storage.from('avatars').upload(`${user.id}.${ext}`, settingAvatar, { upsert: true })
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(`${user.id}.${ext}`)
        avatar_url = `${urlData.publicUrl}?t=${Date.now()}`
      }
      await supabase.from('user_profile').upsert({
        user_id: user.id,
        display_name: settingName,
        avatar_url,
        hamilton_style: settingStyle,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })
      setProfile({ display_name: settingName, avatar_url, hamilton_style: settingStyle })
      setSettingAvatar(null)
      setShowSettings(false)
    } finally {
      setSettingSaving(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/', { replace: true })
  }

  useEffect(() => {
    function handler(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target))
        setShowDropdown(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // ── Custom range: show modal when range > 35 days ─────────────────────────
  useEffect(() => {
    if (period !== 'custom' || !customFrom || !customTo) return
    const from = new Date(customFrom + 'T00:00:00')
    const to   = new Date(customTo   + 'T00:00:00')
    if (to < from) return
    setSelectedPeriod(prev => ({ ...prev, preset: 'custom', start: from, end: to }))
    const days = Math.ceil((to - from) / (1000 * 60 * 60 * 24)) + 1
    if (days > 35) {
      const mult = Math.round(days / 30)
      setPendingMult(mult)
      setPending('custom')
    } else {
      setUseMultiplier(false)
      setPending(null)
    }
  }, [customFrom, customTo, period])

  // ── Derived: historical average monthly spend per category ───────────────
  const historicalScore = useMemo(() => {
    const totals = {}
    const months = new Set()
    CATEGORIES.forEach(c => { totals[c] = 0 })
    allTx.forEach(t => {
      if (t.amount >= 0) return
      if (totals[t.category] === undefined) return
      const d = parseTxDate(t.date)
      months.add(`${d.getFullYear()}-${d.getMonth()}`)
      totals[t.category] = parseFloat((totals[t.category] + Math.abs(t.amount)).toFixed(2))
    })
    const numMonths = Math.max(months.size, 1)
    const scores = {}
    CATEGORIES.forEach(c => { scores[c] = totals[c] / numMonths })
    return scores
  }, [allTx])

  // ── Derived: spending aggregated by period ────────────────────────────────
  const spending = useMemo(() => {
    const { start, end } = selectedPeriod
    const spendMap = {}
    CATEGORIES.forEach(c => { spendMap[c] = 0 })
    if (!start || !end) return spendMap
    allTx.forEach(t => {
      if (t.amount >= 0) return
      const d = parseTxDate(t.date)
      if (d < start || d > end) return
      if (spendMap[t.category] !== undefined) {
        spendMap[t.category] = parseFloat((spendMap[t.category] + Math.abs(t.amount)).toFixed(2))
      }
    })
    return spendMap
  }, [allTx, selectedPeriod])

  // ── Derived: effective multiplier ─────────────────────────────────────────
  const effectiveMultiplier = useMemo(() => {
    if (!useMultiplier) return 1
    if (period === 'last-3') return 3
    if (period === 'custom' && selectedPeriod.start && selectedPeriod.end) {
      const days = Math.ceil((selectedPeriod.end - selectedPeriod.start) / (1000 * 60 * 60 * 24)) + 1
      return days > 35 ? Math.round(days / 30) : 1
    }
    return 1
  }, [period, useMultiplier, selectedPeriod])

  // ── Derived: limits scaled for the display period ─────────────────────────
  const effectiveLimits = useMemo(() => {
    const result = {}
    CATEGORIES.forEach(c => {
      result[c] = budgets[c] != null
        ? parseFloat((budgets[c] * effectiveMultiplier).toFixed(2))
        : null
    })
    return result
  }, [budgets, effectiveMultiplier])

  const totalBudgeted = CATEGORIES.reduce((s, c) => s + (effectiveLimits[c] ?? 0), 0)
  const totalSpent    = CATEGORIES.reduce((s, c) => s + (spending[c] ?? 0), 0)
  const overCount     = CATEGORIES.filter(c => effectiveLimits[c] != null && (spending[c] ?? 0) > effectiveLimits[c]).length

  const budgetedCategories = useMemo(() => CATEGORIES.filter(c => budgets[c] != null), [budgets])
  const categorySpend = spending

  const hamiltonContext = useMemo(() => {
    const catLines = budgetedCategories.map(c => {
      const spent = categorySpend[c] ?? 0
      const limit = budgets[c]
      const over = spent > limit
      return `- ${c}: spent $${spent.toFixed(2)} of $${limit.toFixed(2)} budget${over ? ` (OVER by $${(spent - limit).toFixed(2)})` : ''}`
    }).join('\n')
    const totalBudgetedAmt = budgetedCategories.reduce((s, c) => s + (budgets[c] ?? 0), 0)
    const totalSpentAll = budgetedCategories.reduce((s, c) => s + (categorySpend[c] ?? 0), 0)
    const overCountAmt = budgetedCategories.filter(c => (categorySpend[c] ?? 0) > (budgets[c] ?? 0)).length
    return `The user is viewing their Grove budgets page.
Total budgeted: $${totalBudgetedAmt.toFixed(2)}
Total spent against budgets: $${totalSpentAll.toFixed(2)}
Categories over budget: ${overCountAmt}

Budget breakdown:
${catLines}

Use this data to answer the user's questions about their budgets accurately.`
  }, [budgetedCategories, budgets, categorySpend])

  const totalSpentColor = totalBudgeted === 0
    ? 'var(--color-fg)'
    : totalSpent > totalBudgeted
      ? 'hsl(0, 65%, 50%)'
      : totalSpent >= totalBudgeted * 0.9
        ? 'hsl(42, 68%, 58%)'
        : 'hsl(145, 38%, 34%)'

  // ── Period toggle ─────────────────────────────────────────────────────────
  function handlePeriodClick(id) {
    if (id === period) return
    if (id === 'last-3') {
      setPrevPeriod(period)
      setPendingMult(3)
      setPending('last-3')
    } else if (id === 'custom') {
      setPrevPeriod(period)
      setSelectedPeriod(prev => ({ ...prev, preset: 'custom' }))
      setUseMultiplier(false)
    } else {
      const range = getPeriodRange(id, '', '')
      setSelectedPeriod({ preset: id, start: range.start, end: range.end })
      setUseMultiplier(true)
    }
  }

  function handleModalMultiply() {
    setUseMultiplier(true)
    if (pendingPeriod !== 'custom') {
      const range = getPeriodRange(pendingPeriod, '', '')
      setSelectedPeriod({ preset: pendingPeriod, start: range.start, end: range.end })
    }
    setPending(null)
  }

  function handleModalKeep() {
    setUseMultiplier(false)
    if (pendingPeriod !== 'custom') {
      const range = getPeriodRange(pendingPeriod, '', '')
      setSelectedPeriod({ preset: pendingPeriod, start: range.start, end: range.end })
    }
    setPending(null)
  }

  function handleModalCancel() {
    if (pendingPeriod === 'custom') {
      const range = getPeriodRange(prevPeriod, '', '')
      setSelectedPeriod({ preset: prevPeriod, start: range.start, end: range.end })
      setCustomFrom('')
      setCustomTo('')
    }
    setPending(null)
  }

  // ── Budget save / clear ───────────────────────────────────────────────────
  async function saveLimit(category) {
    const raw = editing[category]
    const value = parseFloat(raw)
    if (isNaN(value) || value < 0) return

    setSaving(s => ({ ...s, [category]: true }))
    await supabase
      .from('budgets')
      .upsert({ user_id: userId, category, monthly_limit: value }, { onConflict: 'user_id,category' })
    setBudgets(b => ({ ...b, [category]: value }))
    setEditing(e => { const n = { ...e }; delete n[category]; return n })
    setSaving(s => { const n = { ...s }; delete n[category]; return n })
  }

  async function clearLimit(category) {
    await supabase
      .from('budgets')
      .delete()
      .eq('user_id', userId)
      .eq('category', category)
    setBudgets(b => { const n = { ...b }; delete n[category]; return n })
    setEditing(e => { const n = { ...e }; delete n[category]; return n })
  }

  // ── Date range helpers ────────────────────────────────────────────────────
  const todayDate = new Date(); todayDate.setHours(0, 0, 0, 0)
  const minDateStr = toInputDate(new Date(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate() - 90))
  const maxDateStr = toInputDate(todayDate)

  const avatarLetter = userEmail ? userEmail[0].toUpperCase() : '?'
  const displayName = user?.user_metadata?.full_name?.split(' ')[0]
    ?? user?.email?.split('@')[0]
    ?? 'there'

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', fontFamily: "'DM Sans', sans-serif", color: 'var(--color-fg)' }}>
      <style>{`
        @keyframes hamiltonWiggle {
          0%   { transform: rotate(0deg); }
          20%  { transform: rotate(-8deg); }
          40%  { transform: rotate(8deg); }
          60%  { transform: rotate(-4deg); }
          80%  { transform: rotate(4deg); }
          100% { transform: rotate(0deg); }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header style={{
        backgroundColor: 'var(--color-bg)',
        padding: '14px 28px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexShrink: 0, position: 'relative', zIndex: 10,
      }}>
        {/* Left: logo (navigates to dashboard) */}
        <div
          onClick={() => navigate('/dashboard')}
          style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
        >
          <LeafIcon size={32} />
          <div>
            <h1 style={{ fontSize: 17, fontWeight: 600, lineHeight: 1, color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif", margin: 0 }}>
              Grove
            </h1>
            <p style={{ fontSize: 11, lineHeight: 1, color: 'var(--color-muted-text)', margin: '2px 0 0' }}>
              Grow your wealth, naturally.
            </p>
          </div>
        </div>

        {/* Right: buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button
            onClick={() => navigate('/dashboard')}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              backgroundColor: 'var(--color-muted-bg)', color: 'var(--color-fg)',
              border: 'none', borderRadius: 12, padding: '6px 12px',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--color-border)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'var(--color-muted-bg)'}
          >
            ← Dashboard
          </button>

          {/* Hamilton AI emoji button */}
          <div style={{ position: 'relative' }}
            onMouseEnter={() => { setShowHamilton(true); setHamiltonHovered(true) }}
            onMouseLeave={() => { setShowHamilton(false); setHamiltonHovered(false) }}
          >
            <button
              onClick={() => setHamiltonOpen(true)}
              style={{
                width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', cursor: 'pointer', borderRadius: 12,
                fontSize: 18, color: 'var(--color-muted-text)',
              }}>
              <img src={hamiltonIcon} alt="Hamilton AI" style={{ width: 30, height: 30, animation: hamiltonHovered ? 'hamiltonWiggle 0.4s ease forwards' : 'none' }} />
            </button>
            {showHamilton && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                padding: '6px 10px', borderRadius: 8, fontSize: 11, fontWeight: 500,
                whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 50,
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-fg)',
                boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
              }}>
                Hamilton AI
              </div>
            )}
          </div>

          {/* Profile circle + dropdown */}
          <div style={{ position: 'relative' }} ref={dropdownRef}>
            <button onClick={() => setShowDropdown(s => !s)}
              style={{
                width: 36, height: 36, borderRadius: '50%',
                backgroundColor: profile.avatar_url ? 'transparent' : 'var(--color-primary)',
                color: '#fff', border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700, fontFamily: "'DM Sans', sans-serif",
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
              {profile.avatar_url
                ? <img src={profile.avatar_url} alt="avatar"
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
                    onError={() => setProfile(p => ({ ...p, avatar_url: '' }))}
                  />
                : (profile.display_name?.[0]?.toUpperCase() || 'P')}
            </button>
            {showDropdown && (
              <div style={{
                position: 'absolute', right: 0, top: '100%', marginTop: 8,
                width: 176, borderRadius: 12, overflow: 'hidden', zIndex: 50,
                backgroundColor: 'var(--color-bg-card)',
                border: '1px solid var(--color-border)',
                boxShadow: '0 8px 32px rgba(0,0,0,0.14)',
              }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-border)' }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)', margin: 0 }}>
                    {profile.display_name || 'Account'}
                  </p>
                  <p style={{ fontSize: 11, color: 'var(--color-muted-text)', margin: '2px 0 0' }}>Personal account</p>
                </div>
                <button onClick={() => { setShowSettings(true); setShowDropdown(false) }}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px',
                    fontSize: 12, color: 'var(--color-fg)', background: 'none',
                    border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  Settings
                </button>
                <button onClick={handleSignOut}
                  style={{
                    width: '100%', textAlign: 'left', padding: '10px 16px',
                    fontSize: 12, color: 'hsl(0, 65%, 50%)', background: 'none',
                    border: 'none', cursor: 'pointer', fontFamily: "'DM Sans', sans-serif",
                  }}
                  onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
                  onMouseLeave={e => e.currentTarget.style.opacity = '1'}>
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────────── */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'var(--color-muted-text)', fontSize: 14 }}>
          Loading…
        </div>
      ) : error ? (
        <div style={{ textAlign: 'center', padding: '80px 0', color: 'hsl(0, 60%, 50%)', fontSize: 14 }}>
          {error}
        </div>
      ) : (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '32px 32px 48px' }}>

          {/* Title row */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 18 }}>
            <h2 style={{
              fontFamily: "'Playfair Display', serif",
              fontSize: 28, fontWeight: 600,
              color: 'hsl(145, 38%, 34%)',
              margin: 0, lineHeight: 1,
            }}>
              Budgets
            </h2>
            <span style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 16, color: 'var(--color-muted-text)', lineHeight: 1 }}>
              {getPeriodLabel(period, customFrom, customTo)}
            </span>
          </div>

          {/* Period toggle */}
          <div style={{
            display: 'inline-flex', gap: 2,
            backgroundColor: 'var(--color-muted-bg)',
            borderRadius: 12, padding: 4, marginBottom: period === 'custom' ? 12 : 24,
          }}>
            {PERIODS.map(p => (
              <button
                key={p.id}
                onClick={() => handlePeriodClick(p.id)}
                style={{
                  padding: '6px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif",
                  backgroundColor: period === p.id ? 'hsl(145, 38%, 34%)' : 'transparent',
                  color: period === p.id ? '#fff' : 'var(--color-muted-text)',
                  transition: 'background 0.15s, color 0.15s',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range pickers */}
          {period === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--color-muted-text)', fontWeight: 600 }}>From</span>
              <input
                type="date"
                value={customFrom}
                min={minDateStr}
                max={customTo || maxDateStr}
                onChange={e => setCustomFrom(e.target.value)}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8, padding: '6px 10px',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  color: 'var(--color-fg)', outline: 'none', cursor: 'pointer',
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(145, 38%, 34%)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
              <span style={{ fontSize: 12, color: 'var(--color-muted-text)', fontWeight: 600 }}>To</span>
              <input
                type="date"
                value={customTo}
                min={customFrom || minDateStr}
                max={maxDateStr}
                onChange={e => setCustomTo(e.target.value)}
                style={{
                  backgroundColor: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8, padding: '6px 10px',
                  fontSize: 13, fontFamily: "'DM Sans', sans-serif",
                  color: 'var(--color-fg)', outline: 'none', cursor: 'pointer',
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(145, 38%, 34%)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>
          )}

          {/* Summary bar */}
          <div style={{
            display: 'flex',
            backgroundColor: 'var(--color-bg-card)',
            border: '1px solid var(--color-border)',
            borderRadius: 16, overflow: 'hidden',
            marginBottom: 32,
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            <SummaryCell label="Total Budgeted" value={`$${fmt(totalBudgeted)}`} />
            <SummaryCell
              label="Total Spent"
              value={`$${fmt(totalSpent)}`}
              color={totalSpentColor}
              divider
            />
            <SummaryCell
              label="Over Budget"
              value={overCount === 0 ? 'None' : `${overCount} ${overCount === 1 ? 'category' : 'categories'}`}
              accent={overCount > 0 ? 'red' : 'green'}
              divider
              clickable={overCount > 0}
              onClick={() => {
                cardsGridRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                setHighlightOver(true)
                setTimeout(() => setHighlightOver(false), 1500)
              }}
            />
          </div>

          {/* Budget cards grid */}
          <div ref={cardsGridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {[...CATEGORIES].sort((a, b) => {
                const ha = historicalScore[a] ?? spending[a] ?? 0
                const hb = historicalScore[b] ?? spending[b] ?? 0
                return hb - ha
              }).map(category => (
              <BudgetCard
                key={category}
                category={category}
                color={COLORS[category]}
                spent={spending[category] ?? 0}
                limit={effectiveLimits[category]}
                editValue={editing[category] ?? null}
                isSaving={saving[category] ?? false}
                highlight={highlightOver && effectiveLimits[category] != null && (spending[category] ?? 0) > effectiveLimits[category]}
                onEditStart={() => { setEditingCategory(category); setDraftLimit(budgets[category] ?? 0) }}
                onEditChange={v => setEditing(e => ({ ...e, [category]: v }))}
                onSave={() => saveLimit(category)}
                onClear={() => clearLimit(category)}
                isEditing={editingCategory === category}
                draftLimit={draftLimit}
                maxArcValue={Math.max(3000, Math.ceil((spending[category] ?? 0) / 500) * 500)}
                onArcConfirm={async (val) => {
                  await supabase.from('budgets').upsert({ user_id: userId, category, monthly_limit: val }, { onConflict: 'user_id,category' })
                  setBudgets(b => ({ ...b, [category]: val }))
                  setEditingCategory(null)
                }}
                onArcCancel={() => setEditingCategory(null)}
                onArcRemove={() => { clearLimit(category); setEditingCategory(null) }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Confirmation modal ─────────────────────────────────────────────── */}
      {pendingPeriod && (
        <ConfirmModal
          multiplier={pendingMult}
          periodId={pendingPeriod}
          onMultiply={handleModalMultiply}
          onKeep={handleModalKeep}
          onCancel={handleModalCancel}
        />
      )}

      <HamiltonAI
        isOpen={hamiltonOpen}
        onClose={() => setHamiltonOpen(false)}
        userName={displayName}
        displayName={profile.display_name}
        hamiltonStyle={profile.hamilton_style}
        financialContext={hamiltonContext}
      />

      {/* ── Settings Modal ───────────────────────────────────────────────────── */}
      {showSettings && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/30 backdrop-blur-sm"
          onClick={e => { if (e.target === e.currentTarget) setShowSettings(false) }}>
          <div className="w-full max-w-md mx-4 rounded-2xl border shadow-2xl flex flex-col"
            style={{ backgroundColor: 'var(--color-bg-card)', borderColor: 'var(--color-border)', maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b shrink-0"
              style={{ borderColor: 'var(--color-border)' }}>
              <h2 className="text-[15px] font-semibold" style={{ color: 'var(--color-fg)', fontFamily: "'Playfair Display', serif" }}>Settings</h2>
              <button onClick={() => setShowSettings(false)}
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
                    style={{ backgroundColor: (settingAvatar || profile.avatar_url) ? 'transparent' : 'var(--color-primary)' }}>
                    {settingAvatar
                      ? <img src={URL.createObjectURL(settingAvatar)} alt="preview"
                          style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }}
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
                        if (file) setSettingAvatar(file)
                      }} />
                    </label>
                    <button onClick={() => { setSettingAvatar(null); setProfile(p => ({ ...p, avatar_url: '' })) }}
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
              <button type="button" onClick={() => setShowSettings(false)}
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
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────

function SummaryCell({ label, value, accent, color: colorProp, divider, clickable, onClick }) {
  const [hovered, setHovered] = useState(false)
  const color = colorProp ?? (
    accent === 'red'   ? 'hsl(0, 60%, 48%)'   :
    accent === 'green' ? 'hsl(145, 38%, 34%)'  :
    'var(--color-fg)'
  )
  return (
    <div style={{
      flex: 1, padding: '22px 28px', textAlign: 'center',
      borderLeft: divider ? '1px solid var(--color-border)' : 'none',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--color-muted-text)', marginBottom: 8 }}>
        {label}
      </div>
      <div
        onClick={clickable ? onClick : undefined}
        onMouseEnter={() => clickable && setHovered(true)}
        onMouseLeave={() => clickable && setHovered(false)}
        style={{
          fontSize: 24, fontWeight: 700, color, fontFamily: "'DM Sans', sans-serif",
          cursor: clickable ? 'pointer' : 'default',
          textDecoration: clickable && hovered ? 'underline' : 'none',
        }}
      >
        {value}
      </div>
    </div>
  )
}

function BudgetCard({ category, color, spent, limit, editValue, isSaving, highlight, onEditStart, onEditChange, onSave, onClear, isEditing, draftLimit, maxArcValue, onArcConfirm, onArcCancel, onArcRemove }) {
  const hasLimit = limit !== null
  const over     = hasLimit && spent > limit
  const pct      = hasLimit ? Math.min(spent / limit, 1) : 0
  const diff     = hasLimit ? Math.abs(limit - spent) : 0
  const barColor = over ? 'hsl(0, 60%, 52%)' : pct > 0.8 ? 'hsl(42, 68%, 58%)' : color

  return (
    <div style={{
      backgroundColor: highlight ? 'hsl(0, 65%, 97%)' : 'var(--color-bg-card)',
      border: '1px solid var(--color-border)',
      borderRadius: 14, padding: 24, minHeight: isEditing ? '420px' : undefined,
      display: 'flex', flexDirection: 'column', gap: 0,
      boxShadow: highlight ? '0 0 0 2px hsl(0, 65%, 50%)' : 'none',
      transition: 'box-shadow 0.2s ease, background-color 0.2s ease, min-height 0.2s ease',
      position: 'relative', overflow: 'visible',
    }}>
      {hasLimit && over && !isEditing && (
        <div style={{
          position: 'absolute', top: -8, right: -8,
          width: 20, height: 20, borderRadius: '50%',
          backgroundColor: 'hsl(0,80%,50%)', color: '#fff',
          fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10, pointerEvents: 'none',
        }}>!</div>
      )}

      {/* Header: dot + name + Edit/Set limit */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            backgroundColor: color, display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--color-fg)' }}>{category}</span>
        </div>
        {!isEditing && (
          hasLimit ? (
            <button onClick={onEditStart} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--color-muted-text)', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
              Edit
            </button>
          ) : (
            <button onClick={onEditStart} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--color-accent)', padding: 0, fontFamily: "'DM Sans', sans-serif" }}>
              Set limit
            </button>
          )
        )}
        {isEditing && hasLimit && (
          <button onClick={onArcRemove} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', color: 'hsl(0,65%,50%)', fontFamily: 'DM Sans, sans-serif', padding: '0', marginLeft: 'auto' }}>
            Remove limit
          </button>
        )}
      </div>

      {/* Body: spending info — always visible */}
      <div style={{ flex: 1 }}>
        {hasLimit ? (
          <>
            {!isEditing && (
              <div style={{ height: 6, borderRadius: 4, backgroundColor: 'var(--color-muted-bg)', overflow: 'hidden', marginBottom: 10 }}>
                <div style={{
                  height: '100%', width: `${pct * 100}%`, borderRadius: 4,
                  backgroundColor: barColor,
                  transition: 'width 0.4s ease',
                }} />
              </div>
            )}
            {!isEditing && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{ fontSize: 12, color: 'var(--color-muted-text)' }}>
                  ${fmt(spent)} <span style={{ opacity: 0.7 }}>of ${fmt(limit)}</span>
                </span>
                {over ? (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(0, 60%, 48%)' }}>${fmt(diff)} over</span>
                ) : (
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'hsl(145, 38%, 34%)' }}>${fmt(diff)} left</span>
                )}
              </div>
            )}
          </>
        ) : (
          !isEditing && (
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-fg)' }}>
              ${fmt(spent)}
            </div>
          )
        )}
      </div>

      {isEditing && (
        <div style={{ position: 'relative', zIndex: 10, borderRadius: 'inherit', background: 'hsl(43,35%,95%)', padding: '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          <ArcSlider
            category={category}
            spent={spent}
            value={draftLimit}
            maxValue={maxArcValue}
            dotColor={color}
            onConfirm={onArcConfirm}
            onCancel={onArcCancel}
            onRemove={onArcRemove}
          />
        </div>
      )}
    </div>
  )
}

function ConfirmModal({ multiplier, periodId, onMultiply, onKeep, onCancel }) {
  const body = periodId === 'last-3'
    ? 'Your limits are set monthly. Switching to a 3-month view will multiply each limit by 3 for a fair comparison.'
    : `Your limits are set monthly. For this ${multiplier}-month range, Grove will multiply each limit by ${multiplier} for a fair comparison.`

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
    }}>
      <div style={{
        backgroundColor: 'var(--color-bg)',
        border: '1px solid var(--color-border)',
        borderRadius: 16, padding: '32px 32px 28px',
        maxWidth: 420, width: '90%',
        boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
      }}>
        <h3 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 20, fontWeight: 700,
          margin: '0 0 12px',
          color: 'hsl(145, 38%, 34%)',
        }}>
          Heads up
        </h3>
        <p style={{ fontSize: 14, color: 'var(--color-muted-text)', margin: '0 0 28px', lineHeight: 1.65, fontFamily: "'DM Sans', sans-serif" }}>
          {body}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 500, color: 'var(--color-muted-text)',
              fontFamily: "'DM Sans', sans-serif", padding: '8px 4px',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onKeep}
            style={{
              padding: '8px 16px', borderRadius: 10,
              border: '1px solid hsl(145, 38%, 34%)',
              backgroundColor: 'transparent', color: 'hsl(145, 38%, 34%)',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.backgroundColor = 'hsl(145, 38%, 96%)'}
            onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
          >
            Keep monthly limits
          </button>
          <button
            onClick={onMultiply}
            style={{
              padding: '8px 16px', borderRadius: 10, border: 'none',
              backgroundColor: 'hsl(145, 38%, 34%)', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: 'pointer',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.88'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            Multiply limits ×{multiplier}
          </button>
        </div>
      </div>
    </div>
  )
}
