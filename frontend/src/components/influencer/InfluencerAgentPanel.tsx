import { useEffect, useRef, useState } from 'react'
import type {
  AgentLogFull,
  AgentLogSummary,
  AgentStep,
  AgentType,
} from '../../lib/api'
import {
  runShortTermAgent,
  runLongTermAgent,
  getAgentLogs,
  getAgentLog,
  getAgentStrategy,
} from '../../lib/api'

interface Props {
  influencerId: string
  influencerName: string
  hasXConnection: boolean
}

// ── Step icon + colour map ────────────────────────────────────────────────────

const STEP_META: Record<AgentStep['type'], { label: string; colour: string; glyph: string }> = {
  thought:     { label: 'Thought',     colour: 'text-warm-grey',  glyph: '◎' },
  tool_call:   { label: 'Tool call',   colour: 'text-gold',       glyph: '⟶' },
  tool_result: { label: 'Tool result', colour: 'text-charcoal/60', glyph: '⟵' },
  decision:    { label: 'Decision',    colour: 'text-charcoal',   glyph: '✓' },
}

// ── Sub-component: single log entry expanded ──────────────────────────────────

function LogDetail({ influencerId, log }: { influencerId: string; log: AgentLogSummary }) {
  const [full, setFull] = useState<AgentLogFull | null>(null)
  const [loading, setLoading] = useState(false)

  async function load() {
    if (full) return
    setLoading(true)
    try {
      const { log: fullLog } = await getAgentLog(influencerId, log._id)
      setFull(fullLog)
    } catch { /* silent */ }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [log._id])

  if (loading) return (
    <p className="font-inter text-[10px] text-warm-grey/60 animate-pulse py-2">Loading trace…</p>
  )

  if (!full) return null

  return (
    <div className="flex flex-col gap-0 mt-3 border-l border-charcoal/10 ml-2 pl-4">
      {full.steps.map((step, i) => {
        const meta = STEP_META[step.type] ?? STEP_META.thought
        return (
          <div key={i} className="flex gap-2 py-1.5 border-b border-charcoal/5 last:border-0">
            <span className={`font-mono text-[11px] flex-shrink-0 w-4 ${meta.colour}`}>{meta.glyph}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className={`font-inter text-[9px] uppercase tracking-[0.18em] ${meta.colour}`}>
                  {meta.label}{step.tool ? ` · ${step.tool}` : ''}
                </span>
              </div>
              <p className="font-mono text-[10px] text-charcoal/80 whitespace-pre-wrap break-words leading-relaxed">
                {step.content.slice(0, 600)}{step.content.length > 600 ? '…' : ''}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Sub-component: log list item ──────────────────────────────────────────────

function LogItem({ influencerId, log }: { influencerId: string; log: AgentLogSummary }) {
  const [expanded, setExpanded] = useState(false)

  const statusColour = log.status === 'completed'
    ? 'bg-gold'
    : log.status === 'failed'
    ? 'bg-red-400'
    : 'bg-warm-grey/40 animate-pulse'

  const ago = (() => {
    const diff = Date.now() - new Date(log.createdAt).getTime()
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return `${Math.floor(diff / 86_400_000)}d ago`
  })()

  return (
    <div className="border border-charcoal/10 bg-alabaster">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-charcoal/[0.02] transition-colors"
      >
        <div className={`w-1.5 h-1.5 mt-1.5 flex-shrink-0 ${statusColour}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className={`font-inter text-[9px] uppercase tracking-[0.18em] ${log.agentType === 'short_term' ? 'text-charcoal' : 'text-gold'}`}>
              {log.agentType === 'short_term' ? 'Short-term' : 'Long-term'}
            </span>
            <span className="font-inter text-[9px] text-warm-grey/60">{ago}</span>
          </div>
          <p className="font-inter text-[11px] text-charcoal mt-0.5 line-clamp-2">
            {log.status === 'running'
              ? 'Running…'
              : log.status === 'failed'
              ? `Failed: ${log.error ?? 'unknown error'}`
              : (log.summary || 'Completed')}
          </p>
          {log.durationMs != null && (
            <p className="font-inter text-[9px] text-warm-grey/50 mt-0.5">{(log.durationMs / 1000).toFixed(1)}s</p>
          )}
        </div>
        <span className="font-inter text-[10px] text-warm-grey/40 flex-shrink-0 mt-0.5">
          {expanded ? '▲' : '▼'}
        </span>
      </button>

      {expanded && log.status !== 'running' && (
        <div className="px-4 pb-4">
          <LogDetail influencerId={influencerId} log={log} />
        </div>
      )}
    </div>
  )
}

// ── Main panel ────────────────────────────────────────────────────────────────

type Tab = 'logs' | 'strategy'

export function InfluencerAgentPanel({ influencerId, influencerName, hasXConnection }: Props) {
  const [visible, setVisible] = useState(false)
  const [tab, setTab] = useState<Tab>('logs')

  const [logs, setLogs] = useState<AgentLogSummary[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const [strategy, setStrategy] = useState<string>('')
  const [strategyUpdatedAt, setStrategyUpdatedAt] = useState<string | null>(null)
  const [strategyLoading, setStrategyLoading] = useState(false)

  const [running, setRunning] = useState<AgentType | null>(null)
  const [runError, setRunError] = useState<string | null>(null)

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  useEffect(() => () => stopPolling(), [])

  async function loadLogs() {
    setLogsLoading(true)
    try {
      const { logs: fetched } = await getAgentLogs(influencerId)
      setLogs(fetched)
    } catch { /* silent */ }
    finally { setLogsLoading(false) }
  }

  async function loadStrategy() {
    setStrategyLoading(true)
    try {
      const { strategy: s, updatedAt } = await getAgentStrategy(influencerId)
      setStrategy(s)
      setStrategyUpdatedAt(updatedAt)
    } catch { /* silent */ }
    finally { setStrategyLoading(false) }
  }

  useEffect(() => {
    if (!visible) return
    if (tab === 'logs') loadLogs()
    else loadStrategy()
  }, [visible, tab])

  async function handleRun(type: AgentType) {
    setRunning(type); setRunError(null)
    try {
      if (type === 'short_term') {
        await runShortTermAgent(influencerId)
      } else {
        await runLongTermAgent(influencerId)
      }

      // Refresh logs after a short delay, then poll while running
      await loadLogs()
      stopPolling()
      pollRef.current = setInterval(async () => {
        const { logs: fresh } = await getAgentLogs(influencerId)
        setLogs(fresh)
        const stillRunning = fresh.some((l) => l.status === 'running')
        if (!stillRunning) {
          stopPolling()
          if (type === 'long_term') loadStrategy()
        }
      }, 4_000)
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Failed to run agent')
    } finally {
      setRunning(null)
    }
  }

  const tabClass = (t: Tab) =>
    `font-inter text-[10px] uppercase tracking-[0.2em] px-5 py-2.5 border-b-2 transition-colors duration-200 ${
      tab === t
        ? 'border-charcoal text-charcoal'
        : 'border-transparent text-warm-grey hover:text-charcoal'
    }`

  return (
    <div className="border border-charcoal/10">
      {/* Toggle header */}
      <button
        onClick={() => setVisible((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-charcoal/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Agent Debug View
          </span>
          <span className="font-inter text-[8px] uppercase tracking-[0.15em] bg-gold/20 text-gold px-2 py-0.5">
            Beta
          </span>
        </div>
        <span className="font-inter text-[10px] text-warm-grey/40">{visible ? '▲ Hide' : '▼ Show'}</span>
      </button>

      {visible && (
        <div className="border-t border-charcoal/10">
          {/* Run buttons */}
          <div className="px-6 pt-5 pb-4 flex flex-wrap items-center gap-3">
            {runError && (
              <p className="w-full font-inter text-[11px] text-red-600 mb-1">{runError}</p>
            )}

            <button
              onClick={() => handleRun('short_term')}
              disabled={running !== null || !hasXConnection}
              title={!hasXConnection ? 'Connect an X account first' : undefined}
              className="group relative overflow-hidden inline-flex items-center h-8 px-5 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em] disabled:opacity-40"
            >
              <span
                className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                aria-hidden="true"
              />
              <span className="relative z-10">
                {running === 'short_term' ? 'Running…' : '▶ Run Short-Term Agent'}
              </span>
            </button>

            <button
              onClick={() => handleRun('long_term')}
              disabled={running !== null}
              className="group relative overflow-hidden inline-flex items-center h-8 px-5 border border-charcoal text-charcoal font-inter text-[9px] uppercase tracking-[0.18em] disabled:opacity-40 hover:text-white transition-colors duration-300"
            >
              <span
                className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }}
                aria-hidden="true"
              />
              <span className="relative z-10">
                {running === 'long_term' ? 'Running…' : '▶ Run Long-Term Agent'}
              </span>
            </button>

            <p className="font-inter text-[10px] text-warm-grey/50 ml-auto">
              {influencerName}
            </p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-charcoal/10 px-6">
            <button className={tabClass('logs')} onClick={() => setTab('logs')}>Agent Logs</button>
            <button className={tabClass('strategy')} onClick={() => setTab('strategy')}>Long-Term Strategy</button>
          </div>

          <div className="p-6">
            {/* Logs tab */}
            {tab === 'logs' && (
              <div className="flex flex-col gap-2">
                {logsLoading ? (
                  <p className="font-inter text-[11px] text-warm-grey animate-pulse">Loading logs…</p>
                ) : logs.length === 0 ? (
                  <p className="font-inter text-sm text-warm-grey/60">
                    No agent runs yet. Click a Run button above to start.
                  </p>
                ) : (
                  logs.map((log) => (
                    <LogItem key={log._id} influencerId={influencerId} log={log} />
                  ))
                )}
              </div>
            )}

            {/* Strategy tab */}
            {tab === 'strategy' && (
              <div className="flex flex-col gap-4">
                {strategyLoading ? (
                  <p className="font-inter text-[11px] text-warm-grey animate-pulse">Loading strategy…</p>
                ) : strategy ? (
                  <>
                    {strategyUpdatedAt && (
                      <p className="font-inter text-[10px] text-warm-grey/60">
                        Last updated: {new Date(strategyUpdatedAt).toLocaleString()}
                      </p>
                    )}
                    <div className="bg-charcoal/[0.02] border border-charcoal/8 p-5">
                      <pre className="font-inter text-[11px] text-charcoal/80 whitespace-pre-wrap leading-relaxed">
                        {strategy}
                      </pre>
                    </div>
                  </>
                ) : (
                  <p className="font-inter text-sm text-warm-grey/60">
                    No strategy generated yet. Run the Long-Term Agent to build one.
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
