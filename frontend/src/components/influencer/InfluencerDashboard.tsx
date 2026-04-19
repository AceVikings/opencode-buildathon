import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type {
  AgentConfig,
  AgentLogSummary,
  Influencer,
  PostApprovalMode,
  XPostFull,
} from '../../lib/api'
import {
  approvePost,
  getAgentConfig,
  getAgentLogs,
  getAgentStrategy,
  getInfluencerPostsFull,
  getPendingPosts,
  listInfluencers,
  rejectPost,
  requestManualPost,
  runLongTermAgent,
  runShortTermAgent,
  updateAgentConfig,
} from '../../lib/api'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ago(dateStr: string | null) {
  if (!dateStr) return '—'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return `${Math.floor(diff / 86_400_000)}d ago`
}

function fmtNum(n: number | null) {
  if (n == null) return '—'
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

// ── Sub-components ────────────────────────────────────────────────────────────

function MetricPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey/60">{label}</span>
      <span className="font-inter text-[13px] text-charcoal">{fmtNum(value)}</span>
    </div>
  )
}

function PostCard({
  post,
  influencerId,
  onApproved,
  onRejected,
}: {
  post: XPostFull
  influencerId: string
  onApproved: (p: XPostFull) => void
  onRejected: (id: string) => void
}) {
  const [approving, setApproving] = useState(false)
  const [rejecting, setRejecting] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const statusColour =
    post.approvalStatus === 'posted' ? 'bg-gold' :
    post.approvalStatus === 'pending_approval' ? 'bg-warm-grey/40 animate-pulse' :
    'bg-charcoal/20'

  async function handleApprove() {
    setApproving(true)
    try {
      const { post: updated } = await approvePost(influencerId, post._id)
      onApproved(updated)
    } finally { setApproving(false) }
  }

  async function handleReject() {
    setRejecting(true)
    try {
      await rejectPost(influencerId, post._id)
      onRejected(post._id)
    } finally { setRejecting(false) }
  }

  return (
    <div className="border border-charcoal/10 bg-alabaster">
      <div className="flex gap-4 p-5">
        {/* Thumb */}
        {post.heygenThumbUrl ? (
          <div className="w-16 h-24 flex-shrink-0 overflow-hidden border border-charcoal/10">
            <img src={post.heygenThumbUrl} alt="thumb" className="w-full h-full object-cover" />
          </div>
        ) : (
          <div className="w-16 h-24 flex-shrink-0 bg-taupe/40 flex items-center justify-center border border-charcoal/10">
            <span className="font-inter text-[8px] text-warm-grey/50 uppercase">No thumb</span>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 flex-shrink-0 ${statusColour}`} />
              <span className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey">
                {post.approvalStatus === 'posted' ? 'Live' :
                 post.approvalStatus === 'pending_approval' ? 'Pending approval' : 'Rejected'}
              </span>
            </div>
            <span className="font-inter text-[9px] text-warm-grey/50">{ago(post.createdAt)}</span>
          </div>

          <p className="font-inter text-[12px] text-charcoal leading-relaxed line-clamp-2">{post.text}</p>

          {post.agentDecisionSummary && (
            <p className="font-inter text-[10px] text-warm-grey/70 italic line-clamp-1">
              {post.agentDecisionSummary}
            </p>
          )}

          {/* Metrics (posted only) */}
          {post.approvalStatus === 'posted' && (
            <div className="flex gap-4 mt-1">
              <MetricPill label="Views" value={post.metrics?.impressions} />
              <MetricPill label="Likes" value={post.metrics?.likes} />
              <MetricPill label="RT" value={post.metrics?.retweets} />
              <MetricPill label="Replies" value={post.metrics?.replies} />
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 mt-1">
            {post.heygenVideoUrl && (
              <a href={post.heygenVideoUrl} target="_blank" rel="noopener noreferrer"
                className="font-inter text-[9px] uppercase tracking-[0.15em] text-gold hover:text-charcoal transition-colors">
                Watch ▶
              </a>
            )}
            {post.videoScript && (
              <button onClick={() => setExpanded(v => !v)}
                className="font-inter text-[9px] uppercase tracking-[0.15em] text-warm-grey hover:text-charcoal transition-colors">
                {expanded ? 'Hide script' : 'See script'}
              </button>
            )}
            {post.approvalStatus === 'pending_approval' && (
              <>
                <button onClick={handleApprove} disabled={approving}
                  className="font-inter text-[9px] uppercase tracking-[0.15em] text-charcoal border border-charcoal px-3 py-1 hover:bg-charcoal hover:text-white transition-colors disabled:opacity-50">
                  {approving ? '…' : 'Approve'}
                </button>
                <button onClick={handleReject} disabled={rejecting}
                  className="font-inter text-[9px] uppercase tracking-[0.15em] text-warm-grey hover:text-red-500 transition-colors disabled:opacity-50">
                  {rejecting ? '…' : 'Reject'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && post.videoScript && (
        <div className="border-t border-charcoal/10 px-5 py-4 bg-charcoal/[0.02]">
          <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey mb-2">Video script</p>
          <p className="font-inter text-[11px] text-charcoal/80 leading-relaxed whitespace-pre-wrap">{post.videoScript}</p>
        </div>
      )}
    </div>
  )
}

// ── Manual post modal ─────────────────────────────────────────────────────────

function ManualPostModal({ influencerId, onClose, onStarted }: {
  influencerId: string
  onClose: () => void
  onStarted: (logId: string) => void
}) {
  const [topic, setTopic] = useState('')
  const [customScript, setCustomScript] = useState('')
  const [useCustomScript, setUseCustomScript] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!topic.trim() && !customScript.trim()) { setError('Enter a topic or custom script'); return }
    setLoading(true); setError(null)
    try {
      const { logId } = await requestManualPost(influencerId, {
        topic: topic.trim() || customScript.trim().slice(0, 60),
        customScript: useCustomScript ? customScript.trim() : undefined,
      })
      onStarted(logId)
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(26,26,26,0.5)', backdropFilter: 'blur(4px)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-alabaster w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-7 py-5 border-b border-charcoal/10">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-charcoal">Request Post</p>
          <button onClick={onClose} className="font-inter text-[10px] text-warm-grey hover:text-charcoal">Cancel</button>
        </div>
        <form onSubmit={handleSubmit} className="p-7 flex flex-col gap-5">
          {error && <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">{error}</p>}

          <div className="flex flex-col gap-1.5">
            <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Topic / Angle</label>
            <input type="text" value={topic} onChange={e => setTopic(e.target.value)}
              placeholder="e.g. Apple's new chip announcement and what it means for creators"
              className="border border-charcoal/15 bg-transparent px-4 py-2.5 font-inter text-sm text-charcoal placeholder-warm-grey/40 focus:outline-none focus:border-charcoal/40 transition-colors" />
            <p className="font-inter text-[10px] text-warm-grey/60">
              The agent will write the script and generate the video. Takes ~2 minutes.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="useCustom" checked={useCustomScript} onChange={e => setUseCustomScript(e.target.checked)}
              className="w-3.5 h-3.5 accent-charcoal" />
            <label htmlFor="useCustom" className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey cursor-pointer">
              Write my own script
            </label>
          </div>

          {useCustomScript && (
            <div className="flex flex-col gap-1.5">
              <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
                Script (15–30 seconds, ~32–65 words)
              </label>
              <textarea value={customScript} onChange={e => setCustomScript(e.target.value)} rows={4}
                placeholder="Write exactly what the influencer will say…"
                className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors" />
              <span className={`font-inter text-[10px] self-end ${customScript.split(' ').length > 65 ? 'text-red-500' : 'text-warm-grey/50'}`}>
                {customScript.split(' ').filter(Boolean).length} words
              </span>
            </div>
          )}

          <button type="submit" disabled={loading}
            className="group relative overflow-hidden inline-flex items-center justify-center h-10 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-50">
            <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
              style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
            <span className="relative z-10">{loading ? 'Starting…' : 'Generate & Post'}</span>
          </button>
        </form>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'posts' | 'pending' | 'strategy' | 'logs'

export function InfluencerDashboard() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const [inf, setInf] = useState<Influencer | null>(null)
  const [config, setConfig] = useState<AgentConfig | null>(null)
  const [posts, setPosts] = useState<XPostFull[]>([])
  const [pending, setPending] = useState<XPostFull[]>([])
  const [strategy, setStrategy] = useState('')
  const [strategyUpdatedAt, setStrategyUpdatedAt] = useState<string | null>(null)
  const [logs, setLogs] = useState<AgentLogSummary[]>([])
  const [tab, setTab] = useState<Tab>('posts')
  const [loading, setLoading] = useState(true)
  const [agentRunning, setAgentRunning] = useState<'short' | 'long' | null>(null)
  const [manualOpen, setManualOpen] = useState(false)
  const [configSaving, setConfigSaving] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!id) return
    loadAll()
    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [id])

  async function loadAll() {
    if (!id) return
    setLoading(true)
    try {
      const [infList, cfg, postsRes, pendRes, stratRes, logsRes] = await Promise.all([
        listInfluencers(),
        getAgentConfig(id),
        getInfluencerPostsFull(id),
        getPendingPosts(id),
        getAgentStrategy(id),
        getAgentLogs(id),
      ])
      const found = infList.find(i => i._id === id) ?? null
      setInf(found)
      setConfig(cfg)
      setPosts((postsRes as { posts: XPostFull[] }).posts ?? [])
      setPending(pendRes.pending ?? [])
      setStrategy(stratRes.strategy ?? '')
      setStrategyUpdatedAt(stratRes.updatedAt)
      setLogs(logsRes.logs ?? [])
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  async function saveConfig(patch: Partial<AgentConfig>) {
    if (!id) return
    setConfigSaving(true)
    try {
      const updated = await updateAgentConfig(id, patch)
      setConfig(updated)
    } catch { /* silent */ }
    finally { setConfigSaving(false) }
  }

  async function handleRunShortTerm() {
    if (!id) return
    setAgentRunning('short')
    try {
      await runShortTermAgent(id)
      startPoll()
    } catch { setAgentRunning(null) }
  }

  async function handleRunLongTerm() {
    if (!id) return
    setAgentRunning('long')
    try {
      await runLongTermAgent(id)
      startPoll()
    } catch { setAgentRunning(null) }
  }

  function startPoll() {
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      if (!id) return
      try {
        const logsRes = await getAgentLogs(id)
        setLogs(logsRes.logs ?? [])
        const stillRunning = logsRes.logs.some(l => l.status === 'running')
        if (!stillRunning) {
          clearInterval(pollRef.current!)
          pollRef.current = null
          setAgentRunning(null)
          // Refresh posts + pending
          const [postsRes, pendRes, stratRes] = await Promise.all([
            getInfluencerPostsFull(id),
            getPendingPosts(id),
            getAgentStrategy(id),
          ])
          setPosts((postsRes as { posts: XPostFull[] }).posts ?? [])
          setPending(pendRes.pending ?? [])
          setStrategy(stratRes.strategy ?? '')
          setStrategyUpdatedAt(stratRes.updatedAt)
        }
      } catch { /* silent */ }
    }, 5_000)
  }

  const tabClass = (t: Tab) =>
    `font-inter text-[10px] uppercase tracking-[0.2em] px-5 py-3 border-b-2 transition-colors ${
      tab === t ? 'border-charcoal text-charcoal' : 'border-transparent text-warm-grey hover:text-charcoal'
    }`

  const postedPosts = posts.filter(p => p.approvalStatus === 'posted')
  const totalImpressions = postedPosts.reduce((s, p) => s + (p.metrics?.impressions ?? 0), 0)
  const totalEngagements = postedPosts.reduce((s, p) => s + (p.metrics?.engagements ?? 0), 0)
  const totalLikes = postedPosts.reduce((s, p) => s + (p.metrics?.likes ?? 0), 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-alabaster flex items-center justify-center">
        <p className="font-inter text-sm text-warm-grey animate-pulse">Loading…</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-alabaster">
      <div className="noise-overlay" aria-hidden="true" />

      {manualOpen && id && (
        <ManualPostModal
          influencerId={id}
          onClose={() => setManualOpen(false)}
          onStarted={() => { startPoll(); setTab('posts') }}
        />
      )}

      {/* Top bar */}
      <header className="relative z-10 border-b border-charcoal/10 bg-alabaster/95 sticky top-0" style={{ backdropFilter: 'blur(12px)' }}>
        <div className="max-w-[1400px] mx-auto px-8 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate('/dashboard')}
              className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey hover:text-charcoal transition-colors">
              ← Fleet
            </button>
            <span className="w-px h-4 bg-charcoal/20" />
            <span className="font-playfair text-base tracking-[0.12em] uppercase text-charcoal">
              {inf?.name ?? 'Influencer'}
            </span>
            {inf?.niche && (
              <span className="font-inter text-[10px] text-warm-grey hidden sm:block">— {inf.niche}</span>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => setManualOpen(true)}
              className="group relative overflow-hidden inline-flex items-center h-8 px-5 border border-charcoal text-charcoal font-inter text-[9px] uppercase tracking-[0.18em] hover:text-white transition-colors duration-300">
              <span className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
              <span className="relative z-10">+ Request Post</span>
            </button>

            <button onClick={handleRunShortTerm} disabled={agentRunning !== null}
              className="group relative overflow-hidden inline-flex items-center h-8 px-5 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em] disabled:opacity-50">
              <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
              <span className="relative z-10">
                {agentRunning === 'short' ? '▶ Running…' : '▶ Run Agent'}
              </span>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* ── Left: main content ── */}
          <div className="lg:col-span-8 flex flex-col gap-6">

            {/* Stats row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-charcoal/10 border border-charcoal/10">
              {[
                { label: 'Posts live', value: postedPosts.length },
                { label: 'Impressions', value: fmtNum(totalImpressions) },
                { label: 'Engagements', value: fmtNum(totalEngagements) },
                { label: 'Likes', value: fmtNum(totalLikes) },
              ].map(({ label, value }) => (
                <div key={label} className="bg-alabaster px-5 py-5">
                  <p className="font-inter text-[9px] uppercase tracking-[0.2em] text-warm-grey mb-1">{label}</p>
                  <p className="font-playfair text-3xl text-charcoal leading-none">{value || '—'}</p>
                </div>
              ))}
            </div>

            {/* Pending approval banner */}
            {pending.length > 0 && (
              <div className="border border-gold/40 bg-gold/5 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-1.5 h-1.5 bg-gold animate-pulse" />
                  <p className="font-inter text-[11px] text-charcoal">
                    {pending.length} post{pending.length > 1 ? 's' : ''} awaiting your approval
                  </p>
                </div>
                <button onClick={() => setTab('pending')}
                  className="font-inter text-[10px] uppercase tracking-[0.18em] text-gold hover:text-charcoal transition-colors">
                  Review →
                </button>
              </div>
            )}

            {/* Tab bar */}
            <div className="flex border-b border-charcoal/10 -mb-2">
              <button className={tabClass('posts')} onClick={() => setTab('posts')}>
                Posts {postedPosts.length > 0 && <span className="ml-1 text-warm-grey/50">({postedPosts.length})</span>}
              </button>
              <button className={tabClass('pending')} onClick={() => setTab('pending')}>
                Pending
                {pending.length > 0 && (
                  <span className="ml-1.5 font-inter text-[8px] bg-gold text-white px-1.5 py-0.5">{pending.length}</span>
                )}
              </button>
              <button className={tabClass('strategy')} onClick={() => setTab('strategy')}>Strategy</button>
              <button className={tabClass('logs')} onClick={() => setTab('logs')}>Agent Logs</button>
            </div>

            {/* Posts tab */}
            {tab === 'posts' && (
              <div className="flex flex-col gap-3">
                {posts.length === 0 ? (
                  <div className="border border-dashed border-charcoal/15 flex flex-col items-center justify-center py-16 gap-3">
                    <div className="w-6 h-px bg-gold" />
                    <p className="font-inter text-sm text-warm-grey">No posts yet.</p>
                    <p className="font-inter text-[11px] text-warm-grey/60">Run the agent or request a post to get started.</p>
                  </div>
                ) : (
                  posts.map(post => (
                    <PostCard key={post._id} post={post} influencerId={id!}
                      onApproved={updated => {
                        setPosts(prev => prev.map(p => p._id === updated._id ? updated : p))
                        setPending(prev => prev.filter(p => p._id !== updated._id))
                      }}
                      onRejected={pid => {
                        setPosts(prev => prev.map(p => p._id === pid ? { ...p, approvalStatus: 'rejected' } : p))
                        setPending(prev => prev.filter(p => p._id !== pid))
                      }}
                    />
                  ))
                )}
              </div>
            )}

            {/* Pending tab */}
            {tab === 'pending' && (
              <div className="flex flex-col gap-3">
                {pending.length === 0 ? (
                  <p className="font-inter text-sm text-warm-grey/60 py-8 text-center">No drafts awaiting approval.</p>
                ) : (
                  pending.map(post => (
                    <PostCard key={post._id} post={post} influencerId={id!}
                      onApproved={updated => {
                        setPosts(prev => [updated, ...prev.filter(p => p._id !== updated._id)])
                        setPending(prev => prev.filter(p => p._id !== updated._id))
                      }}
                      onRejected={pid => setPending(prev => prev.filter(p => p._id !== pid))}
                    />
                  ))
                )}
              </div>
            )}

            {/* Strategy tab */}
            {tab === 'strategy' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  {strategyUpdatedAt && (
                    <p className="font-inter text-[10px] text-warm-grey/60">
                      Updated {ago(strategyUpdatedAt)}
                    </p>
                  )}
                  <button onClick={handleRunLongTerm} disabled={agentRunning !== null}
                    className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey border border-charcoal/20 px-4 py-1.5 hover:border-charcoal/50 hover:text-charcoal transition-colors disabled:opacity-40">
                    {agentRunning === 'long' ? 'Running…' : '↻ Refresh strategy'}
                  </button>
                </div>
                {strategy ? (
                  <div className="bg-charcoal/[0.02] border border-charcoal/8 p-6">
                    <pre className="font-inter text-[11px] text-charcoal/80 whitespace-pre-wrap leading-relaxed">{strategy}</pre>
                  </div>
                ) : (
                  <div className="border border-dashed border-charcoal/15 py-12 flex flex-col items-center gap-3">
                    <p className="font-inter text-sm text-warm-grey/60">No strategy yet.</p>
                    <button onClick={handleRunLongTerm} disabled={agentRunning !== null}
                      className="font-inter text-[10px] uppercase tracking-[0.18em] text-charcoal border border-charcoal/30 px-5 py-2 hover:bg-charcoal hover:text-white transition-colors disabled:opacity-40">
                      Generate now
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Logs tab */}
            {tab === 'logs' && (
              <div className="flex flex-col gap-2">
                {logs.length === 0 ? (
                  <p className="font-inter text-sm text-warm-grey/60 py-8 text-center">No agent runs yet.</p>
                ) : (
                  logs.map(log => (
                    <div key={log._id} className="border border-charcoal/10 px-5 py-4 flex items-start gap-3">
                      <div className={`w-1.5 h-1.5 mt-1.5 flex-shrink-0 ${
                        log.status === 'completed' ? 'bg-gold' :
                        log.status === 'failed' ? 'bg-red-400' : 'bg-warm-grey/40 animate-pulse'
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-inter text-[9px] uppercase tracking-[0.18em] ${log.agentType === 'short_term' ? 'text-charcoal' : 'text-gold'}`}>
                            {log.agentType === 'short_term' ? 'Short-term' : 'Long-term'}
                          </span>
                          <span className="font-inter text-[9px] text-warm-grey/50">{ago(log.createdAt)}</span>
                        </div>
                        <p className="font-inter text-[11px] text-charcoal mt-0.5 line-clamp-2">
                          {log.status === 'running' ? 'Running…' :
                           log.status === 'failed' ? `Failed: ${log.error ?? ''}` :
                           (log.summary || 'Completed')}
                        </p>
                        {log.durationMs != null && (
                          <p className="font-inter text-[9px] text-warm-grey/40 mt-0.5">{(log.durationMs / 1000).toFixed(1)}s</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* ── Right: config sidebar ── */}
          <div className="lg:col-span-4 flex flex-col gap-5">

            {/* Avatar */}
            {inf?.selectedImageUrl && (
              <div className="aspect-square overflow-hidden border border-charcoal/10">
                <img src={inf.selectedImageUrl} alt={inf.name} className="w-full h-full object-cover" />
              </div>
            )}

            {/* Agent schedule config */}
            {config && (
              <div className="border border-charcoal/10">
                <div className="px-5 py-4 border-b border-charcoal/10">
                  <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Agent Schedule</p>
                </div>
                <div className="p-5 flex flex-col gap-5">
                  {/* Enable toggle */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-inter text-[12px] text-charcoal">Auto-post</p>
                      <p className="font-inter text-[10px] text-warm-grey/60 mt-0.5">
                        {config.agentEnabled
                          ? `Next run ${ago(config.agentNextRunAt)}`
                          : 'Disabled'}
                      </p>
                    </div>
                    <button
                      onClick={() => saveConfig({ agentEnabled: !config.agentEnabled })}
                      disabled={configSaving}
                      className={`w-10 h-5 rounded-full transition-colors relative ${config.agentEnabled ? 'bg-charcoal' : 'bg-charcoal/20'}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${config.agentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Interval */}
                  <div className="flex flex-col gap-1.5">
                    <label className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey">
                      Post every
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={5}
                        value={config.agentIntervalMins}
                        onChange={e => setConfig({ ...config, agentIntervalMins: Number(e.target.value) })}
                        onBlur={e => saveConfig({ agentIntervalMins: Number(e.target.value) })}
                        className="w-20 border border-charcoal/15 bg-transparent px-3 py-1.5 font-inter text-sm text-charcoal text-center focus:outline-none focus:border-charcoal/40 transition-colors"
                      />
                      <span className="font-inter text-[11px] text-warm-grey">minutes</span>
                    </div>
                  </div>

                  {/* Approval mode */}
                  <div className="flex flex-col gap-2">
                    <label className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey">
                      Post mode
                    </label>
                    <div className="flex gap-2">
                      {(['auto', 'approve'] as PostApprovalMode[]).map(mode => (
                        <button key={mode} onClick={() => saveConfig({ postApprovalMode: mode })}
                          className={`flex-1 font-inter text-[9px] uppercase tracking-[0.15em] py-2 border transition-colors ${
                            config.postApprovalMode === mode
                              ? 'bg-charcoal text-white border-charcoal'
                              : 'text-warm-grey border-charcoal/20 hover:border-charcoal/40'
                          }`}>
                          {mode === 'auto' ? 'Auto-post' : 'Approve first'}
                        </button>
                      ))}
                    </div>
                    <p className="font-inter text-[9px] text-warm-grey/60">
                      {config.postApprovalMode === 'auto'
                        ? 'Agent posts immediately after generating content'
                        : 'Agent drafts content for your review before posting'}
                    </p>
                  </div>

                  {/* Last ran */}
                  {config.agentLastRanAt && (
                    <p className="font-inter text-[10px] text-warm-grey/50">
                      Last ran: {ago(config.agentLastRanAt)}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Goal */}
            {inf?.goal && (
              <div className="border border-charcoal/10 p-5">
                <p className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey mb-2">Current Goal</p>
                <p className="font-inter text-[12px] text-charcoal leading-relaxed">{inf.goal}</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
