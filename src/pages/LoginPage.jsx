import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabaseClient'
import LeafIcon from '../components/LeafIcon'

export default function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message)
      setLoading(false)
      return
    }

    // Check plaid_tokens table for this user
    const { data: tokenRow } = await supabase
      .from('plaid_tokens')
      .select('id')
      .eq('user_id', data.user.id)
      .maybeSingle()

    navigate(tokenRow ? '/dashboard' : '/onboarding', { replace: true })
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <LeafIcon size={32} />
          <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 600, color: 'var(--color-fg)' }}>
            Grove
          </span>
        </div>

        {/* Card */}
        <div style={{ backgroundColor: 'var(--color-bg-card)', border: '1px solid var(--color-border)', borderRadius: 20, padding: '36px 32px' }}>
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 700, color: 'var(--color-fg)', marginBottom: 8 }}>
            Welcome back
          </h1>
          <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 14, color: 'var(--color-muted-text)', marginBottom: 28 }}>
            Sign in to your Grove account.
          </p>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-fg)', marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '11px 14px', borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                  color: 'var(--color-fg)', backgroundColor: 'var(--color-bg)',
                  outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(145,38%,34%)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontFamily: "'DM Sans', sans-serif", fontSize: 13, fontWeight: 500, color: 'var(--color-fg)', marginBottom: 6 }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '11px 14px', borderRadius: 10,
                  border: '1px solid var(--color-border)',
                  fontFamily: "'DM Sans', sans-serif", fontSize: 14,
                  color: 'var(--color-fg)', backgroundColor: 'var(--color-bg)',
                  outline: 'none',
                }}
                onFocus={e => e.target.style.borderColor = 'hsl(145,38%,34%)'}
                onBlur={e => e.target.style.borderColor = 'var(--color-border)'}
              />
            </div>

            {error && (
              <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'hsl(0,65%,50%)', margin: 0 }}>
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                marginTop: 6,
                padding: '13px',
                borderRadius: 10,
                border: 'none',
                backgroundColor: 'hsl(145,38%,34%)',
                color: 'white',
                fontFamily: "'DM Sans', sans-serif",
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'opacity 150ms ease',
              }}>
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>
        </div>

        {/* Switch to signup */}
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 13, color: 'var(--color-muted-text)', textAlign: 'center', marginTop: 20 }}>
          Don't have an account?{' '}
          <Link to="/signup" style={{ color: 'hsl(145,38%,34%)', fontWeight: 500, textDecoration: 'none' }}>
            Sign up
          </Link>
        </p>

      </div>
    </div>
  )
}
