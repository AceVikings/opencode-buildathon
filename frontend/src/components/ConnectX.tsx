import { useEffect, useState } from 'react'
import { auth } from '../lib/firebase'

const API = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

interface XStatus {
  connected: boolean
  xUsername?: string
  xName?: string
}

/** Returns a fresh Firebase ID token for the current user */
async function getIdToken(): Promise<string> {
  const user = auth.currentUser
  if (!user) throw new Error('Not authenticated')
  return user.getIdToken()
}

export function ConnectX() {
  const [status, setStatus] = useState<XStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [posting, setPosting] = useState(false)
  const [tweetText, setTweetText] = useState('')
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // ── Check connection status on mount & after OAuth redirect ──────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('x_connected') === 'true') {
      // Clean the query param from URL without a page reload
      window.history.replaceState({}, '', window.location.pathname)
      setFeedback({ type: 'success', msg: 'X account connected successfully.' })
    } else if (params.get('x_error')) {
      window.history.replaceState({}, '', window.location.pathname)
      setFeedback({ type: 'error', msg: `X connection failed: ${params.get('x_error')}` })
    }

    fetchStatus()
  }, [])

  async function fetchStatus() {
    setLoading(true)
    try {
      const token = await getIdToken()
      const res = await fetch(`${API}/twitter/status`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ connected: false })
    } finally {
      setLoading(false)
    }
  }

  // ── Initiate OAuth flow ───────────────────────────────────────────────────
  async function handleConnect() {
    try {
      const token = await getIdToken()
      const res = await fetch(`${API}/twitter/connect`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const { authUrl } = await res.json()
      window.location.href = authUrl
    } catch {
      setFeedback({ type: 'error', msg: 'Could not start X connection.' })
    }
  }

  // ── Disconnect ────────────────────────────────────────────────────────────
  async function handleDisconnect() {
    try {
      const token = await getIdToken()
      await fetch(`${API}/twitter/disconnect`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      setStatus({ connected: false })
      setFeedback({ type: 'success', msg: 'X account disconnected.' })
    } catch {
      setFeedback({ type: 'error', msg: 'Failed to disconnect X account.' })
    }
  }

  // ── Post tweet ────────────────────────────────────────────────────────────
  async function handlePost(e: React.FormEvent) {
    e.preventDefault()
    if (!tweetText.trim()) return
    setPosting(true)
    setFeedback(null)
    try {
      const token = await getIdToken()
      const res = await fetch(`${API}/twitter/post`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: tweetText.trim() }),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error ?? 'Unknown error')
      }
      setTweetText('')
      setFeedback({ type: 'success', msg: 'Tweet posted successfully.' })
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to post tweet.'
      setFeedback({ type: 'error', msg })
    } finally {
      setPosting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="border border-charcoal/10 p-8">
        <p className="font-inter text-[11px] text-warm-grey animate-pulse">
          Checking X connection…
        </p>
      </div>
    )
  }

  return (
    <div className="border border-charcoal/10">
      {/* Header */}
      <div className="px-8 py-6 border-b border-charcoal/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {/* X logo mark */}
          <svg
            viewBox="0 0 24 24"
            className="w-4 h-4 fill-charcoal"
            aria-hidden="true"
          >
            <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
          </svg>
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            X Account
          </p>
        </div>
        {status?.connected && (
          <button
            onClick={handleDisconnect}
            className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors duration-200"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="p-8">
        {/* Feedback banner */}
        {feedback && (
          <div
            className={`mb-6 px-4 py-3 font-inter text-[11px] border ${
              feedback.type === 'success'
                ? 'border-gold/40 text-charcoal bg-gold/5'
                : 'border-red-300/50 text-red-700 bg-red-50'
            }`}
          >
            {feedback.msg}
          </div>
        )}

        {!status?.connected ? (
          /* Not connected */
          <div className="flex flex-col items-start gap-4">
            <p className="font-inter text-sm text-warm-grey leading-relaxed max-w-sm">
              Connect your X account to allow Loque to post on your behalf.
            </p>
            <button
              onClick={handleConnect}
              className="group relative overflow-hidden inline-flex items-center gap-2 h-9 px-6 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.22em]"
            >
              <span
                className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                aria-hidden="true"
              />
              <svg
                viewBox="0 0 24 24"
                className="relative z-10 w-3.5 h-3.5 fill-current"
                aria-hidden="true"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
              <span className="relative z-10">Connect X</span>
            </button>
          </div>
        ) : (
          /* Connected */
          <div className="flex flex-col gap-6">
            {/* Account pill */}
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-1.5 bg-gold flex-shrink-0" />
              <p className="font-inter text-[12px] text-charcoal">
                @{status.xUsername}
                {status.xName && (
                  <span className="text-warm-grey ml-2">({status.xName})</span>
                )}
              </p>
            </div>

            {/* Post form */}
            <form onSubmit={handlePost} className="flex flex-col gap-3">
              <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
                Post a tweet
              </label>
              <textarea
                value={tweetText}
                onChange={(e) => setTweetText(e.target.value)}
                placeholder="What's happening?"
                maxLength={280}
                rows={3}
                className="w-full border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/50 resize-none focus:outline-none focus:border-charcoal/40 transition-colors duration-200"
              />
              <div className="flex items-center justify-between">
                <span
                  className={`font-inter text-[10px] ${
                    tweetText.length > 260 ? 'text-red-500' : 'text-warm-grey/60'
                  }`}
                >
                  {tweetText.length} / 280
                </span>
                <button
                  type="submit"
                  disabled={posting || tweetText.trim().length === 0}
                  className="group relative overflow-hidden inline-flex items-center h-9 px-6 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.22em] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <span
                    className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500 group-disabled:hidden"
                    style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                    aria-hidden="true"
                  />
                  <span className="relative z-10">
                    {posting ? 'Posting…' : 'Post'}
                  </span>
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
