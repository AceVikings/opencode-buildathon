import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AvatarCandidate, Influencer, Voice } from '../../lib/api'
import {
  generateAvatars,
  selectAvatar,
  connectInfluencerX,
  getInfluencerXStatus,
  disconnectInfluencerX,
  requestManualPost,
  getAgentConfig,
  updateAgentConfig,
  listVoices,
} from '../../lib/api'

interface Props {
  influencer: Influencer
  onUpdated: (inf: Influencer) => void
  onComplete: (inf: Influencer) => void
}

interface XStatus {
  connected: boolean
  xUsername?: string
  xName?: string
}

export function Step3Appearance({ influencer, onUpdated, onComplete }: Props) {
  const navigate = useNavigate()

  const [prompt, setPrompt] = useState(influencer.imagePrompt)
  const [candidates, setCandidates] = useState<AvatarCandidate[]>(influencer.avatarCandidates ?? [])
  const [selectedAvatarId, setSelectedAvatarId] = useState<string | null>(influencer.heygenAvatarId)
  const [generating, setGenerating] = useState(false)
  const [selecting, setSelecting] = useState(false)

  // Voice
  const [voices, setVoices] = useState<Voice[]>([])
  const [voicesLoading, setVoicesLoading] = useState(false)
  const [selectedVoiceId, setSelectedVoiceId] = useState<string | null>(influencer.heygenVoiceId ?? null)
  const [genderFilter, setGenderFilter] = useState<'all' | 'female' | 'male'>('all')
  const [playingId, setPlayingId] = useState<string | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const [xStatus, setXStatus] = useState<XStatus | null>(null)
  const [xLoading, setXLoading] = useState(true)
  const [xDisconnecting, setXDisconnecting] = useState(false)

  // Posting
  const [posting, setPosting] = useState(false)

  // Schedule config (loaded once avatar is selected)
  const [agentEnabled, setAgentEnabled] = useState(influencer.agentEnabled ?? false)
  const [intervalMins, setIntervalMins] = useState(influencer.agentIntervalMins ?? 30)
  const [approvalMode, setApprovalMode] = useState<'auto' | 'approve'>(influencer.postApprovalMode ?? 'approve')
  const [configSaving, setConfigSaving] = useState(false)

  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const isComplete = influencer.status === 'complete' || !!influencer.heygenAvatarId

  // Fetch X status + agent config on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('x_connected') === 'true' && params.get('inf') === influencer._id) {
      window.history.replaceState({}, '', window.location.pathname)
    } else if (params.get('x_error')) {
      setError(`X connection failed: ${params.get('x_error')}`)
      window.history.replaceState({}, '', window.location.pathname)
    }
    fetchXStatus()
    fetchVoices()
    if (isComplete) loadAgentConfig()
  }, [influencer._id])

  async function fetchVoices() {
    setVoicesLoading(true)
    try {
      const { voices: v } = await listVoices()
      setVoices(v)
    } catch { /* silent */ }
    finally { setVoicesLoading(false) }
  }

  function playPreview(voice: Voice) {
    if (playingId === voice.id) {
      audioRef.current?.pause()
      setPlayingId(null)
      return
    }
    if (audioRef.current) audioRef.current.pause()
    const audio = new Audio(voice.previewUrl)
    audioRef.current = audio
    audio.onended = () => setPlayingId(null)
    audio.play().catch(() => {})
    setPlayingId(voice.id)
  }

  async function fetchXStatus() {
    setXLoading(true)
    try {
      const s = await getInfluencerXStatus(influencer._id)
      setXStatus(s)
    } catch {
      setXStatus({ connected: false })
    } finally {
      setXLoading(false)
    }
  }

  async function loadAgentConfig() {
    try {
      const cfg = await getAgentConfig(influencer._id)
      setAgentEnabled(cfg.agentEnabled)
      setIntervalMins(cfg.agentIntervalMins)
      setApprovalMode(cfg.postApprovalMode)
    } catch { /* silent */ }
  }

  async function saveConfig(patch: { agentEnabled?: boolean; agentIntervalMins?: number; postApprovalMode?: 'auto' | 'approve' }) {
    setConfigSaving(true)
    try {
      await updateAgentConfig(influencer._id, patch)
      if (patch.agentEnabled !== undefined) setAgentEnabled(patch.agentEnabled)
      if (patch.agentIntervalMins !== undefined) setIntervalMins(patch.agentIntervalMins)
      if (patch.postApprovalMode !== undefined) setApprovalMode(patch.postApprovalMode)
    } catch { /* silent */ }
    finally { setConfigSaving(false) }
  }

  async function handleGenerate() {
    if (!prompt.trim()) { setError('Enter an appearance description first'); return }
    setGenerating(true); setError(null); setSelectedAvatarId(null)
    try {
      const { candidates: newCandidates, influencer: updated } = await generateAvatars(influencer._id, prompt.trim())
      setCandidates(newCandidates)
      onUpdated(updated)
    } catch (e) { setError(e instanceof Error ? e.message : 'Generation failed') }
    finally { setGenerating(false) }
  }

  async function handleSelect() {
    if (!selectedAvatarId) { setError('Select an avatar first'); return }
    if (!selectedVoiceId) { setError('Choose a voice before completing'); return }
    setSelecting(true); setError(null)
    try {
      const { influencer: updated } = await selectAvatar(influencer._id, selectedAvatarId, selectedVoiceId)
      onUpdated(updated)
      onComplete(updated)
    } catch (e) { setError(e instanceof Error ? e.message : 'Select failed') }
    finally { setSelecting(false) }
  }

  async function handlePostNow() {
    setPosting(true); setError(null); setSuccessMsg(null)
    try {
      await requestManualPost(influencer._id, { topic: `Latest in ${influencer.niche || 'my niche'}` })
      setSuccessMsg('Agent is generating your video and post — check the dashboard shortly.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to start post') }
    finally { setPosting(false) }
  }

  async function handleConnectX() {
    setError(null)
    try {
      const { authUrl } = await connectInfluencerX(influencer._id)
      window.location.href = authUrl
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not start X connection') }
  }

  async function handleDisconnectX() {
    setXDisconnecting(true); setError(null)
    try {
      await disconnectInfluencerX(influencer._id)
      setXStatus({ connected: false })
      onUpdated({ ...influencer, xConnectionId: null })
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to disconnect') }
    finally { setXDisconnecting(false) }
  }

  const displayCandidates = candidates.length > 0 ? candidates : []

  return (
    <div className="flex flex-col gap-7">
      <div>
        <p className="font-inter text-[10px] uppercase tracking-[0.28em] text-warm-grey mb-1">Step 3 of 3</p>
        <h2 className="font-playfair text-3xl text-charcoal">Avatar & Posting</h2>
        <p className="font-inter text-sm text-warm-grey mt-2">
          Describe your influencer's look — four realistic portrait options will be generated.
          Then connect an X account and configure how often the agent posts.
        </p>
      </div>

      {error && (
        <p className="font-inter text-[11px] text-red-600 border border-red-200 bg-red-50 px-4 py-3">{error}</p>
      )}
      {successMsg && (
        <p className="font-inter text-[11px] text-charcoal border border-gold/40 bg-gold/5 px-4 py-3">{successMsg}</p>
      )}

      {/* ── Appearance prompt ── */}
      <div className="flex flex-col gap-1.5">
        <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
          Appearance description
        </label>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. A 28-year-old South Asian woman with sleek black hair, minimal editorial make-up, wearing neutral luxury tones…"
          rows={3}
          className="border border-charcoal/15 bg-transparent px-4 py-3 font-inter text-sm text-charcoal placeholder-warm-grey/40 resize-none focus:outline-none focus:border-charcoal/40 transition-colors"
        />
        <button onClick={handleGenerate} disabled={generating || !prompt.trim()}
          className="self-end group relative overflow-hidden inline-flex items-center h-10 px-8 border border-charcoal text-charcoal font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40 hover:text-white transition-colors duration-300 mt-1">
          <span className="absolute inset-0 bg-charcoal -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
          <span className="relative z-10">
            {generating ? 'Generating… (up to 2 min)' : displayCandidates.length > 0 ? 'Regenerate' : 'Generate 4 Avatars'}
          </span>
        </button>
      </div>

      {/* ── Generating state ── */}
      {generating && (
        <div className="border border-dashed border-charcoal/15 flex flex-col items-center justify-center py-16 gap-4">
          <div className="w-8 h-px bg-gold" />
          <p className="font-inter text-sm text-warm-grey">Generating your avatars…</p>
          <p className="font-inter text-[10px] text-warm-grey/50">Training 4 candidates in parallel. Usually 30–90 seconds.</p>
        </div>
      )}

      {/* ── Candidate grid ── */}
      {!generating && displayCandidates.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Select your avatar</p>
          <div className="grid grid-cols-2 gap-3">
            {displayCandidates.map((c, i) => (
              <button key={c.avatarId} type="button" onClick={() => setSelectedAvatarId(c.avatarId)}
                className={`relative aspect-square overflow-hidden border-2 transition-all duration-200 bg-taupe/40 ${selectedAvatarId === c.avatarId ? 'border-gold' : 'border-transparent hover:border-charcoal/30'}`}>
                {c.previewImageUrl
                  ? <img src={c.previewImageUrl} alt={`Avatar ${i + 1}`} className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center"><span className="font-inter text-[10px] text-warm-grey/50 uppercase tracking-[0.2em]">Preview pending</span></div>
                }
                {selectedAvatarId === c.avatarId && (
                  <div className="absolute inset-0 bg-charcoal/10 flex items-center justify-center">
                    <div className="w-6 h-6 bg-gold flex items-center justify-center">
                      <span className="text-white text-xs font-bold">✓</span>
                    </div>
                  </div>
                )}
                {c.previewVideoUrl && (
                  <a href={c.previewVideoUrl} target="_blank" rel="noopener noreferrer"
                    className="absolute bottom-2 right-2 bg-charcoal/80 text-white font-inter text-[8px] uppercase tracking-[0.15em] px-2 py-1"
                    onClick={e => e.stopPropagation()}>
                    Preview ▶
                  </a>
                )}
                <span className="absolute bottom-2 left-2 font-inter text-[9px] uppercase tracking-[0.15em] text-white bg-charcoal/60 px-2 py-0.5">{i + 1}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Voice picker ── */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <label className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">
            Voice
          </label>
          {/* Gender filter */}
          <div className="flex gap-1">
            {(['all', 'female', 'male'] as const).map(g => (
              <button key={g} type="button" onClick={() => setGenderFilter(g)}
                className={`font-inter text-[9px] uppercase tracking-[0.15em] px-3 py-1 border transition-colors ${genderFilter === g ? 'bg-charcoal text-white border-charcoal' : 'text-warm-grey border-charcoal/20 hover:border-charcoal/40'}`}>
                {g === 'all' ? 'All' : g === 'female' ? 'Female' : 'Male'}
              </button>
            ))}
          </div>
        </div>

        {voicesLoading ? (
          <p className="font-inter text-[11px] text-warm-grey animate-pulse">Loading voices…</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {voices
              .filter(v => genderFilter === 'all' || v.gender === genderFilter)
              .map(v => {
                const isSelected = selectedVoiceId === v.id
                const isPlaying = playingId === v.id
                return (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => setSelectedVoiceId(v.id)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 border text-left transition-all duration-150 ${isSelected ? 'border-gold bg-gold/5' : 'border-charcoal/10 hover:border-charcoal/30'}`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {isSelected
                        ? <div className="w-3 h-3 bg-gold flex-shrink-0 flex items-center justify-center"><span className="text-white text-[7px] font-bold">✓</span></div>
                        : <div className={`w-3 h-3 rounded-full flex-shrink-0 border-2 ${isSelected ? 'border-gold bg-gold' : 'border-charcoal/20'}`} />
                      }
                      <div className="min-w-0">
                        <p className="font-inter text-[12px] text-charcoal truncate">{v.name}</p>
                        <p className="font-inter text-[9px] uppercase tracking-[0.15em] text-warm-grey/60">{v.gender}</p>
                      </div>
                    </div>
                    {/* Play preview */}
                    <button
                      type="button"
                      onClick={e => { e.stopPropagation(); playPreview(v) }}
                      className={`flex-shrink-0 w-7 h-7 flex items-center justify-center border transition-colors ${isPlaying ? 'border-gold bg-gold text-white' : 'border-charcoal/20 text-warm-grey hover:border-charcoal/50 hover:text-charcoal'}`}
                      title={isPlaying ? 'Stop' : 'Preview voice'}
                    >
                      <span className="text-[10px]">{isPlaying ? '■' : '▶'}</span>
                    </button>
                  </button>
                )
              })}
          </div>
        )}

        {selectedVoiceId && (() => {
          const v = voices.find(x => x.id === selectedVoiceId)
          return v ? (
            <p className="font-inter text-[10px] text-warm-grey/70">
              Selected: <span className="text-charcoal">{v.name}</span>
            </p>
          ) : null
        })()}
      </div>

      {/* ── Existing avatar (resume) ── */}
      {!generating && displayCandidates.length === 0 && influencer.selectedImageUrl && (
        <div className="flex flex-col gap-3">
          <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">Current avatar</p>
          <div className="w-48 aspect-square border border-charcoal/10 overflow-hidden">
            <img src={influencer.selectedImageUrl} alt={influencer.name} className="w-full h-full object-cover" />
          </div>
          <p className="font-inter text-[11px] text-warm-grey">Regenerate to get new options, or continue.</p>
        </div>
      )}

      {/* ── X account ── */}
      <div className="border border-charcoal/10">
        <div className="px-6 py-4 border-b border-charcoal/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <svg viewBox="0 0 24 24" className="w-4 h-4 fill-charcoal" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey">X Account</p>
          </div>
          {xStatus?.connected && (
            <button onClick={handleDisconnectX} disabled={xDisconnecting}
              className="font-inter text-[9px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors">
              {xDisconnecting ? '…' : 'Disconnect'}
            </button>
          )}
        </div>
        <div className="px-6 py-5">
          {xLoading ? (
            <p className="font-inter text-[11px] text-warm-grey animate-pulse">Checking connection…</p>
          ) : xStatus?.connected ? (
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 bg-gold flex-shrink-0" />
              <p className="font-inter text-[12px] text-charcoal">
                @{xStatus.xUsername}
                {xStatus.xName && <span className="text-warm-grey ml-2">({xStatus.xName})</span>}
              </p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-4">
              <p className="font-inter text-sm text-warm-grey">Connect an X account to post as this influencer.</p>
              <button onClick={handleConnectX}
                className="group relative overflow-hidden flex-shrink-0 inline-flex items-center gap-2 h-9 px-5 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em]">
                <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                  style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
                <svg viewBox="0 0 24 24" className="relative z-10 w-3.5 h-3.5 fill-current" aria-hidden="true">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
                <span className="relative z-10">Connect X</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Agent schedule (only once complete) ── */}
      {isComplete && (
        <div className="border border-charcoal/10">
          <div className="px-6 py-4 border-b border-charcoal/10 flex items-center gap-4">
            <p className="font-inter text-[10px] uppercase tracking-[0.22em] text-warm-grey flex-1 min-w-0">Schedule</p>
            {/* Enable toggle */}
            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="font-inter text-[10px] text-warm-grey/70">
                {agentEnabled ? 'On' : 'Off'}
              </span>
              <button
                onClick={() => saveConfig({ agentEnabled: !agentEnabled })}
                disabled={configSaving}
                className={`w-10 h-5 rounded-full transition-colors relative flex-shrink-0 ${agentEnabled ? 'bg-charcoal' : 'bg-charcoal/20'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${agentEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          </div>
          <div className="px-6 py-5 flex flex-col gap-4">
            {/* Interval */}
            <div className="flex items-center justify-between gap-4">
              <label className="font-inter text-[11px] text-warm-grey">Post every</label>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={5} value={intervalMins}
                  onChange={e => setIntervalMins(Number(e.target.value))}
                  onBlur={e => saveConfig({ agentIntervalMins: Number(e.target.value) })}
                  className="w-16 border border-charcoal/15 bg-transparent px-3 py-1.5 font-inter text-sm text-charcoal text-center focus:outline-none focus:border-charcoal/40 transition-colors"
                />
                <span className="font-inter text-[11px] text-warm-grey">minutes</span>
              </div>
            </div>

            {/* Approval mode */}
            <div className="flex items-center justify-between gap-4">
              <label className="font-inter text-[11px] text-warm-grey">Post mode</label>
              <div className="flex gap-2">
                {(['auto', 'approve'] as const).map(mode => (
                  <button key={mode} onClick={() => saveConfig({ postApprovalMode: mode })}
                    className={`font-inter text-[9px] uppercase tracking-[0.15em] px-4 py-1.5 border transition-colors ${approvalMode === mode ? 'bg-charcoal text-white border-charcoal' : 'text-warm-grey border-charcoal/20 hover:border-charcoal/40'}`}>
                    {mode === 'auto' ? 'Auto-post' : 'Approve first'}
                  </button>
                ))}
              </div>
            </div>

            <p className="font-inter text-[10px] text-warm-grey/60">
              {approvalMode === 'auto'
                ? 'Agent posts immediately — check the dashboard to see what went live.'
                : 'Agent drafts content for your review before anything is posted.'}
            </p>

            {/* Generate & Post Now */}
            {xStatus?.connected && (
              <div className="pt-1 border-t border-charcoal/10 flex items-center justify-between gap-4">
                <p className="font-inter text-[11px] text-warm-grey">
                  Generate a post right now using the agent.
                </p>
                <button onClick={handlePostNow} disabled={posting}
                  className="group relative overflow-hidden flex-shrink-0 inline-flex items-center h-9 px-6 bg-charcoal text-white font-inter text-[9px] uppercase tracking-[0.18em] disabled:opacity-50">
                  <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
                    style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
                  <span className="relative z-10">{posting ? 'Starting…' : '▶ Post Now'}</span>
                </button>
              </div>
            )}

            {/* Link to dashboard */}
            {isComplete && (
              <button onClick={() => navigate(`/influencer/${influencer._id}`)}
                className="font-inter text-[10px] uppercase tracking-[0.18em] text-warm-grey hover:text-charcoal transition-colors self-start">
                Open agent dashboard →
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Complete ── */}
      <div className="flex items-center justify-between pt-2">
        <p className="font-inter text-[11px] text-warm-grey/60">
          {!selectedAvatarId && !influencer.heygenAvatarId
            ? 'Generate and select an avatar to finish.'
            : !selectedVoiceId
            ? 'Choose a voice to complete.'
            : 'Avatar & voice selected — ready to complete.'}
        </p>
        <button onClick={handleSelect} disabled={selecting || (!selectedAvatarId && !influencer.heygenAvatarId) || !selectedVoiceId}
          className="group relative overflow-hidden inline-flex items-center h-10 px-8 bg-charcoal text-white font-inter text-[10px] uppercase tracking-[0.22em] disabled:opacity-40">
          <span className="absolute inset-0 bg-gold -translate-x-full group-hover:translate-x-0 transition-transform duration-500"
            style={{ transitionTimingFunction: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' }} aria-hidden="true" />
          <span className="relative z-10">{selecting ? 'Saving…' : isComplete ? 'Update' : 'Complete Influencer'}</span>
        </button>
      </div>
    </div>
  )
}
