import { useState, useRef, useEffect } from 'react'
import { supabase } from '../supabaseClient'
import hamiltonIcon from '../assets/hamilton-icon.png'

const EDGE_URL = 'https://dovjukmgimhslsskmjhk.supabase.co/functions/v1/hamilton-chat'

function formatTime(date) {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function TypingIndicator() {
  return (
    <div style={{ alignSelf: 'flex-start' }}>
      <div style={{
        background: 'var(--color-muted-bg)',
        color: 'var(--color-fg)',
        padding: '10px 14px',
        borderRadius: '4px 16px 16px 16px',
        display: 'flex',
        gap: 4,
        alignItems: 'center',
        height: 36,
      }}>
        {[0, 1, 2].map(i => (
          <span key={i} style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--color-muted-text)',
            display: 'inline-block',
            animation: 'hamilton-dot-bounce 1.2s ease-in-out infinite',
            animationDelay: `${i * 0.2}s`,
          }} />
        ))}
      </div>
    </div>
  )
}

const STYLE_INSTRUCTIONS = {
  concise:  'Keep all responses very short and to the point. No lengthy explanations.',
  detailed: 'Give thorough, detailed responses with full context and breakdowns.',
  hype:     'Be enthusiastic and encouraging. Celebrate wins and motivate the user.',
  roast:    "Be brutally honest and don't sugarcoat anything about the user's spending habits. Roast them when appropriate.",
}

export default function HamiltonAI({ isOpen, onClose, userName, displayName, hamiltonStyle, financialContext }) {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    if (isOpen) textareaRef.current?.focus()
  }, [isOpen])

  async function handleSend() {
    const text = input.trim()
    if (!text || isLoading) return

    const userMsg = { role: 'user', content: text, time: new Date() }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setInput('')
    setIsLoading(true)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(EDGE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({
          messages: nextMessages.map(m => ({ role: m.role, content: m.content })),
          context: `The user's name is ${displayName || 'the user'}.${STYLE_INSTRUCTIONS[hamiltonStyle] ? ' ' + STYLE_INSTRUCTIONS[hamiltonStyle] : ''}\n\n${financialContext}`,
        }),
      })

      const data = await res.json()
      const reply = res.ok ? (data.reply ?? '') : null

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: reply ?? 'Sorry, I ran into an issue. Please try again.',
        time: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I ran into an issue. Please try again.',
        time: new Date(),
      }])
    } finally {
      setIsLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const sendDisabled = !input.trim() || isLoading

  return (
    <>
      <style>{`
        @keyframes hamilton-dot-bounce {
          0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
          30% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>

      <div style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 380,
        height: '100vh',
        zIndex: 100,
        background: 'var(--color-bg-card)',
        borderLeft: '1px solid var(--color-border)',
        boxShadow: '-8px 0 32px rgba(0,0,0,0.08)',
        display: 'flex',
        flexDirection: 'column',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 300ms ease',
      }}>

        {/* Header */}
        <div style={{
          flexShrink: 0,
          padding: '16px 20px',
          borderBottom: '1px solid var(--color-border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <img src={hamiltonIcon} alt="Hamilton AI" style={{ width: 20, height: 20 }} />
              <span style={{
                fontFamily: 'Playfair Display, serif',
                fontSize: 16,
                color: 'var(--color-fg)',
              }}>
                Hamilton AI
              </span>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 24,
                color: 'var(--color-muted-text)',
                cursor: 'pointer',
                lineHeight: 1,
                padding: 0,
              }}
            >
              ×
            </button>
          </div>
          <div style={{
            marginTop: 4,
            fontSize: 11,
            color: 'var(--color-muted-text)',
            fontFamily: 'DM Sans, sans-serif',
          }}>
            Your personal finance assistant
          </div>
        </div>

        {/* Messages */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
        }}>
          {messages.length === 0 && (
            <div style={{ alignSelf: 'flex-start' }}>
              <div style={{
                background: 'var(--color-muted-bg)',
                color: 'var(--color-fg)',
                padding: '10px 14px',
                borderRadius: '4px 16px 16px 16px',
                maxWidth: '85%',
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                Hey {displayName || userName}, how can I help you today?
              </div>
              <div style={{
                fontSize: 10,
                color: 'var(--color-muted-text)',
                marginTop: 2,
              }}>
                {formatTime(new Date())}
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isUser = msg.role === 'user'
            return (
              <div key={i} style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: isUser ? 'flex-end' : 'flex-start',
              }}>
                <div style={{
                  background: isUser ? 'var(--color-primary)' : 'var(--color-muted-bg)',
                  color: isUser ? 'white' : 'var(--color-fg)',
                  padding: '10px 14px',
                  borderRadius: isUser ? '16px 4px 16px 16px' : '4px 16px 16px 16px',
                  display: 'inline-block',
                  width: 'fit-content',
                  maxWidth: '75%',
                  marginLeft: isUser ? 'auto' : undefined,
                  fontSize: 13,
                  lineHeight: 1.5,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}>
                  {msg.content}
                </div>
                <div style={{
                  fontSize: 10,
                  color: 'var(--color-muted-text)',
                  marginTop: 2,
                }}>
                  {formatTime(msg.time)}
                </div>
              </div>
            )
          })}

          {isLoading && <TypingIndicator />}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{
          flexShrink: 0,
          borderTop: '1px solid var(--color-border)',
          padding: 16,
          display: 'flex',
          alignItems: 'flex-end',
          gap: 8,
        }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Hamilton anything..."
            rows={1}
            style={{
              flex: 1,
              border: 'none',
              background: 'var(--color-muted-bg)',
              borderRadius: 12,
              padding: '10px 14px',
              fontSize: 13,
              fontFamily: 'DM Sans, sans-serif',
              color: 'var(--color-fg)',
              resize: 'none',
              minHeight: 40,
              maxHeight: 120,
              outline: 'none',
              overflowY: 'auto',
            }}
          />
          <button
            onClick={handleSend}
            disabled={sendDisabled}
            style={{
              flexShrink: 0,
              marginLeft: 0,
              width: 36,
              height: 36,
              borderRadius: '50%',
              background: 'var(--color-primary)',
              border: 'none',
              cursor: sendDisabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              opacity: sendDisabled ? 0.4 : 1,
              transition: 'opacity 150ms ease',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M22 2L11 13" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M22 2L15 22L11 13L2 9L22 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </>
  )
}
