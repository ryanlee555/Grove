import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { usePlaidLink } from 'react-plaid-link'
import { supabase } from '../supabaseClient'
import LeafIcon from '../components/LeafIcon'

const FUNCTIONS_BASE = 'https://dovjukmgimhslsskmjhk.supabase.co/functions/v1'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const [linkToken, setLinkToken] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exchanging, setExchanging] = useState(false)

  // Fetch link token on mount — wait for INITIAL_SESSION so the token is guaranteed loaded
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event !== 'INITIAL_SESSION') return
      subscription.unsubscribe()

      if (!session) {
        navigate('/login', { replace: true })
        return
      }

      const res = await fetch(`${FUNCTIONS_BASE}/create-link-token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
      })

      const data = await res.json()

      if (!res.ok || !data.link_token) {
        setError('Failed to initialize Plaid. Please try again.')
        setLoading(false)
        return
      }

      setLinkToken(data.link_token)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [navigate])

  // Handle Plaid Link success
  const onSuccess = useCallback(async (public_token) => {
    setExchanging(true)
    setError('')

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
      navigate('/login', { replace: true })
      return
    }

    const res = await fetch(`${FUNCTIONS_BASE}/exchange-public-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ public_token }),
    })

    const data = await res.json()

    if (!res.ok || !data.success) {
      setError('Failed to connect your account. Please try again.')
      setExchanging(false)
      return
    }

    navigate('/dashboard', { replace: true })
  }, [navigate])

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  })

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--color-bg)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <LeafIcon size={32} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: 'var(--color-fg)' }}>
            Grove
          </span>
        </div>

        {/* Card */}
        <div style={{
          backgroundColor: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)',
          borderRadius: 20,
          padding: '40px 36px',
          textAlign: 'center',
        }}>
          {/* Lock icon */}
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            backgroundColor: 'hsl(140,30%,88%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
              stroke="hsl(145,38%,34%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>

          <h1 style={{
            fontFamily: "'Playfair Display', serif",
            fontSize: 28, fontWeight: 700,
            color: 'var(--color-fg)',
            marginBottom: 12,
          }}>
            Connect your bank
          </h1>

          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 14, lineHeight: 1.7,
            color: 'var(--color-muted-text)',
            marginBottom: 32,
            maxWidth: 320, margin: '0 auto 32px',
          }}>
            Grove uses Plaid to securely connect to your financial accounts.
            Your credentials are never stored by Grove.
          </p>

          {error && (
            <p style={{
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 13, color: 'hsl(0,65%,50%)',
              marginBottom: 16,
            }}>
              {error}
            </p>
          )}

          <button
            onClick={() => open()}
            disabled={loading || !ready || exchanging}
            style={{
              width: '100%',
              padding: '14px',
              borderRadius: 12,
              border: 'none',
              backgroundColor: 'hsl(145,38%,34%)',
              color: 'white',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: 15, fontWeight: 600,
              cursor: (loading || !ready || exchanging) ? 'not-allowed' : 'pointer',
              opacity: (loading || !ready || exchanging) ? 0.65 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            {loading ? 'Loading…' : exchanging ? 'Connecting…' : 'Connect your bank'}
          </button>

          {/* Plaid trust badge */}
          <p style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 12,
            color: 'var(--color-muted-text)',
            marginTop: 16,
          }}>
            Secured by{' '}
            <span style={{ fontWeight: 600, color: 'var(--color-fg)' }}>Plaid</span>
            {' '}· 256-bit encryption · Read-only access
          </p>
        </div>

      </div>
    </div>
  )
}
